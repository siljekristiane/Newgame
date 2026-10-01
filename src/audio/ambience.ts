import { AUDIO, WEATHER, WORLD_SEED } from '../config/world';
import { hash2, mulberry32 } from '../world/noise';
import { biquad, normalize } from './dsp';

/**
 * Wind and rain (pure, tested): how loud and how bright they are for the
 * current weather, the slow gusts, and a loopable rain texture.
 */

/** Smooth noise 0..1 over time (seconds), for gusts. */
export function gust(t: number): number {
  const s = WORLD_SEED + 2_100;
  const f = (x: number) => {
    const i = Math.floor(x);
    const u = x - i;
    const k = u * u * (3 - 2 * u);
    return hash2(i, 0, s) * (1 - k) + hash2(i + 1, 0, s) * k;
  };
  return f(t / 4) * 0.65 + f(t / 1.3 + 17) * 0.35;
}

/** Wind level (gain) and brightness (lowpass cutoff, Hz) for a wind speed (m/s) and height (m). */
export function windSound(speed: number, height: number, gustValue: number): { gain: number; cutoff: number } {
  const storm = Math.min(1, Math.max(0, speed / WEATHER.windStorm));
  const up = Math.max(0, height) / 1000 * AUDIO.wind.perKm;
  const gain = (AUDIO.wind.calm + AUDIO.wind.storm * storm + up) * (0.7 + 0.6 * gustValue);
  return { gain: Math.min(1, gain), cutoff: 250 + 900 * storm + 500 * gustValue * storm };
}

/** Rain and snow-hiss levels for a precipitation (0..1) and snow share (0..1). */
export function rainSound(precipitation: number, snow: number): { rain: number; snow: number } {
  const p = Math.min(1, Math.max(0, precipitation));
  return { rain: AUDIO.rain.gain * p * (1 - snow), snow: AUDIO.rain.snowGain * p * snow };
}

/**
 * A loopable rain texture: soft filtered hiss plus thousands of tiny drop
 * ticks. Drops near the end wrap round to the start, so the loop is seamless.
 */
export function synthRainLoop(sampleRate: number, seconds: number = AUDIO.rain.loopSeconds): Float32Array {
  const n = Math.round(sampleRate * seconds);
  const random = mulberry32(WORLD_SEED + 2_200);
  const hiss = new Float32Array(n);
  for (let i = 0; i < n; i++) hiss[i] = random() * 2 - 1;
  biquad(hiss, 'lowpass', 5500, 0.6, sampleRate);
  biquad(hiss, 'highpass', 400, 0.6, sampleRate);

  const drops = new Float32Array(n);
  const count = Math.round(seconds * 900);
  for (let d = 0; d < count; d++) {
    const start = Math.floor(random() * n);
    const len = Math.floor((0.004 + random() * 0.01) * sampleRate);
    const amp = random() ** 2;
    for (let i = 0; i < len; i++) drops[(start + i) % n]! += (random() * 2 - 1) * amp * Math.exp((-6 * i) / len);
  }
  biquad(drops, 'bandpass', 3000, 0.8, sampleRate);

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = hiss[i]! * 0.35 + drops[i]! * 0.9;
  return normalize(out, 0.8);
}

/** White noise (for the wind and snow layers), loopable. */
export function whiteNoise(sampleRate: number, seconds: number, seed: number): Float32Array {
  const random = mulberry32(seed);
  const out = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = random() * 2 - 1;
  return out;
}
