import { TERRAIN_SHADOW } from '../config/world';
import { heightAt } from './terrain';

/**
 * Horizon angles for terrain shadows (pure, tested). For a point and each of
 * TERRAIN_SHADOW.directions compass directions, the steepest angle up to the
 * terrain within maxDistance: the sun lights the point only when it is higher
 * than the horizon in its direction. Stored as bytes (0 = flat, 255 = 90°).
 *
 * Direction k points along (cos θ, sin θ) in (x, z), θ = 2πk / directions;
 * the shader uses the same convention.
 */

const D = TERRAIN_SHADOW.directions;
const DIRS = Array.from({ length: D }, (_, k) => [Math.cos((2 * Math.PI * k) / D), Math.sin((2 * Math.PI * k) / D)] as const);
const STEPS: number[] = [];
for (let d = TERRAIN_SHADOW.firstStep; d <= TERRAIN_SHADOW.maxDistance; d *= TERRAIN_SHADOW.growth) STEPS.push(d);

// Far steps read a cached coarse height lattice: rays from nearby points cross
// the same distant ground, so most lookups are cache hits, and at that range a
// bilinear 100 m lattice changes the angle by far less than the shadow's softness.
const COARSE = TERRAIN_SHADOW.coarseCell;
const coarse = new Map<number, number>();
const coarseAt = (i: number, j: number): number => {
  const key = i * 131_072 + j;
  let h = coarse.get(key);
  if (h === undefined) {
    if (coarse.size > 400_000) coarse.clear();
    h = heightAt(i * COARSE, j * COARSE);
    coarse.set(key, h);
  }
  return h;
};
function coarseHeight(x: number, z: number): number {
  const fx = x / COARSE;
  const fz = z / COARSE;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = coarseAt(i, j);
  const b = coarseAt(i + 1, j);
  const c = coarseAt(i, j + 1);
  const d = coarseAt(i + 1, j + 1);
  return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * tz;
}

/** Horizon bytes for one point, written to out[o .. o + directions). */
export function horizonAt(x: number, z: number, out: Uint8Array, o = 0, h0 = heightAt(x, z)): void {
  for (let k = 0; k < D; k++) {
    const [dx, dz] = DIRS[k]!;
    let best = 0;
    for (const d of STEPS) {
      const px = x + dx * d;
      const pz = z + dz * d;
      const slope = ((d < TERRAIN_SHADOW.exactWithin ? heightAt(px, pz) : coarseHeight(px, pz)) - h0) / d;
      if (slope > best) best = slope;
    }
    out[o + k] = Math.round((Math.atan(best) / (Math.PI / 2)) * 255);
  }
}

/** Lattice size for a chunk of this many segments: full on LOD 0, coarser further out (cheaper; a subset of the same points). */
export function horizonGridSize(segments: number): number {
  return Math.max(2, Math.min(TERRAIN_SHADOW.grid, segments / 4));
}

// Grids recently traced in this thread, so a chunk changing LOD does not trace again.
const cache = new Map<string, Uint8Array>();
const CACHE_SIZE = 128;

/**
 * Horizon bytes on a (g + 1)² lattice over the square [x0, x0 + size]² (world-aligned,
 * so neighbouring chunks share their edge points).
 */
export function horizonGrid(x0: number, z0: number, size: number, g: number = TERRAIN_SHADOW.grid): Uint8Array {
  const key = `${x0},${z0},${size},${g}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const side = g + 1;
  const out = new Uint8Array(side * side * D);
  const step = size / g;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) horizonAt(x0 + i * step, z0 + j * step, out, (j * side + i) * D);
  }
  cache.set(key, out);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return out;
}

/**
 * Bilinear horizon at local (lx, lz) in a horizonGrid over `size` meters with g cells,
 * split into two 4-byte attributes (directions 0–3 and 4–7) at vertex v.
 */
export function sampleHorizon(grid: Uint8Array, size: number, g: number, lx: number, lz: number, a4: Uint8Array, b4: Uint8Array, v: number): void {
  const side = g + 1;
  const fx = Math.min(g, Math.max(0, (lx / size) * g));
  const fz = Math.min(g, Math.max(0, (lz / size) * g));
  const i0 = Math.min(g - 1, Math.floor(fx));
  const j0 = Math.min(g - 1, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const a = (j0 * side + i0) * D;
  const b = a + D;
  const c = a + side * D;
  const d = c + D;
  for (let k = 0; k < D; k++) {
    const top = grid[a + k]! + (grid[b + k]! - grid[a + k]!) * tx;
    const bottom = grid[c + k]! + (grid[d + k]! - grid[c + k]!) * tx;
    const value = Math.round(top + (bottom - top) * tz);
    if (k < 4) a4[v * 4 + k] = value;
    else b4[v * 4 + k - 4] = value;
  }
}
