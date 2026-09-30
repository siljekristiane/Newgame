import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, WATER } from '../config/world';
import { buildSeabedDepth, buildWaterNormals, encodeDepth } from './water';
import { heightAt } from './terrain';

describe('seabed depth map', () => {
  it('encodes depth in 0.1 m steps, 0 on land, clamped at the maximum', () => {
    expect(encodeDepth(-5)).toBe(0);
    expect(encodeDepth(1.23)).toBe(12);
    expect(encodeDepth(100)).toBe(Math.round(WATER.maxDepth * 10));
  });

  it('matches the terrain: deep at sea, zero on land', () => {
    // Around the coast view: land at (50 500, 47 000), sea 1 km south.
    const res = 32;
    const size = 4_000;
    const map = buildSeabedDepth({ centerX: 50_500, centerZ: 47_000, size, resolution: res });
    const texel = (x: number, z: number) => {
      const i = Math.floor(((x - (50_500 - size / 2)) / size) * res);
      const j = Math.floor(((z - (47_000 - size / 2)) / size) * res);
      return map[j * res + i]!;
    };
    const cellCentre = (x: number, z: number) => {
      const c = size / res;
      return [Math.floor((x - 48_500) / c) * c + 48_500 + c / 2, Math.floor((z - 45_000) / c) * c + 45_000 + c / 2] as const;
    };
    for (const [x, z] of [[50_500, 47_000], [50_500, 46_000], [49_000, 45_500], [52_000, 48_500]] as const) {
      const [cx, cz] = cellCentre(x, z);
      expect(texel(x, z)).toBe(encodeDepth(SEA_LEVEL - heightAt(cx, cz)));
    }
    expect(Math.max(...map)).toBeGreaterThan(0);
    expect(Math.min(...map)).toBe(0);
  });
});

describe('wave normals', () => {
  it('are unit length, point up and tile', () => {
    const size = 32;
    const n = buildWaterNormals(size);
    for (let p = 0; p < size * size; p += 7) {
      const v = [0, 1, 2].map((c) => n[p * 4 + c]! / 127.5 - 1);
      expect(Math.hypot(...v)).toBeCloseTo(1, 1);
      expect(v[2]!).toBeGreaterThan(0.2);
    }
    // left and right columns are neighbours across the wrap
    let jump = 0;
    for (let y = 0; y < size; y++) jump += Math.abs(n[(y * size + size - 1) * 4 + 3]! - n[y * size * 4 + 3]!);
    expect(jump / size).toBeLessThan(40);
  });
});
