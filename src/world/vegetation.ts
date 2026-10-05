import { CHUNK_SIZE, NORMAL_SAMPLE_STEP, OLD_GROWTH, SEA_LEVEL, SPAWN, VEGETATION, WORLD_SEED } from '../config/world';
import { climateAt, surfaceAt } from './biomes';
import { gridHeightAt } from './ground';
import { horizonGrid, horizonGridSize, sampleHorizon } from './horizon';
import { createNoise2D, hash2 } from './noise';
import { fbm } from './terrain';
import { heightAt } from './terrain';
import { clearing } from '../regions/stamps';

/**
 * Where trees, bushes and boulders grow. Pure and deterministic: the same
 * chunk always gets the same plants, at every LOD.
 *
 * - A coarse density grid per chunk (DENSITY_GRID² samples) says how likely
 *   each kind is, from climate, surface materials and slope (world/biomes.ts).
 * - Candidates sit on a jittered grid of VEGETATION.cell meters; one hash per
 *   cell picks a kind (or nothing) from the interpolated densities.
 * - Existence never depends on the LOD, only on the chunk: LOD 1 shows a
 *   subset (`VEGETATION.coarseKeep`), and the plants it leaves out are flagged
 *   to shrink away while LOD 0 morphs toward LOD 1, so nothing pops.
 */

/**
 * Mesh kinds. The first four are also the density classes plantDensity()
 * works in; the variants after them take a share of their class's candidates,
 * so a forest is a mix of shapes rather than one tree repeated.
 */
export const PLANT_KINDS = ['conifer', 'broadleaf', 'bush', 'rock', 'conifer2', 'broadleaf2', 'giantConifer', 'giantBroadleaf'] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];
/** Density classes (conifer, broadleaf, bush, rock), the first entries of PLANT_KINDS. */
const DENSITY_KINDS = 4;
/** Variant mesh kind for each density class (or -1). */
const VARIANT_OF = [4, 5, -1, -1] as const;
/** Old-growth giant kind for each density class (or -1). */
const GIANT_OF = [6, 7, -1, -1] as const;
const TREE_KINDS: ReadonlySet<number> = new Set([0, 1, 4, 5, 6, 7]);
export const isGiant = (kind: number) => kind === 6 || kind === 7;

const oldGrowthNoise = createNoise2D(WORLD_SEED + 14);

/** How much a point is old-growth forest (0..1), before asking whether trees grow there at all. */
export function oldGrowthAt(x: number, z: number): number {
  const n = fbm(oldGrowthNoise, x / OLD_GROWTH.noiseScale, z / OLD_GROWTH.noiseScale, 2);
  return smooth(OLD_GROWTH.threshold, OLD_GROWTH.threshold + OLD_GROWTH.edge, n);
}
export const isTree = (kind: number) => TREE_KINDS.has(kind);

/**
 * Where each value sits in a plant's floats: chunk-local position, scale,
 * kind (index in PLANT_KINDS), morphY (height on the coarser mesh), rotation
 * (radians), fade (1 = shrinks to nothing as the chunk morphs toward the next
 * LOD), tint (0..1), height and width factors and a lean (radians, toward
 * leanDir) so no two trees match, snow cover (0..1, from the temperature),
 * then the terrain-shadow horizon where it stands (8 values 0..1, world/horizon.ts).
 */
export const PLANT_FIELDS = {
  x: 0,
  y: 1,
  z: 2,
  scale: 3,
  kind: 4,
  morphY: 5,
  rotation: 6,
  fade: 7,
  tint: 8,
  height: 9,
  width: 10,
  lean: 11,
  leanDir: 12,
  snow: 13,
  horizon: 14,
} as const;
export const PLANT_STRIDE = PLANT_FIELDS.horizon + 8;

const DENSITY_GRID = 16;
const KINDS = DENSITY_KINDS;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Probability per candidate cell of each kind (same order as PLANT_KINDS) at a
 * point with the given height and slope (1 − normal.y). Sum ≤ 1.
 */
