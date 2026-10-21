import { describe, expect, it } from 'vitest';
import { landscapeLevels, landscapeMix, synthLeavesLoop, synthSandLoop, synthSurfLoop } from './landscape';
import { zeroCrossingRate } from './dsp';

// Fixed spots (the camera views of the same names; the beach is just below the shore view).
const OLD_GROWTH = { x: 55_500, z: 52_500 };
const PEAK = { x: 34_500, z: 49_500 };
const DESERT = { x: 52_000, z: 69_000 };
const SHORE = { x: 51_000, z: 46_680 };

const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

const dominant = (p: { x: number; z: number }) => {
  const m = landscapeMix(p.x, p.z);
  return (Object.keys(m) as (keyof typeof m)[]).reduce((a, b) => (m[b] > m[a] ? b : a));
};

describe('landscape wind', () => {
  it('knows forest, mountain, desert and coast from the land round the player', () => {
    expect(dominant(OLD_GROWTH)).toBe('forest');
    expect(dominant(PEAK)).toBe('mountain');
    expect(dominant(DESERT)).toBe('desert');
    expect(dominant(SHORE)).toBe('coast');
    expect(landscapeMix(PEAK.x, PEAK.z).mountain).toBeGreaterThan(0.8);
    expect(landscapeMix(DESERT.x, DESERT.z).desert).toBeGreaterThan(0.8);
    expect(landscapeMix(DESERT.x, DESERT.z).forest).toBeLessThan(0.2);
  });

  it('the coast fades with distance from the sea', () => {
    const at = landscapeMix(SHORE.x, SHORE.z).coast;
    expect(at).toBeGreaterThan(0.5);
    expect(landscapeMix(DESERT.x, DESERT.z).coast).toBeLessThan(at);
    expect(landscapeMix(PEAK.x, PEAK.z).coast).toBe(0);
  });

  it('changes smoothly as you walk', () => {
    let worst = 0;
    let prev = landscapeMix(SHORE.x, SHORE.z);
    // 2 km in 2 m steps, from the beach inland: up through forest, past the water's edge.
    for (let i = 1; i <= 1000; i++) {
      const m = landscapeMix(SHORE.x - i * 2, SHORE.z + i * 0.8);
      worst = Math.max(worst, Math.abs(m.forest - prev.forest), Math.abs(m.mountain - prev.mountain), Math.abs(m.desert - prev.desert), Math.abs(m.coast - prev.coast));
      prev = m;
    }
    expect(worst).toBeLessThan(0.15); // no layer snaps on or off
  });

  it('louder in a storm and in gusts; the surf never quite stops', () => {
    const mix = { forest: 1, mountain: 1, desert: 1, coast: 1 };
    const calm = landscapeLevels(mix, 0, 0.5);
    const storm = landscapeLevels(mix, 30, 0.5);
    for (const k of ['forest', 'mountain', 'desert', 'coast'] as const) {
      expect(storm[k]).toBeGreaterThan(calm[k]);
      expect(storm[k]).toBeLessThanOrEqual(1);
    }
    expect(calm.coast).toBeGreaterThan(0.2);
    expect(landscapeLevels(mix, 10, 0.9).mountain).toBeGreaterThan(landscapeLevels(mix, 10, 0.1).mountain);
    expect(landscapeLevels(mix, 10, 0.9).howl).toBeGreaterThan(landscapeLevels(mix, 10, 0.1).howl);
    expect(landscapeLevels({ forest: 0, mountain: 0, desert: 0, coast: 0 }, 30, 1)).toMatchObject({ forest: 0, mountain: 0, desert: 0, coast: 0 });
  });

  it('textures: leaves and sand are bright, surf is dark and slow; all loop at full length', () => {
    const rate = 16_000;
    const leaves = synthLeavesLoop(rate, 2);
    const sand = synthSandLoop(rate, 2);
    const surf = synthSurfLoop(rate, 14);
    expect(leaves.length).toBe(2 * rate);
    expect(surf.length).toBe(14 * rate);
    for (const x of [leaves, sand, surf]) {
      expect(peak(x)).toBeGreaterThan(0.7);
      expect(x.every(Number.isFinite)).toBe(true);
    }
    expect(zeroCrossingRate(sand)).toBeGreaterThan(zeroCrossingRate(leaves));
    expect(zeroCrossingRate(leaves)).toBeGreaterThan(zeroCrossingRate(surf));
    // Waves: the surf's loudness swells and falls (1 s windows differ a lot).
    const rms: number[] = [];
    for (let s = 0; s < 14; s++) {
      let sum = 0;
      for (let i = s * rate; i < (s + 1) * rate; i++) sum += surf[i]! ** 2;
      rms.push(Math.sqrt(sum / rate));
    }
    expect(Math.max(...rms) / Math.min(...rms)).toBeGreaterThan(1.8);
  });
});
