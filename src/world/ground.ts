import { CHUNK_SIZE, LOD_LEVELS } from '../config/world';
import { heightAt } from './terrain';

/**
 * Height of the terrain *as rendered*: the triangle mesh of a chunk built with
 * `segments` quads per side, not the smooth heightAt() it was sampled from.
 * Between grid points the two differ (up to ~10 m on sharp ridges), so anything
 * that stands on the ground must use this, or it floats or sinks in.
 *
 * Mirrors buildChunk exactly: same grid points (originX + i * step) and the
 * same diagonal (quad a-b-c-d split into a-c-b and b-c-d).
 */
export function gridHeightAt(x: number, z: number, segments: number): number {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const step = CHUNK_SIZE / segments;
  const u = (x - originX) / step;
  const v = (z - originZ) / step;
  const i = Math.min(segments - 1, Math.max(0, Math.floor(u)));
  const j = Math.min(segments - 1, Math.max(0, Math.floor(v)));
  const fx = u - i;
  const fz = v - j;

  const at = (gi: number, gj: number) => heightAt(originX + gi * step, originZ + gj * step);
  if (fx + fz <= 1) {
    const a = at(i, j);
    return a + (at(i + 1, j) - a) * fx + (at(i, j + 1) - a) * fz;
  }
  const d = at(i + 1, j + 1);
  return d + (at(i, j + 1) - d) * (1 - fx) + (at(i + 1, j) - d) * (1 - fz);
}

/** Height of the finest LOD, which is always what the player stands on. */
export function groundHeightAt(x: number, z: number): number {
  return gridHeightAt(x, z, LOD_LEVELS[0].segments);
}
