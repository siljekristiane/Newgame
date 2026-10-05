import { CHUNK_SIZE, LOD_LEVELS, NORMAL_SAMPLE_STEP, SEA_LEVEL, VEGETATION } from '../config/world';
import { grassColor, surfaceAt } from './biomes';
import { heightAt } from './terrain';
import { rasterizeClearing } from '../regions/stamps';

/**
 * Ground data for the grass around the player (pure, runs in a worker).
 *
 * Covers the player's chunk and its 8 neighbours on the LOD 0 grid, so the
 * grass shader can rebuild the exact triangle the player stands on
 * (ground.ts) and put every blade on the rendered ground.
 */

export const GRASS_PATCH_CHUNKS = 3;
/** Meters per texel of the grass mask (paths are 3 m wide). */
export const GRASS_MASK_CELL = 2;

export interface GrassPatch {
  /** Chunk of the patch's north-west corner. */
  cx0: number;
  cz0: number;
  /** Grid points per side (3 × 64 + 1). */
  side: number;
  /** heightAt at every LOD 0 grid point, row-major, row 0 = north. */
  heights: Float32Array;
  /** RGBA per grid point: grass colour (RGB, sRGB) and grass density (A). */
  ground: Uint8Array;
  /**
   * Where paths and plazas keep the grass off: maskSize² bytes over the whole
   * patch (row 0 = north), 255 = no grass. 1×1 of zero where there are none.
   */
  mask: Uint8Array;
  maskSize: number;
  /** False when nothing grows anywhere in the patch (open sea, bare rock): skip drawing. */
  hasGrass: boolean;
}

/** How much grass grows at a point: grass-covered, not steep, thinner on the forest floor, none under snow. */
export function grassDensity(height: number, slope: number, grassWeight: number, lush: number, snow = 0): number {
  if (height < SEA_LEVEL + VEGETATION.minHeight) return 0;
  const forestFloor = Math.min(1, Math.max(0, (lush - 0.6) / 0.15));
  const underSnow = Math.max(0, 1 - snow * 2.5);
  return Math.max(0, Math.min(1, grassWeight * 1.3 - 0.15)) * (1 - forestFloor * 0.5) * underSnow * (slope < 0.45 ? 1 : 0);
}

export function buildGrassPatch(cx: number, cz: number): GrassPatch {
  const segments = LOD_LEVELS[0].segments;
  const side = GRASS_PATCH_CHUNKS * segments + 1;
  const step = CHUNK_SIZE / segments;
  const cx0 = cx - 1;
  const cz0 = cz - 1;
  const heights = new Float32Array(side * side);
  const ground = new Uint8Array(side * side * 4);
  const e = NORMAL_SAMPLE_STEP;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      // Same arithmetic as buildChunk/gridHeightAt: chunk origin + index * step.
      const ci = Math.min(GRASS_PATCH_CHUNKS - 1, Math.floor(i / segments));
      const cj = Math.min(GRASS_PATCH_CHUNKS - 1, Math.floor(j / segments));
      const x = (cx0 + ci) * CHUNK_SIZE + (i - ci * segments) * step;
      const z = (cz0 + cj) * CHUNK_SIZE + (j - cj * segments) * step;
      const h = heightAt(x, z);
      heights[j * side + i] = h;
      const nx = heightAt(x - e, z) - heightAt(x + e, z);
      const nz = heightAt(x, z - e) - heightAt(x, z + e);
      const slope = 1 - (2 * e) / Math.hypot(nx, 2 * e, nz);
      const s = surfaceAt(x, z, h, slope);
      const o = (j * side + i) * 4;
      grassColor(s.lush, ground, o, 255);
      ground[o + 3] = Math.round(grassDensity(h, slope, s.grass, s.lush, s.snow) * 255);
    }
  }
  const size = GRASS_PATCH_CHUNKS * CHUNK_SIZE;
  const maskSize = Math.round(size / GRASS_MASK_CELL);
  const mask = new Uint8Array(maskSize * maskSize);
  const any = rasterizeClearing(mask, maskSize, cx0 * CHUNK_SIZE, cz0 * CHUNK_SIZE, GRASS_MASK_CELL);
  let hasGrass = false;
  for (let p = 3; p < ground.length && !hasGrass; p += 4) hasGrass = ground[p]! > 0;
  return any
    ? { cx0, cz0, side, heights, ground, mask, maskSize, hasGrass }
    : { cx0, cz0, side, heights, ground, mask: new Uint8Array(1), maskSize: 1, hasGrass };
}
