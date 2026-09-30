import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, VEGETATION } from '../config/world';
import { gridHeightAt } from './ground';
import { heightAt } from './terrain';
import { buildVegetation, PLANT_KINDS, PLANT_STRIDE, plantDensity } from './vegetation';

const plantsOf = (data: Float32Array) => {
  const out: Array<{ x: number; z: number; y: number; kind: number; fade: number; morphY: number }> = [];
  for (let k = 0; k < data.length; k += PLANT_STRIDE) {
    out.push({ x: data[k]!, y: data[k + 1]!, z: data[k + 2]!, kind: data[k + 4]!, morphY: data[k + 5]!, fade: data[k + 7]! });
  }
  return out;
};

describe('vegetation', () => {
  it('is deterministic', () => {
    expect(buildVegetation(51, 46, 64, 32, false)).toEqual(buildVegetation(51, 46, 64, 32, false));
  });

  it('LOD 1 shows a subset of LOD 0; the rest are flagged to shrink away', () => {
    const fine = plantsOf(buildVegetation(50, 50, 64, 32, false));
    const coarse = plantsOf(buildVegetation(50, 50, 32, 16, true));
    expect(coarse.length).toBeGreaterThan(0);
    expect(coarse.length).toBeLessThan(fine.length);
    const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
    const fineByKey = new Map(fine.map((p) => [key(p), p]));
    for (const p of coarse) {
      const f = fineByKey.get(key(p));
      expect(f, 'coarse plant missing at LOD 0').toBeDefined();
      expect(f!.kind).toBe(p.kind);
      expect(f!.fade).toBe(0); // stays through the swap
      expect(p.fade).toBe(1); // LOD 2 has no plants, so LOD 1 shrinks everything
    }
    expect(fine.filter((p) => p.fade === 1).length).toBe(fine.length - coarse.length);
  });

  it('stands on the mesh it is built for and carries the coarser height', () => {
    for (const p of plantsOf(buildVegetation(37, 49, 64, 32, false))) {
      const x = 37 * CHUNK_SIZE + p.x;
      const z = 49 * CHUNK_SIZE + p.z;
      expect(p.y).toBeCloseTo(gridHeightAt(x, z, 64), 3);
      expect(p.morphY).toBeCloseTo(gridHeightAt(x, z, 32), 3);
      expect(heightAt(x, z)).toBeGreaterThanOrEqual(SEA_LEVEL + VEGETATION.minHeight);
    }
  });

  it('follows the biomes: forest is dense, the sea and high peaks are bare of trees', () => {
    const trees = (cx: number, cz: number) => plantsOf(buildVegetation(cx, cz, 64, 32, false)).filter((p) => p.kind <= 1).length;
    expect(trees(50, 50)).toBeGreaterThan(300); // wet lowland around the spawn
    expect(trees(50, 70)).toBe(0); // open sea
    expect(trees(34, 49)).toBe(0); // the peak, above the tree line
    const d = [0, 0, 0, 0];
    plantDensity(50_000, 50_000, -10, 0, d);
    expect(d).toEqual([0, 0, 0, 0]);
    plantDensity(50_000, 50_000, 60, 0, d);
    expect(d.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    expect(d.length).toBe(PLANT_KINDS.length);
  });
});
