import { describe, expect, it } from 'vitest';
import { GIANTS, SEA_LEVEL, SPAWN } from '../../config/world';
import { biomeAt, climateAt } from '../../world/biomes';
import { heightAt } from '../../world/terrain';
import { buildVegetation, isTree, PLANT_FIELDS, PLANT_STRIDE } from '../../world/vegetation';
import { createGiantGeometry } from './giantGeometry';
import { GIANT_KINDS, GIANT_TREES } from './layout';

const slopeAt = (x: number, z: number) => {
  const e = 20;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return 1 - (2 * e) / Math.hypot(dx, 2 * e, dz);
};

describe('giant trees', () => {
  it('stand on one circle, 60 km across, 72° apart', () => {
    expect(GIANT_TREES).toHaveLength(5);
    expect(GIANTS.radius * 2).toBe(60_000);
    const angles = GIANT_TREES.map((g) => {
      expect(Math.abs(Math.hypot(g.x - GIANTS.center.x, g.z - GIANTS.center.z) - GIANTS.radius)).toBeLessThan(1);
      return Math.atan2(g.z - GIANTS.center.z, g.x - GIANTS.center.x);
    });
    for (let k = 0; k < 5; k++) {
      let step = ((angles[(k + 1) % 5]! - angles[k]!) * 180) / Math.PI;
      step = ((step % 360) + 360) % 360;
      expect(step).toBeCloseTo(72, 6);
    }
  });

  it('stand on land, inside the world, in five different biomes that suit their kinds', () => {
    expect(new Set(GIANT_TREES.map((g) => g.kind)).size).toBe(5);
    for (const g of GIANT_TREES) {
      expect(g.x).toBeGreaterThan(1_000);
      expect(g.x).toBeLessThan(99_000);
      expect(g.z).toBeGreaterThan(1_000);
      expect(g.z).toBeLessThan(99_000);
      const h = heightAt(g.x, g.z);
      expect(h, g.id).toBeGreaterThan(SEA_LEVEL + 80);
      expect(slopeAt(g.x, g.z), g.id).toBeLessThan(0.25);
      expect(biomeAt(climateAt(g.x, g.z, h), h, slopeAt(g.x, g.z)), g.id).toBe(g.biome);
      expect(Math.hypot(g.x - SPAWN.x, g.z - SPAWN.z)).toBeGreaterThan(3_000);
    }
  });

  it('are ten lamp posts tall and stand free of normal trees', () => {
    for (const kind of GIANT_KINDS) {
      const parts = createGiantGeometry(kind);
      let top = 0;
      let tris = 0;
      for (const g of parts) {
        g.computeBoundingBox();
        top = Math.max(top, g.boundingBox!.max.y);
        tris += g.getAttribute('position').count / 3;
      }
      expect(top).toBeCloseTo(GIANTS.height, 3);
      expect(tris, kind).toBeLessThan(40_000);
    }
    const oak = GIANT_TREES[0]!;
    const cx = Math.floor(oak.x / 1000);
    const cz = Math.floor(oak.z / 1000);
    const data = buildVegetation(cx, cz, 64, 32, false);
    for (let o = 0; o < data.length; o += PLANT_STRIDE) {
      if (!isTree(data[o + PLANT_FIELDS.kind]!)) continue;
      const d = Math.hypot(cx * 1000 + data[o + PLANT_FIELDS.x]! - oak.x, cz * 1000 + data[o + PLANT_FIELDS.z]! - oak.z);
      expect(d).toBeGreaterThan(GIANTS.clearInner);
    }
  });
});
