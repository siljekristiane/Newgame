import { SEA_LEVEL, WATER, WORLD_SEED } from '../config/world';
import { heightAt } from './terrain';
import { tfbm } from './terrainTextures';

/**
 * Pure builders for the water surface (run in a worker, unit-tested).
 */

export interface SeabedRequest {
  /** World-space centre of the depth map. */
  centerX: number;
  centerZ: number;
  size: number;
  resolution: number;
}

/**
 * Water depth below sea level on a resolution² grid centred on (centerX,
 * centerZ), one byte per texel in 0.1 m steps (0 = land or shoreline).
 * Row 0 is the north (−Z) edge, column 0 the west (−X) edge.
 */
export function buildSeabedDepth({ centerX, centerZ, size, resolution }: SeabedRequest): Uint8Array {
  const out = new Uint8Array(resolution * resolution);
  const cell = size / resolution;
  const x0 = centerX - size / 2;
  const z0 = centerZ - size / 2;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const depth = SEA_LEVEL - heightAt(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
      out[j * resolution + i] = encodeDepth(depth);
    }
  }
  return out;
}

export function encodeDepth(depth: number): number {
  return Math.round(Math.min(WATER.maxDepth, Math.max(0, depth)) * 10);
}

/**
 * Tileable wave normals (RGB = xyz * 0.5 + 0.5, Z up) with the wave height in
 * alpha, used for foam breakup. Long swells plus finer chop.
 */
export function buildWaterNormals(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const S = WORLD_SEED + 900;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const swell = Math.sin((u * 3 + v * 2 + tfbm(u, v, 2, 2, S) * 0.5) * Math.PI * 2) * 0.35;
      heights[y * size + x] = swell + tfbm(u, v, 8, 4, S + 1) * 0.65;
    }
  }
  const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]!;
  // Height steps per texel shrink with resolution; scale so the look doesn't depend on it.
  const strength = size * 0.025;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      out[o] = Math.round((nx / len) * 127.5 + 127.5);
      out[o + 1] = Math.round((ny / len) * 127.5 + 127.5);
      out[o + 2] = Math.round((1 / len) * 127.5 + 127.5);
      out[o + 3] = Math.round(Math.min(1, Math.max(0, at(x, y) * 0.5 + 0.5)) * 255);
    }
  }
  return out;
}
