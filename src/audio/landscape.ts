import { AUDIO, SEA_LEVEL, WEATHER, WORLD_SEED } from '../config/world';
import { habitat } from '../tumbleweeds/sim';
import { biomeAt, climateAt } from '../world/biomes';
import { canopyAt, type Canopy } from '../world/canopy';
import { mulberry32 } from '../world/noise';
import { heightAt } from '../world/terrain';
import { biquad, normalize } from './dsp';

/**
 * The wind's voice per landscape (pure, tested): how much forest, mountain,
 * desert and coast there is round the player, how loud each layer is for the
 * wind, and the loopable textures (leaves, sand, surf) the layers play.
 */
export interface LandscapeMix {
  /** Tree cover round the player, 0..1. */
  forest: number;
  /** Height, exposure on a ridge, or bare alpine ground, 0..1. */
  mountain: number;
  /** Warm, dry land (as for tumbleweeds), 0..1. */
  desert: number;
  /** Nearness to the sea, low down, 0..1. */
  coast: number;
}

export interface LandscapeLevels {
  forest: number;
  mountain: number;
  desert: number;
  coast: number;
  /** Centre of the mountain howl, Hz (rises with the gusts). */
  howl: number;
}

const L = AUDIO.landscape;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const canopy: Canopy = { cover: 0, conifer: 0, snow: 0, old: 0 };
const DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos((k / 8) * Math.PI * 2), Math.sin((k / 8) * Math.PI * 2)] as const);
const RAYS = Array.from({ length: 12 }, (_, k) => [Math.cos((k / 12) * Math.PI * 2), Math.sin((k / 12) * Math.PI * 2)] as const);
const COAST_STEP = 30;

/** The landscape round (x, z): averaged over the spot and a ring, so it changes smoothly as you walk. */
export function landscapeMix(x: number, z: number, out: LandscapeMix = { forest: 0, mountain: 0, desert: 0, coast: 0 }): LandscapeMix {
  const h0 = heightAt(x, z);
  let forest = 0;
  let desert = 0;
  let bare = 0;
  for (let k = 0; k <= 8; k++) {
    const d = DIRS[k];
    const px = d ? x + d[0] * L.ring : x;
    const pz = d ? z + d[1] * L.ring : z;
    const h = d ? heightAt(px, pz) : h0;
    if (h < SEA_LEVEL) continue;
    forest += canopyAt(px, pz, h, 0.1, canopy).cover;
    desert += habitat(px, pz, h);
    const biome = biomeAt(climateAt(px, pz, h), h, 0.1);
    if (biome === 'alpine' || biome === 'snow') bare++;
  }
  out.forest = forest / 9;
  out.desert = desert / 9;

  // Mountain: high up, or standing proud of the land round about (a ridge or a top), or bare alpine ground.
  let around = 0;
  for (const [dx, dz] of DIRS) around += heightAt(x + dx * 3 * L.ring, z + dz * 3 * L.ring);
  const proud = h0 - around / 8;
  const M = L.mountain;
  out.mountain = Math.max(smooth(M.fromHeight, M.fullHeight, h0), smooth(0, M.ridge, proud) * smooth(40, 160, h0), (bare / 9) * 0.85);

  // Coast: distance to the sea along 12 rays, interpolated where a ray crosses the waterline
  // (continuous as you walk), then faded with height above the water.
  const C = L.coast;
  let sea = h0 < SEA_LEVEL ? 0 : C.reach;
  for (const [dx, dz] of RAYS) {
    let r0 = 0;
    let hPrev = h0;
    for (let r = COAST_STEP; r <= sea; r += COAST_STEP) {
      const h = heightAt(x + dx * r, z + dz * r);
      if (h < SEA_LEVEL) {
        sea = Math.min(sea, r0 + (COAST_STEP * (hPrev - SEA_LEVEL)) / (hPrev - h));
        break;
      }
      r0 = r;
      hPrev = h;
    }
  }
  out.coast = (1 - smooth(0, C.reach, sea)) * (1 - smooth(0, C.fadeHeight, h0 - SEA_LEVEL));
  return out;
}

/** Layer gains for a landscape mix, wind speed (m/s) and gust (0..1). */
export function landscapeLevels(mix: LandscapeMix, windSpeed: number, gustValue: number, out: LandscapeLevels = { forest: 0, mountain: 0, desert: 0, coast: 0, howl: 400 }): LandscapeLevels {
  const storm = Math.min(1, Math.max(0, windSpeed / WEATHER.windStorm));
  const wind = (calm: number) => calm + (1 - calm) * storm;
  out.forest = Math.min(1, L.forest.gain * mix.forest * wind(L.forest.calm) * (0.55 + 0.7 * gustValue));
  out.mountain = Math.min(1, L.mountain.gain * mix.mountain * wind(L.mountain.calm) * (0.3 + 1.0 * gustValue));
  out.desert = Math.min(1, L.desert.gain * mix.desert * wind(L.desert.calm) * (0.45 + 0.9 * gustValue * gustValue));
  // The sea is never still; a storm makes the surf heavier.
  out.coast = Math.min(1, L.coast.gain * mix.coast * wind(L.coast.calm));
  out.howl = 300 + 340 * gustValue + 160 * storm;
  return out;
}

