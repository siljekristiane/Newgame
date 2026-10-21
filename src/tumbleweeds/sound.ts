import { AUDIO, WORLD_SEED } from '../config/world';
import { biquad, normalize } from '../audio/dsp';
import { mulberry32 } from '../world/noise';

/**
 * Tumbleweed sounds (pure, tested): a loopable dry rustle (brittle twigs
 * scraping over sand and stones) and short crackles for bounces and kicks.
 */

/** Seconds of the rustle loop. */
const RUSTLE_SECONDS = 2.5;

/**
 * Loopable rustle: a soft, papery hiss with dense little twig ticks in uneven
 * bursts (the ball turning over). Ticks near the end wrap to the start, so the
 * loop is seamless.
 */
export function synthRustleLoop(sampleRate: number, seconds = RUSTLE_SECONDS): Float32Array {
  const random = mulberry32(WORLD_SEED + 9_500);
  const n = Math.round(seconds * sampleRate);
  const hiss = new Float32Array(n);
  for (let i = 0; i < n; i++) hiss[i] = random() * 2 - 1;
  biquad(hiss, 'bandpass', 2600, 0.6, sampleRate);

  const ticks = new Float32Array(n);
  // Bursts as the ball turns: 5–7 per second, each a cluster of ticks.
  const bursts = Math.round(seconds * (5 + random() * 2));
  for (let b = 0; b < bursts; b++) {
    const centre = random() * n;
    const count = 6 + Math.floor(random() * 14);
    const amp = 0.4 + random() * 0.6;
    for (let k = 0; k < count; k++) {
      const start = Math.floor(centre + (random() - 0.5) * 0.09 * sampleRate);
      const len = Math.floor((0.0008 + random() * 0.0025) * sampleRate);
      const a = amp * (0.3 + random() * 0.7);
      for (let i = 0; i < len; i++) {
        const j = (((start + i) % n) + n) % n;
        ticks[j]! += (random() * 2 - 1) * a * (1 - i / len);
      }
    }
  }
  biquad(ticks, 'highpass', 1800, 0.7, sampleRate);

  // Slow level wobble that is whole cycles over the loop (seamless).
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const wobble = 0.75 + 0.25 * Math.sin(2 * Math.PI * 3 * t) * Math.sin(2 * Math.PI * 2 * t + 1);
    out[i] = hiss[i]! * 0.35 * wobble + ticks[i]! * 0.8;
  }
  return normalize(out, 0.8);
}

/**
 * One crackle: a fast cluster of snapping twigs plus a soft, hollow thud, longer
 * for a hard kick. `variant` picks the randomness.
 */
export function synthCrackle(variant: number, sampleRate: number): Float32Array {
  const random = mulberry32(WORLD_SEED + 9_600 + variant * 13);
  const duration = 0.22 + random() * 0.08;
  const n = Math.round(duration * sampleRate);
  const snaps = new Float32Array(n);
  const count = 18 + Math.floor(random() * 16);
  for (let k = 0; k < count; k++) {
    // Most snaps early, a few late ones trailing off.
    const start = Math.floor(random() ** 2 * duration * 0.8 * sampleRate);
    const len = Math.floor((0.001 + random() * 0.004) * sampleRate);
    const a = (0.4 + random() * 0.6) * Math.exp(-start / sampleRate / 0.08);
    for (let i = 0; i < len && start + i < n; i++) snaps[start + i]! += (random() * 2 - 1) * a * (1 - i / len);
  }
  biquad(snaps, 'highpass', 1400, 0.7, sampleRate);
  biquad(snaps, 'lowpass', 9000, 0.7, sampleRate);

  const out = new Float32Array(n);
  const thudFreq = 140 + random() * 60;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const thud = Math.sin(2 * Math.PI * thudFreq * t) * Math.exp(-t / 0.02) * 0.35;
    out[i] = snaps[i]! + thud;
  }
  return normalize(out, 0.85);
}

/** How loud a crackle is for an impact of `strength` (m/s) at `distance` m (0..1). */
export function crackleLevel(strength: number, distance: number): number {
  const T = AUDIO.tumbleweeds;
  if (distance > T.hearing) return 0;
  const hard = Math.min(1, strength / 5);
  const near = 1 / (1 + (distance / 6) ** 2);
  return T.impactGain * (0.25 + 0.75 * hard) * near;
}
