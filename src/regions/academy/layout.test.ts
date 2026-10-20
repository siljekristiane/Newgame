import { describe, expect, it } from 'vitest';
import { ACADEMY, SEA_LEVEL, SPAWN_AREA } from '../../config/world';
import { groundHeightAt } from '../../world/ground';
import { placeLamps } from '../spawn/furniture';
import { spawnLayout } from '../spawn/layout';
import { nearestPath, plazaDistance } from '../stamps';
import { createAcademyGeometry, ACADEMY_PARTS } from './academyGeometry';
import { academyDistance, academyLayout, toLocal, toWorld } from './layout';

/** Points over the footprint (hall, tower and steps), 1 m apart. */
function footprint(): Array<{ x: number; z: number }> {
  const { hall, tower } = ACADEMY;
  const out: Array<{ x: number; z: number }> = [];
  for (let lx = -hall.width / 2 - tower.radius; lx <= hall.width / 2; lx += 1) {
    for (let lz = -hall.depth / 2; lz <= hall.depth / 2 + tower.radius; lz += 1) {
      const p = toWorld(lx, lz, { x: 0, z: 0 });
      if (academyDistance(p.x, p.z) <= 0) out.push(p);
    }
  }
  return out;
}

describe('academy layout', () => {
  it('faces the plaza from beside it, clear of its edge', () => {
    const a = academyLayout();
    const { plaza } = spawnLayout();
    // The door (local +Z) points at the plaza centre.
    const door = toWorld(0, 10, { x: 0, z: 0 });
    expect(Math.hypot(door.x - plaza.x, door.z - plaza.z)).toBeLessThan(Math.hypot(a.x - plaza.x, a.z - plaza.z));
    for (const p of footprint()) expect(plazaDistance(p.x, p.z)).toBeGreaterThan(5);
    expect(a.y).toBeGreaterThan(SEA_LEVEL + 5);
  });

  it('local and world frames round-trip', () => {
    const w = toWorld(3, -2, { x: 0, z: 0 });
    const l = toLocal(w.x, w.z, { x: 0, z: 0 });
    expect(l.x).toBeCloseTo(3, 9);
    expect(l.z).toBeCloseTo(-2, 9);
  });

  it('keeps clear of the paths and the lamps', () => {
    const lamps = placeLamps(spawnLayout());
    for (const p of footprint()) {
      expect(nearestPath(p.x, p.z).distance).toBeGreaterThan(SPAWN_AREA.pathWidth / 2 + 3);
      for (const l of lamps) expect(Math.hypot(l.x - p.x, l.z - p.z)).toBeGreaterThan(3);
    }
  });

  it('stands on a level pad: the drawn ground under the walls is at pad level', () => {
    const { y } = academyLayout();
    for (const p of footprint()) expect(Math.abs(groundHeightAt(p.x, p.z) - y)).toBeLessThan(0.3);
  });

  it('builds within budget, finite, from the pad up to the tower tip', () => {
    const g = createAcademyGeometry();
    expect(g.triangles).toBeLessThan(25_000);
    expect(g.triangles).toBeGreaterThan(1_000);
    let maxY = -Infinity;
    for (const part of ACADEMY_PARTS) {
      const pos = g.parts[part].attributes.position!.array;
      const uv = g.parts[part].attributes.uv!.array;
      for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]!)).toBe(true);
      for (let i = 0; i < uv.length; i++) expect(Number.isFinite(uv[i]!)).toBe(true);
      for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]!);
      g.parts[part].dispose();
    }
    expect(maxY).toBeCloseTo(g.height, 3);
    // Five or six lamp posts tall, well under the giant trees.
    expect(g.height).toBeGreaterThan(18);
    expect(g.height).toBeLessThan(25);
  });
});