/** Noise for a loop, from a seed. */
function noise(n: number, seed: number): Float32Array {
  const random = mulberry32(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = random() * 2 - 1;
  return x;
}

/** Adds `count` short ticks round the loop (wrapping), each `minMs`–`maxMs` long. */
function sprinkle(x: Float32Array, count: number, minMs: number, maxMs: number, sampleRate: number, random: () => number, envelope?: (t: number) => number): void {
  const n = x.length;
  for (let k = 0; k < count; k++) {
    const start = Math.floor(random() * n);
    const len = Math.max(2, Math.floor(((minMs + random() * (maxMs - minMs)) / 1000) * sampleRate));
    const amp = (0.2 + random() * 0.8) * (envelope ? envelope(start / n) : 1);
    for (let i = 0; i < len; i++) x[(start + i) % n]! += (random() * 2 - 1) * amp * (1 - i / len);
  }
}

/**
 * Leaves in the wind: a soft, airy hiss with thousands of tiny leaf flutters
 * that come and go in waves (whole cycles over the loop, so it is seamless).
 */
export function synthLeavesLoop(sampleRate: number, seconds: number = L.loopSeconds): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const random = mulberry32(WORLD_SEED + 2_700);
  const swell = (t: number) => 0.55 + 0.45 * Math.sin(2 * Math.PI * (3 * t + 0.2)) * Math.sin(2 * Math.PI * (2 * t));
  const hiss = biquad(noise(n, WORLD_SEED + 2_701), 'bandpass', 1800, 0.5, sampleRate);
  const flutter = new Float32Array(n);
  sprinkle(flutter, Math.round(seconds * 1400), 1, 6, sampleRate, random, swell);
  biquad(flutter, 'bandpass', 3400, 0.7, sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = hiss[i]! * 0.45 * swell(i / n) + flutter[i]! * 0.6;
  return normalize(out, 0.8);
}

/**
 * Sand on the wind: a fine, high hiss with dense grain ticks, in slow drifts.
 */
export function synthSandLoop(sampleRate: number, seconds: number = L.loopSeconds): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const random = mulberry32(WORLD_SEED + 2_710);
  const drift = (t: number) => 0.6 + 0.4 * Math.sin(2 * Math.PI * (2 * t + 0.6)) * Math.sin(2 * Math.PI * (5 * t));
  const hiss = biquad(noise(n, WORLD_SEED + 2_711), 'highpass', 3800, 0.6, sampleRate);
  const grains = new Float32Array(n);
  sprinkle(grains, Math.round(seconds * 2600), 0.2, 1, sampleRate, random, drift);
  biquad(grains, 'highpass', 5000, 0.7, sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = hiss[i]! * 0.4 * drift(i / n) + grains[i]! * 0.5;
  return normalize(out, 0.8);
}

/**
 * Surf: a low, constant rumble, and waves that swell, break and wash back up the
 * beach with a fizzing tail, at uneven intervals. Waves near the end wrap
 * round to the start, so the loop is seamless.
 */
export function synthSurfLoop(sampleRate: number, seconds: number = L.surfSeconds): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const random = mulberry32(WORLD_SEED + 2_720);
  const rumble = biquad(noise(n, WORLD_SEED + 2_721), 'lowpass', 220, 0.6, sampleRate);
  const body = biquad(noise(n, WORLD_SEED + 2_722), 'lowpass', 1400, 0.5, sampleRate);
  const fizz = biquad(noise(n, WORLD_SEED + 2_723), 'highpass', 2500, 0.5, sampleRate);
  // Wave envelopes: swell (1.5 s up), break, then a long wash.
  const waveEnv = new Float32Array(n);
  const fizzEnv = new Float32Array(n);
  const waves = Math.max(2, Math.round(seconds / 7));
  for (let w = 0; w < waves; w++) {
    const at = ((w + 0.2 + random() * 0.6) / waves) * n;
    const size = 0.6 + random() * 0.4;
    const swell = 1.5 * sampleRate;
    const wash = (3.5 + random() * 2) * sampleRate;
    for (let i = -swell; i < wash; i++) {
      const j = ((Math.floor(at + i) % n) + n) % n;
      const e = i < 0 ? (1 + i / swell) ** 2 : Math.exp(-i / (0.25 * wash)) * (1 + 1.5 * Math.exp(-i / (0.08 * sampleRate)));
      waveEnv[j] = Math.max(waveEnv[j]!, e * size);
      if (i > 0) fizzEnv[j] = Math.max(fizzEnv[j]!, Math.exp(-i / (0.45 * wash)) * (1 - Math.exp(-i / (0.3 * sampleRate))) * size);
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rumble[i]! * 0.9 + body[i]! * waveEnv[i]! * 0.8 + fizz[i]! * fizzEnv[i]! * 0.35;
  return normalize(out, 0.85);
}
