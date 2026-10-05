import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, VEGETATION } from '../config/world';
import { gridHeightAt } from './ground';
import { heightAt } from './terrain';
import { buildVegetation, isGiant, isTree, oldGrowthAt, PLANT_FIELDS, PLANT_STRIDE, plantDensity, snowOnPlants } from './vegetation';

const plantsOf = (data: Float32Array) => {
  const out: Array<{ x: number; z: number; y: number; kind: number; fade: number; morphY: number }> = [];
  for (let k = 0; k < data.length; k += PLANT_STRIDE) {
    const F = PLANT_FIELDS;
    out.push({ x: data[k + F.x]!, y: data[k + F.y]!, z: data[k + F.z]!, kind: data[k + F.kind]!, morphY: data[k + F.morphY]!, fade: data[k + F.fade]! });
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
    const trees = (cx: number, cz: number) => plantsOf(buildVegetation(cx, cz, 64, 32, false)).filter((p) => isTree(p.kind)).length;
    expect(trees(50, 50)).toBeGreaterThan(300); // wet lowland around the spawn
    expect(trees(50, 70)).toBe(0); // open sea
    // The summit itself (the highest snowy peak, ~1 070 m) stays above even the spruce's tree line.
    const summit = plantsOf(buildVegetation(34, 49, 64, 32, false)).filter((p) => isTree(p.kind) && Math.hypot(p.x - 500, p.z - 500) < 150);
    expect(summit.length).toBe(0);
    const d = [0, 0, 0, 0];
    plantDensity(50_000, 50_000, -10, 0, d);
    expect(d).toEqual([0, 0, 0, 0]);
    plantDensity(50_000, 50_000, 60, 0, d);
    expect(d.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    expect(d.length).toBe(4); // density classes: conifer, broadleaf, bush, rock
  });

  it('mixes tree shapes, gives every tree its own build, and puts snow where it is cold', () => {
    const data = buildVegetation(50, 50, 64, 32, false);
    const F = PLANT_FIELDS;
    const kinds = new Set<number>();
    const builds = new Set<string>();
    for (let o = 0; o < data.length; o += PLANT_STRIDE) {
      kinds.add(data[o + F.kind]!);
      if (isTree(data[o + F.kind]!)) builds.add(`${data[o + F.height]!.toFixed(3)},${data[o + F.width]!.toFixed(3)}`);
    }
    expect(kinds.has(0) && kinds.has(4)).toBe(true); // both spruce shapes in a mixed forest
    expect(builds.size).toBeGreaterThan(100);
    expect(snowOnPlants(10)).toBe(0);
    expect(snowOnPlants(-5)).toBe(1);
    expect(snowOnPlants(0)).toBeGreaterThan(0);
  });

  it('grows old growth in patches: giants only there, and they stay at LOD 1', () => {
    const F = PLANT_FIELDS;
    expect(oldGrowthAt(55_500, 52_500)).toBe(oldGrowthAt(55_500, 52_500));
    const fine = buildVegetation(55, 52, 64, 32, false);
    const coarse = buildVegetation(55, 52, 32, 16, true);
    const giants = (data: Float32Array) => {
      const out: string[] = [];
      for (let o = 0; o < data.length; o += PLANT_STRIDE) {
        if (!isGiant(data[o + F.kind]!)) continue;
        const x = 55_000 + data[o + F.x]!;
        const z = 52_000 + data[o + F.z]!;
        expect(oldGrowthAt(x, z)).toBeGreaterThan(0);
        expect(data[o + F.scale]!).toBeGreaterThanOrEqual(1.5);
        out.push(`${data[o + F.x]!.toFixed(2)},${data[o + F.z]!.toFixed(2)}`);
      }
      return out;
    };
    const g0 = giants(fine);
    expect(g0.length).toBeGreaterThan(50);
    expect(giants(coarse).sort()).toEqual(g0.sort()); // every giant is kept at LOD 1
  });
});