export function plantDensity(x: number, z: number, height: number, slope: number, out: Float32Array | number[], o = 0): void {
  for (let k = 0; k < KINDS; k++) out[o + k] = 0;
  if (height < SEA_LEVEL + VEGETATION.minHeight) return;
  const { temperature } = climateAt(x, z, height);
  const s = surfaceAt(x, z, height, slope);
  const soil = s.grass + s.dirt * 0.4;
  const treeLine = smooth(VEGETATION.treeLineTemperature - 1.5, VEGETATION.treeLineTemperature + 1.5, temperature);
  const flatEnough = 1 - smooth(0.22, 0.34, slope);
  const forest = smooth(0.5, 0.72, s.lush);
  // Old growth: denser stands inside the forests.
  const stand = flatEnough * (VEGETATION.openTrees + VEGETATION.forestTrees * forest * (1 + OLD_GROWTH.denser * oldGrowthAt(x, z) * forest));
  // Spruce and pine in the cool north and up the slopes, leafy trees where it is warm.
  // Spruce also goes on into the snow (taiga): a colder tree line, and snowy ground counts as soil.
  const conifer = Math.min(1, 0.2 + smooth(7.5, 3.5, temperature) * 0.8);
  const coniferLine = smooth(VEGETATION.coniferLineTemperature - 1, VEGETATION.coniferLineTemperature + 1, temperature);
  out[o] = coniferLine * (soil + s.snow * VEGETATION.snowSoil) * stand * conifer;
  out[o + 1] = treeLine * soil * stand * (1 - conifer);
  // Shrubs like the open, drier ground between the forests, and go higher than trees.
  const shrubLine = smooth(0, 2.5, temperature);
  out[o + 2] = shrubLine * soil * flatEnough * VEGETATION.bushes * (0.3 + 0.7 * (1 - forest)) * smooth(0.15, 0.4, s.lush);
  // Boulders where stone shows, but not on cliffs (they would hang in the air).
  out[o + 3] = VEGETATION.rocks * (s.rock + s.dirt * 0.15) * (1 - smooth(0.4, 0.6, slope)) * (1 - s.snow * 0.7);
}

/** Snow lying on branches and boulders (0..1) at a temperature, °C. */
export function snowOnPlants(temperature: number): number {
  return smooth(VEGETATION.snowFrom, VEGETATION.snowFull, temperature);
}

/** Density samples on a (DENSITY_GRID + 1)² grid over the chunk, KINDS floats each. */
function densityGrid(cx: number, cz: number): Float32Array {
  const side = DENSITY_GRID + 1;
  const out = new Float32Array(side * side * KINDS);
  const step = CHUNK_SIZE / DENSITY_GRID;
  const e = NORMAL_SAMPLE_STEP;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const x = cx * CHUNK_SIZE + i * step;
      const z = cz * CHUNK_SIZE + j * step;
      const h = heightAt(x, z);
      const nx = heightAt(x - e, z) - heightAt(x + e, z);
      const nz = heightAt(x, z - e) - heightAt(x, z + e);
      const ny = 2 * e;
      const slope = 1 - ny / Math.hypot(nx, ny, nz);
      plantDensity(x, z, h, slope, out, (j * side + i) * KINDS);
    }
  }
  return out;
}

/**
 * Plants for one chunk. `segments` is the mesh they stand on (so they touch the
 * rendered ground), `morphSegments` the next coarser mesh (0 for none), and
 * `coarse` builds the thinned set shown at LOD 1.
 */
