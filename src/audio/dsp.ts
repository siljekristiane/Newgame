/**
 * Tiny offline DSP helpers (pure, no Web Audio): enough to synthesise short
 * sounds into Float32Arrays that become AudioBuffers.
 */

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

/** RBJ biquad, applied in place. */
export function biquad(x: Float32Array, type: FilterType, freq: number, q: number, sampleRate: number): Float32Array {
  const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const y = (b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Scales so the loudest sample is `peak` (silence stays silence). */
export function normalize(x: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i]! / max) * peak;
  return x;
}

/** Zero crossings per sample: a cheap brightness measure used by the tests. */
export function zeroCrossingRate(x: Float32Array): number {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 !== x[i]! < 0) n++;
  return n / x.length;
}
