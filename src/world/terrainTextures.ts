import { WORLD_SEED } from '../config/world';
import { hash2 } from './noise';

/**
 * Procedural, tileable detail textures for the five surface materials, in the
 * same order as the weights: grass, dirt, rock, sand, snow.
 *
 * Pure (no three.js), so it runs in a worker and can be unit-tested.
 * - `albedo`: RGB is a *detail factor* around 1.0 (stored as factor / 2, so
 *   128 ≈ 1.0) that multiplies the biome colour; A is the height (0..1).
 *   Keeping the mean at 1.0 means textures add detail without shifting the
 *   biome colours or the minimap match.
 * - `normal`: tangent-space normal (RGB = xyz * 0.5 + 0.5, Z up); A is roughness.
 */

export const TERRAIN_LAYERS = ['grass', 'dirt', 'rock', 'sand', 'snow'] as const;
export type TerrainLayer = (typeof TERRAIN_LAYERS)[number];

export interface TerrainTextureSet {
  size: number;
  layers: number;
  albedo: Uint8Array;
  normal: Uint8Array;
}

interface LayerSpec {
  /** Height field 0..1 at tile coordinates u, v in [0, 1). */
  height: (u: number, v: number) => number;
  /** Detail colour factor (before mean normalisation) from height and position. */
  albedo: (h: number, u: number, v: number, out: number[]) => void;
  normalStrength: number;
  roughness: number;
}

// ---- tileable noise -------------------------------------------------------

