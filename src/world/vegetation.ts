import { CHUNK_SIZE, NORMAL_SAMPLE_STEP, SEA_LEVEL, SPAWN, VEGETATION, WORLD_SEED } from '../config/world';
import { climateAt, surfaceAt } from './biomes';
import { gridHeightAt } from './ground';
import { hash2 } from './noise';
import { heightAt } from './terrain';

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

export const PLANT_KINDS = ['conifer', 'broadleaf', 'bush', 'rock'] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];

/**
 * Floats per plant: localX, y, localZ, scale, kind (index in PLANT_KINDS),
 * morphY (height on the coarser mesh), rotation (radians), fade (1 = shrinks
 * to nothing as the chunk morphs toward the next LOD), tint (0..1).
 */
export const PLANT_STRIDE = 9;

const DENSITY_GRID = 16;
const KINDS = PLANT_KINDS.length;

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
  const trees = treeLine * soil * flatEnough * (VEGETATION.openTrees + VEGETATION.forestTrees * forest);
  // Spruce and pine in the cool north and up the slopes, leafy trees where it is warm.
  const conifer = Math.min(1, 0.2 + smooth(7.5, 3.5, temperature) * 0.8);
  out[o] = trees * conifer;
  out[o + 1] = trees * (1 - conifer);
  // Shrubs like the open, drier ground between the forests, and go higher than trees.
  const shrubLine = smooth(0, 2.5, temperature);
  out[o + 2] = shrubLine * soil * flatEnough * VEGETATION.bushes * (0.3 + 0.7 * (1 - forest)) * smooth(0.15, 0.4, s.lush);
  // Boulders where stone shows, but not on cliffs (they would hang in the air).
  out[o + 3] = VEGETATION.rocks * (s.rock + s.dirt * 0.15) * (1 - smooth(0.4, 0.6, slope)) * (1 - s.snow * 0.7);
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

      const keep = hash2(gi, gj, seed + 3) < VEGETATION.coarseKeep[kind]!;
      if (coarse && !keep) continue;

      const x = cx * CHUNK_SIZE + lx;
      const z = cz * CHUNK_SIZE + lz;
      // Not on the beach or in the water (checked on the true surface, so every LOD agrees).
      if (heightAt(x, z) < SEA_LEVEL + VEGETATION.minHeight) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < VEGETATION.spawnClearing) continue;
      const y = gridHeightAt(x, z, segments);
      const morphY = morphSegments ? gridHeightAt(x, z, morphSegments) : y;
      const scale = VEGETATION.scale[kind]! * (0.7 + hash2(gi, gj, seed + 4) * 0.6);
      const rotation = hash2(gi, gj, seed + 5) * Math.PI * 2;
      // LOD 1 drops everything before LOD 2 (no plants there); LOD 0 only what LOD 1 leaves out.
      const fade = coarse || !keep ? 1 : 0;
      out.push(lx, y, lz, scale, kind, morphY, rotation, fade, hash2(gi, gj, seed + 6));
    }
  }
  return new Float32Array(out);
}
