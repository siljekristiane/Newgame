import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, LOD_LEVELS } from '../config/world';
import { buildGrassPatch } from './grass';
import { gridHeightAt } from './ground';
import { heightAt } from './terrain';

describe('grass patch', () => {
  const patch = buildGrassPatch(50, 50);
  const step = CHUNK_SIZE / LOD_LEVELS[0].segments;

  it('holds the exact LOD 0 grid heights around the player chunk', () => {
    expect(patch.side).toBe(3 * LOD_LEVELS[0].segments + 1);
    for (const [i, j] of [[0, 0], [64, 64], [100, 37], [192, 192]] as const) {
      expect(patch.heights[j * patch.side + i]).toBeCloseTo(heightAt(49_000 + i * step, 49_000 + j * step), 3);
    }
  });

  it('rebuilds the rendered triangle like gridHeightAt (what the shader does)', () => {
    const shaderHeight = (x: number, z: number) => {
      const u = (x - patch.cx0 * CHUNK_SIZE) / step;
      const v = (z - patch.cz0 * CHUNK_SIZE) / step;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const fx = u - i;
      const fz = v - j;
      const at = (a: number, b: number) => patch.heights[b * patch.side + a]!;
      if (fx + fz <= 1) return at(i, j) + (at(i + 1, j) - at(i, j)) * fx + (at(i, j + 1) - at(i, j)) * fz;
      const d = at(i + 1, j + 1);
      return d + (at(i, j + 1) - d) * (1 - fx) + (at(i + 1, j) - d) * (1 - fz);
    };
    for (const [x, z] of [[50_123.4, 50_456.7], [49_001.2, 50_999.9], [50_999.1, 49_500.5]] as const) {
      expect(shaderHeight(x, z)).toBeCloseTo(gridHeightAt(x, z, LOD_LEVELS[0].segments), 3);
    }
  });

  it('has grass in the meadows around the spawn and none in the sea', () => {
    let sum = 0;
    for (let p = 3; p < patch.ground.length; p += 4) sum += patch.ground[p]!;
    expect(sum / (patch.side * patch.side)).toBeGreaterThan(40);
    const sea = buildGrassPatch(1, 50); // open sea at the west edge
    expect(Math.max(...sea.ground.filter((_, k) => k % 4 === 3))).toBe(0);
  });
});