/** Value noise that repeats every `period` lattice cells. */
function pnoise(x: number, y: number, period: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = (k: number) => ((k % period) + period) % period;
  const a = hash2(w(i), w(j), seed);
  const b = hash2(w(i + 1), w(j), seed);
  const c = hash2(w(i), w(j + 1), seed);
  const d = hash2(w(i + 1), w(j + 1), seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Tileable fbm over u, v in [0, 1): base frequency `freq` must be an integer. */
export function tfbm(u: number, v: number, freq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += pnoise(u * f, v * f, f, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Tileable cellular noise: distance to the nearest feature point, ~0..1. */
function tworley(u: number, v: number, freq: number, seed: number): number {
  const x = u * freq;
  const y = v * freq;
  const i = Math.floor(x);
  const j = Math.floor(y);
  let best = 9;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const ci = i + di;
      const cj = j + dj;
      const wi = ((ci % freq) + freq) % freq;
      const wj = ((cj % freq) + freq) % freq;
      const px = ci + hash2(wi, wj, seed);
      const py = cj + hash2(wi, wj, seed + 7);
      best = Math.min(best, Math.hypot(px - x, py - y));
    }
  }
  return Math.min(1, best);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---- the five materials ---------------------------------------------------

const S = WORLD_SEED + 500;

const LAYERS: Record<TerrainLayer, LayerSpec> = {
  grass: {
    // Dense blades over soft clumps.
    height: (u, v) => 0.55 * (tfbm(u, v, 48, 3, S) * 0.5 + 0.5) + 0.45 * (tfbm(u, v, 6, 3, S + 1) * 0.5 + 0.5),
    albedo: (h, u, v, out) => {
      const clump = tfbm(u, v, 5, 2, S + 2);
      const k = 0.7 + h * 0.6;
      out[0] = k * (1 + clump * 0.12);
      out[1] = k * (1 + clump * 0.04);
      out[2] = k * (1 - clump * 0.1);
    },
    normalStrength: 2.5,
    roughness: 0.95,
  },
  dirt: {
    // Pebbles in packed earth, with darker damp stains.
    height: (u, v) => {
      // Pebbles of varying size, gathered in patches rather than evenly spread.
      const size = 0.28 + 0.25 * (tfbm(u, v, 20, 2, S + 13) * 0.5 + 0.5);
      const patch = smooth(-0.3, 0.25, tfbm(u, v, 4, 3, S + 14));
      const pebbles = (1 - smooth(size * 0.5, size, tworley(u, v, 12, S + 10))) * patch;
      return 0.45 * pebbles + 0.55 * (tfbm(u, v, 16, 4, S + 11) * 0.5 + 0.5);
    },
    albedo: (h, u, v, out) => {
      const stain = tfbm(u, v, 4, 3, S + 12);
      const k = 0.8 + h * 0.35 + stain * 0.12;
      out[0] = k;
      out[1] = k * 0.97;
      out[2] = k * 0.93;
    },
    normalStrength: 4,
    roughness: 0.9,
  },
  rock: {
    // Layered strata cut by cracks.
    height: (u, v) => {
      const strata = Math.sin((v * 8 + tfbm(u, v, 3, 3, S + 20) * 0.6) * Math.PI * 2) * 0.5 + 0.5;
      const cracks = smooth(0.0, 0.12, Math.abs(tfbm(u, v, 6, 3, S + 21)));
      return (0.35 * strata + 0.65 * (tfbm(u, v, 8, 5, S + 22) * 0.5 + 0.5)) * (0.4 + 0.6 * cracks);
    },
    albedo: (h, u, v, out) => {
      const lichen = smooth(0.25, 0.6, tfbm(u, v, 5, 3, S + 23));
      const k = 0.55 + h * 0.8;
      out[0] = k * (1 - lichen * 0.08);
      out[1] = k * (1 + lichen * 0.06);
      out[2] = k * (1 - lichen * 0.12);
    },
    normalStrength: 7,
    roughness: 0.8,
  },
  sand: {
    // Wind ripples over fine grain.
    height: (u, v) => {
      const ripples = Math.sin((v * 12 + tfbm(u, v, 2, 2, S + 30) * 1.2) * Math.PI * 2) * 0.5 + 0.5;
      return 0.55 * ripples + 0.45 * (tfbm(u, v, 64, 2, S + 31) * 0.5 + 0.5);
    },
    albedo: (h, _u, _v, out) => {
      const k = 0.88 + h * 0.24;
      out[0] = k;
      out[1] = k;
      out[2] = k * 0.98;
    },
    normalStrength: 2,
    roughness: 0.9,
  },
  snow: {
    // Soft drifts with the odd sparkle.
    height: (u, v) => tfbm(u, v, 4, 4, S + 40) * 0.5 + 0.5,
    albedo: (h, u, v, out) => {
      const sparkle = pnoise(u * 128, v * 128, 128, S + 41) > 0.93 ? 0.1 : 0;
      const k = 0.94 + h * 0.1 + sparkle;
      out[0] = k;
      out[1] = k;
      out[2] = k * 1.01;
    },
    normalStrength: 1.2,
    roughness: 0.55,
  },
};

export function buildTerrainTextures(size = 256): TerrainTextureSet {
  const layers = TERRAIN_LAYERS.length;
  const albedo = new Uint8Array(size * size * 4 * layers);
  const normal = new Uint8Array(size * size * 4 * layers);
  const heights = new Float32Array(size * size);
  const factors = new Float32Array(size * size * 3);
  const rgb = [0, 0, 0];

  TERRAIN_LAYERS.forEach((name, layer) => {
    const spec = LAYERS[name];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const h = spec.height(u, v);
        heights[y * size + x] = h;
        spec.albedo(h, u, v, rgb);
        factors.set(rgb, (y * size + x) * 3);
      }
    }
    // Normalise each channel's mean to exactly 1.0 so detail never shifts the biome colour.
    const mean = [0, 0, 0];
    for (let p = 0; p < size * size; p++) for (let c = 0; c < 3; c++) mean[c]! += factors[p * 3 + c]!;
    for (let c = 0; c < 3; c++) mean[c]! /= size * size;

    const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]!;
    const base = layer * size * size * 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = y * size + x;
        const o = base + p * 4;
        for (let c = 0; c < 3; c++) albedo[o + c] = clampByte((factors[p * 3 + c]! / mean[c]!) * 127.5);
        albedo[o + 3] = clampByte(heights[p]! * 255);
        // Normal from the wrapped height field (central differences, in texels).
        const nx = (at(x - 1, y) - at(x + 1, y)) * spec.normalStrength;
        const ny = (at(x, y - 1) - at(x, y + 1)) * spec.normalStrength;
        const len = Math.hypot(nx, ny, 1);
        normal[o] = clampByte((nx / len) * 127.5 + 127.5);
        normal[o + 1] = clampByte((ny / len) * 127.5 + 127.5);
        normal[o + 2] = clampByte((1 / len) * 127.5 + 127.5);
        normal[o + 3] = clampByte(spec.roughness * 255);
      }
    }
  });

  return { size, layers, albedo, normal };
}

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
