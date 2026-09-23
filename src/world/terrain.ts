import { SEA_LEVEL, WORLD_SEED, WORLD_SIZE } from '../config/world';
import { hexToRgb, world } from '../design/tokens';
import { createNoise2D } from './noise';

/**
 * The terrain is a pure function of world position: heightAt(x, z) in meters.
 * Pure = it can run on the main thread (player grounding) and in workers
 * (chunk meshes, minimap) and always agree.
 */
const continent = createNoise2D(WORLD_SEED);
const mountains = createNoise2D(WORLD_SEED + 1);
const hills = createNoise2D(WORLD_SEED + 2);
const detail = createNoise2D(WORLD_SEED + 3);

function fbm(noise: (x: number, y: number) => number, x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** 0 at the world edge, 1 from 20 km inside it: the world ends in ocean. */
function edgeFalloff(x: number, z: number): number {
  const d = Math.min(x, z, WORLD_SIZE - x, WORLD_SIZE - z);
  const t = Math.min(1, Math.max(0, d / 20_000));
  return t * t * (3 - 2 * t);
}

export function heightAt(x: number, z: number): number {
  // Large landmasses (~100 km features), biased so most of the world is land.
  const c = fbm(continent, x / 90_000, z / 90_000, 4) + 0.25;
  // Mountain ranges only where the continent is high.
  const mountainMask = Math.max(0, c - 0.1) * 1.6;
  const ridge = 1 - Math.abs(fbm(mountains, x / 14_000, z / 14_000, 4));
  const m = ridge * ridge * mountainMask;
  const hill = fbm(hills, x / 2_500, z / 2_500, 3);
  const small = detail(x / 180, z / 180);

  const h = c * 220 + m * 900 + hill * 50 + small * 3;
  const edge = edgeFalloff(x, z);
  return h * edge + (1 - edge) * -120;
}

/** Height colours from the Duskwood World palette. */
const WATER_BED = hexToRgb(world.sandShade);
const SAND = hexToRgb(world.sand);
const MEADOW = hexToRgb(world.meadow);
const CANOPY = hexToRgb(world.canopy);
const PINE = hexToRgb(world.pine);
const STONE = hexToRgb(world.stone);
const IVORY = hexToRgb(world.ivory);

export function colorAt(height: number, x: number, z: number, out: Float32Array, offset: number): void {
  const jitter = detail(x / 60, z / 60) * 0.04;
  let c: readonly number[];
  if (height < SEA_LEVEL - 2) c = WATER_BED;
  else if (height < SEA_LEVEL + 6) c = SAND;
  else if (height < 70) c = jitter > 0.01 ? CANOPY : MEADOW;
  else if (height < 380) c = PINE;
  else if (height < 650) c = STONE;
  else c = IVORY;
  out[offset] = Math.min(1, c[0]! + jitter);
  out[offset + 1] = Math.min(1, c[1]! + jitter);
  out[offset + 2] = Math.min(1, c[2]! + jitter);
}
