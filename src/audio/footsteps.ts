import { AUDIO, SEA_LEVEL, SPAWN_AREA, WORLD_SEED } from '../config/world';
import { nearestPath, plazaDistance } from '../regions/stamps';
import { surfaceAt } from '../world/biomes';
import { heightAt } from '../world/terrain';
import { mulberry32 } from '../world/noise';
import { biquad, normalize } from './dsp';

/**
 * Footsteps (pure, tested): what the player walks on, how often a foot lands
 * at a given speed, and the synthesised step sound for each surface.
 */

export const STEP_SURFACES = ['grass', 'dirt', 'rock', 'sand', 'snow', 'gravel', 'paving', 'water'] as const;
export type StepSurface = (typeof STEP_SURFACES)[number];

/** Steps per second: a walking cadence that quickens toward a sprint; none when standing or fast-travelling. */
export function stepCadence(speed: number): number {
  if (speed < AUDIO.steps.minSpeed || speed > AUDIO.steps.maxSpeed) return 0;
  return Math.min(3.4, 1.7 + speed * 0.05);
}

/** The surface under the player at (x, z), standing at ground height `groundY`. */
export function surfaceUnderfoot(x: number, z: number, groundY: number): StepSurface {
  if (groundY <= SEA_LEVEL + 0.05) return 'water';
  if (plazaDistance(x, z) < 0) return 'paving';
  if (nearestPath(x, z).distance < SPAWN_AREA.pathWidth / 2) return 'gravel';
  const e = 2;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  const slope = 1 - (2 * e) / Math.hypot(dx, 2 * e, dz);
  const s = surfaceAt(x, z, groundY, slope);
  const weights: Array<[StepSurface, number]> = [
    ['grass', s.grass],
    ['dirt', s.dirt],
    ['rock', s.rock],
    ['sand', s.sand],
    ['snow', s.snow],
  ];
  return weights.reduce((best, w) => (w[1] > best[1] ? w : best))[0];
}

interface StepVoice {
  /** Length, seconds. */
  duration: number;
  /** Decay time constant of the noise body, seconds. */
  decay: number;
  filter: 'lowpass' | 'bandpass';
  freq: number;
  q: number;
  /** Low thump of the heel: frequency (Hz) and level. */
  thump: number;
  thumpLevel: number;
  /** Tiny crunch clicks (gravel, snow) spread over `grainSpread` seconds. */
  grains: number;
  grainSpread: number;
  /** Peak level relative to the loudest surface. */
  level: number;
}

const VOICES: Record<StepSurface, StepVoice> = {
  grass: { duration: 0.18, decay: 0.05, filter: 'lowpass', freq: 2200, q: 0.7, thump: 85, thumpLevel: 0.25, grains: 10, grainSpread: 0.08, level: 0.55 },
  dirt: { duration: 0.14, decay: 0.035, filter: 'lowpass', freq: 1300, q: 0.7, thump: 95, thumpLevel: 0.5, grains: 4, grainSpread: 0.04, level: 0.65 },
  rock: { duration: 0.1, decay: 0.014, filter: 'bandpass', freq: 2600, q: 1.8, thump: 130, thumpLevel: 0.45, grains: 2, grainSpread: 0.02, level: 0.8 },
  sand: { duration: 0.2, decay: 0.06, filter: 'lowpass', freq: 900, q: 0.6, thump: 70, thumpLevel: 0.2, grains: 6, grainSpread: 0.1, level: 0.5 },
  snow: { duration: 0.24, decay: 0.07, filter: 'bandpass', freq: 1900, q: 0.9, thump: 75, thumpLevel: 0.15, grains: 28, grainSpread: 0.16, level: 0.6 },
  gravel: { duration: 0.22, decay: 0.04, filter: 'bandpass', freq: 3800, q: 0.8, thump: 100, thumpLevel: 0.3, grains: 40, grainSpread: 0.15, level: 0.75 },
  paving: { duration: 0.09, decay: 0.012, filter: 'bandpass', freq: 3200, q: 3, thump: 150, thumpLevel: 0.55, grains: 1, grainSpread: 0.01, level: 0.85 },
  water: { duration: 0.38, decay: 0.12, filter: 'bandpass', freq: 1100, q: 0.7, thump: 60, thumpLevel: 0.2, grains: 14, grainSpread: 0.25, level: 0.7 },
};

/**
 * One footstep: a filtered noise burst for the sole, a short low sine for the
 * heel, and a scatter of tiny clicks for crunchy ground. `variant` picks the
 * randomness, so a few variants per surface never sound identical.
 */
export function synthFootstep(surface: StepSurface, variant: number, sampleRate: number): Float32Array {
  const v = VOICES[surface];
  const random = mulberry32(WORLD_SEED + 2_000 + STEP_SURFACES.indexOf(surface) * 101 + variant * 7);
  const n = Math.round(v.duration * sampleRate);
  const body = new Float32Array(n);
  const attack = 0.003 * sampleRate;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / attack) * Math.exp(-t / v.decay);
    body[i] = (random() * 2 - 1) * env;
  }
  biquad(body, v.filter, v.freq * (0.9 + random() * 0.2), v.q, sampleRate);

  const grains = new Float32Array(n);
  for (let g = 0; g < v.grains; g++) {
    const start = Math.floor(random() * v.grainSpread * sampleRate);
    const len = Math.floor((0.002 + random() * 0.004) * sampleRate);
    const amp = 0.3 + random() * 0.7;
    for (let i = 0; i < len && start + i < n; i++) grains[start + i]! += (random() * 2 - 1) * amp * (1 - i / len);
  }
  biquad(grains, 'highpass', 1500, 0.7, sampleRate);

  const out = new Float32Array(n);
  const thumpLen = 0.05 * sampleRate;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const thump = i < thumpLen ? Math.sin(2 * Math.PI * v.thump * t) * Math.exp(-t / 0.015) * v.thumpLevel : 0;
    out[i] = body[i]! + grains[i]! * 0.5 + thump;
  }
  return normalize(out, 0.9 * v.level);
}
