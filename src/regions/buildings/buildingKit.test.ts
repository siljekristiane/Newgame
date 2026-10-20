import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../config/world';
import { buildingDistance, createBuildingGeometry } from './buildingKit';
import { DESIGNS } from './designs';
import { BUILDING_PARTS } from './kitParts';

describe('building kit', () => {
  it('builds every design: finite, within budget, standing on the pad', () => {
    for (const d of DESIGNS) {
      const g = createBuildingGeometry(d.spec, BUILDINGS.texScale);
      expect(g.triangles, d.id).toBeGreaterThan(500);
      expect(g.triangles, d.id).toBeLessThan(25_000);
      let maxY = -Infinity;
      let bad = 0;
      for (const part of BUILDING_PARTS) {
        const pos = g.parts[part].attributes.position!.array;
        for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i]!)) bad++;
        for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]!);
        g.parts[part].dispose();
      }
      expect(bad, d.id).toBe(0);
      expect(maxY, d.id).toBeCloseTo(g.height, 1);
      // Under the giant trees (37 m), over a lamp post.
      expect(g.height, d.id).toBeLessThan(37);
      expect(g.height, d.id).toBeGreaterThan(3.7);
    }
  });

  it('knows its footprint: inside every wing and tower, outside beyond them', () => {
    for (const d of DESIGNS) {
      for (const w of d.spec.wings) expect(buildingDistance(d.spec, w.x, w.z), d.id).toBeLessThan(0);
      for (const t of d.spec.towers ?? []) expect(buildingDistance(d.spec, t.x, t.z), d.id).toBeLessThan(0);
      expect(buildingDistance(d.spec, 200, 200), d.id).toBeGreaterThan(100);
    }
  });

  it('leaves out windows where another part covers the wall', () => {
    // A wing beside a tall neighbour that covers its right end: the glass of the
    // pair is less than the two built apart (the end windows are left out).
    const wing = { x: 0, z: 0, length: 12, width: 8, floors: 2 };
    const neighbour = { x: 9.5, z: 0, length: 8, width: 10, floors: 4 };
    const glass = (wings: Array<typeof wing>) => createBuildingGeometry({ wings }, BUILDINGS.texScale).parts.glass.attributes.position!.count;
    expect(glass([wing, neighbour])).toBeLessThan(glass([wing]) + glass([neighbour]));
  });
});