export function buildVegetation(cx: number, cz: number, segments: number, morphSegments: number, coarse: boolean): Float32Array {
  const grid = densityGrid(cx, cz);
  const side = DENSITY_GRID + 1;
  const cells = Math.round(CHUNK_SIZE / VEGETATION.cell);
  const out: number[] = [];
  const d = [0, 0, 0, 0];
  const hg = horizonGridSize(segments);
  const horizon = horizonGrid(cx * CHUNK_SIZE, cz * CHUNK_SIZE, CHUNK_SIZE, hg);
  const horA = new Uint8Array(4);
  const horB = new Uint8Array(4);
  const seed = WORLD_SEED + 1_000;

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      // Global cell indices: hashes stay the same whichever chunk asks.
      const gi = cx * cells + i;
      const gj = cz * cells + j;
      const lx = (i + 0.1 + hash2(gi, gj, seed) * 0.8) * VEGETATION.cell;
      const lz = (j + 0.1 + hash2(gi, gj, seed + 1) * 0.8) * VEGETATION.cell;

      // Bilinear density at the candidate.
      const fx = (lx / CHUNK_SIZE) * DENSITY_GRID;
      const fz = (lz / CHUNK_SIZE) * DENSITY_GRID;
      const i0 = Math.min(DENSITY_GRID - 1, Math.floor(fx));
      const j0 = Math.min(DENSITY_GRID - 1, Math.floor(fz));
      const tx = fx - i0;
      const tz = fz - j0;
      let total = 0;
      for (let k = 0; k < KINDS; k++) {
        const a = grid[(j0 * side + i0) * KINDS + k]!;
        const b = grid[(j0 * side + i0 + 1) * KINDS + k]!;
        const c = grid[((j0 + 1) * side + i0) * KINDS + k]!;
        const e = grid[((j0 + 1) * side + i0 + 1) * KINDS + k]!;
        d[k] = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
        total += d[k]!;
      }
      const r = hash2(gi, gj, seed + 2);
      if (r >= total) continue;
      let kind = 0;
      for (let acc = d[0]!; r >= acc && kind < KINDS - 1; ) acc += d[++kind]!;

      const klass = kind;
      const x = cx * CHUNK_SIZE + lx;
      const z = cz * CHUNK_SIZE + lz;
      // In old growth a share of the trees are giants; they stay at LOD 1 so the patch shows from afar.
      const giant = GIANT_OF[klass]! >= 0 && hash2(gi, gj, seed + 12) < OLD_GROWTH.giantShare * oldGrowthAt(x, z);
      const keep = giant || hash2(gi, gj, seed + 3) < VEGETATION.coarseKeep[klass]!;
      if (coarse && !keep) continue;
      const variant = VARIANT_OF[klass]!;
      if (giant) kind = GIANT_OF[klass]!;
      else if (variant >= 0 && hash2(gi, gj, seed + 7) < VEGETATION.variantShare) kind = variant;

      // Not on the beach or in the water (checked on the true surface, so every LOD agrees).
      if (heightAt(x, z) < SEA_LEVEL + VEGETATION.minHeight) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < VEGETATION.spawnClearing) continue;
      if (clearing(x, z) > 0.5) continue; // paths and plazas
      const y = gridHeightAt(x, z, segments);
      const morphY = morphSegments ? gridHeightAt(x, z, morphSegments) : y;
      const [g0, g1] = OLD_GROWTH.giantScale;
      const scale = giant ? g0 + hash2(gi, gj, seed + 4) * (g1 - g0) : VEGETATION.scale[klass]! * (0.7 + hash2(gi, gj, seed + 4) * 0.6);
      // Each tree its own build: taller and slimmer or shorter and wider, leaning a little.
      const tree = isTree(kind);
      const heightK = tree ? 0.85 + hash2(gi, gj, seed + 8) * 0.35 : 1;
      const widthK = tree ? (0.9 + hash2(gi, gj, seed + 9) * 0.2) / Math.sqrt(heightK) : 1;
      const lean = tree ? hash2(gi, gj, seed + 10) ** 2 * VEGETATION.maxLean : 0;
      const leanDir = hash2(gi, gj, seed + 11) * Math.PI * 2;
      const snow = snowOnPlants(climateAt(x, z, y).temperature);
      const rotation = hash2(gi, gj, seed + 5) * Math.PI * 2;
      // LOD 1 drops everything before LOD 2 (no plants there); LOD 0 only what LOD 1 leaves out.
      const fade = coarse || !keep ? 1 : 0;
      sampleHorizon(horizon, CHUNK_SIZE, hg, lx, lz, horA, horB, 0);
      out.push(lx, y, lz, scale, kind, morphY, rotation, fade, hash2(gi, gj, seed + 6), heightK, widthK, lean, leanDir, snow);
      for (let k = 0; k < 4; k++) out.push(horA[k]! / 255);
      for (let k = 0; k < 4; k++) out.push(horB[k]! / 255);
    }
  }
  return new Float32Array(out);
}
