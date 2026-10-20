import { describe, expect, it } from 'vitest';
import { BUILDINGS, SEA_LEVEL, SPAWN, SPAWN_AREA } from '../../config/world';
import { groundHeightAt } from '../../world/ground';
import { placeLamps } from '../spawn/furniture';
import { spawnLayout } from '../spawn/layout';
import { nearestPath, plazaDistance } from '../stamps';
import { buildingDistance } from './buildingKit';
import { distanceTo, placedBuildings, toLocal, toWorld, type PlacedBuilding } from './placements';

/** Points over a building's footprint, 1.5 m apart. */
function footprint(b: PlacedBuilding): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let lx = -b.radius; lx <= b.radius; lx += 1.5) {
    for (let lz = -b.radius; lz <= b.radius; lz += 1.5) {
      if (buildingDistance(b.design.spec, lx, lz) > 0) continue;
      out.push(toWorld(b, lx, lz, { x: 0, z: 0 }));
    }
  }
  return out;
}

describe('building placements', () => {
  const buildings = placedBuildings();

  it('places every site with its design, deterministically', () => {
    expect(buildings.map((b) => b.id)).toEqual(BUILDINGS.sites.map((s) => s.id));
    expect(new Set(buildings.map((b) => b.id)).size).toBe(buildings.length);
    const w = toWorld(buildings[1]!, 3, -2, { x: 0, z: 0 });
    const l = toLocal(buildings[1]!, w.x, w.z, { x: 0, z: 0 });
    expect(l.x).toBeCloseTo(3, 9);
    expect(l.z).toBeCloseTo(-2, 9);
  });

  it('keeps every building clear of the paths, lamps, plaza, start and each other', () => {
    const lamps = placeLamps(spawnLayout());
    for (const b of buildings) {
      const pts = footprint(b);
      expect(pts.length, b.id).toBeGreaterThan(10);
      let path = Infinity;
      let lamp = Infinity;
      let plaza = Infinity;
      let other = Infinity;
      let start = Infinity;
      for (const p of pts) {
        path = Math.min(path, nearestPath(p.x, p.z).distance);
        for (const l of lamps) lamp = Math.min(lamp, Math.hypot(l.x - p.x, l.z - p.z));
        plaza = Math.min(plaza, plazaDistance(p.x, p.z));
        start = Math.min(start, Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z));
        for (const o of buildings) if (o !== b) other = Math.min(other, distanceTo(o, p.x, p.z));
      }
      expect(path, `${b.id}: path`).toBeGreaterThan(SPAWN_AREA.pathWidth / 2 + 3);
      expect(lamp, `${b.id}: lamp`).toBeGreaterThan(4);
      expect(plaza, `${b.id}: plaza`).toBeGreaterThan(6);
      expect(start, `${b.id}: start`).toBeGreaterThan(12);
      expect(other, `${b.id}: other building`).toBeGreaterThan(8);
      expect(b.y, `${b.id}: on land`).toBeGreaterThan(SEA_LEVEL + 5);
    }
  });

  it('stands every building on a level pad: the drawn ground under its walls is at pad level', () => {
    for (const b of buildings) {
      let worst = 0;
      for (const p of footprint(b)) worst = Math.max(worst, Math.abs(groundHeightAt(p.x, p.z) - b.y));
      expect(worst, b.id).toBeLessThan(0.3);
    }
  });

  it('the door faces out: the front (local +Z) is clear of the building', () => {
    for (const b of buildings) {
      const front = toWorld(b, 0, 40, { x: 0, z: 0 });
      expect(distanceTo(b, front.x, front.z), b.id).toBeGreaterThan(5);
    }
  });
});
