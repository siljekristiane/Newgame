import { TERRAIN, WORLD_SEED, WORLD_SIZE } from '../config/world';
import { createNoise2D, type Noise2D } from './noise';

/**
 * The natural terrain, before hand-made regions are stamped in (see
 * terrain.ts). A pure function of world position, in meters.
 */
const continent = createNoise2D(WORLD_SEED);
const mountains = createNoise2D(WORLD_SEED + 1);
const hills = createNoise2D(WORLD_SEED + 2);
const detail = createNoise2D(WORLD_SEED + 3);
const warpX = createNoise2D(WORLD_SEED + 4);
const warpZ = createNoise2D(WORLD_SEED + 5);

export function fbm(noise: Noise2D, x: number, z: number, octaves: number): number {
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

/**
 * Ridged multifractal (Musgrave), 0..1. Each octave is weighted by the one
 * before it, so detail piles up on the ridges and valleys stay smooth: it
 * reads like eroded mountains, sharp crests over soft, wide valley floors.
 */
function ridged(noise: Noise2D, x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise(x * freq, z * freq));
    n *= n * weight;
    weight = Math.min(1, n * 2);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

/** 0 at the world edge, 1 from TERRAIN.coastWidth inside it: the world ends in ocean. */
function edgeFalloff(x: number, z: number): number {
  const d = Math.min(x, z, WORLD_SIZE - x, WORLD_SIZE - z);
  const t = Math.min(1, Math.max(0, d / TERRAIN.coastWidth));
  return t * t * (3 - 2 * t);
}

export function naturalHeightAt(x: number, z: number): number {
  // Bend the large shapes so coasts and ranges curve like real ones.
  const px = x + fbm(warpX, x / TERRAIN.warpScale, z / TERRAIN.warpScale, 3) * TERRAIN.warpStrength;
  const pz = z + fbm(warpZ, x / TERRAIN.warpScale, z / TERRAIN.warpScale, 3) * TERRAIN.warpStrength;

  // Large landmasses, biased so most of the world is land.
  const c = fbm(continent, px / TERRAIN.continentScale, pz / TERRAIN.continentScale, 4) + 0.25;
  // Mountain ranges only where the continent is high.
  const mountainMask = Math.min(1, Math.max(0, c - 0.1) * 1.6);
  const m = ridged(mountains, px / TERRAIN.mountainScale, pz / TERRAIN.mountainScale, 5) * mountainMask;
  // Rolling hills, flattened near the coast so beaches and lowlands stay gentle.
  const hill = fbm(hills, x / TERRAIN.hillScale, z / TERRAIN.hillScale, 3) * Math.min(1, Math.max(0.2, c * 2));
  const small = detail(x / TERRAIN.detailScale, z / TERRAIN.detailScale);

  const h = c * 220 + m * TERRAIN.mountainHeight + hill * 50 + small * 3;
  const edge = edgeFalloff(x, z);
  return h * edge + (1 - edge) * TERRAIN.oceanFloor;
}
