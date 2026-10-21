import { describe, expect, it } from 'vitest';
import { COLLISION } from '../config/world';
import { buildingById, distanceTo, standHeight, toWorld } from '../regions/buildings/placements';
import { spawnLayout } from '../regions/spawn/layout';
import { clearAlong, colliders, moveWithCollision } from './collision';

const R = COLLISION.playerRadius;
const academy = buildingById('academy');

/** Walks at `speed` m/s along (dx, dz) for `seconds`, 60 frames a second. */
function walk(x: number, z: number, dx: number, dz: number, speed: number, seconds: number) {
  const l = Math.hypot(dx, dz);
  let p = { x, z, nx: 0, nz: 0 };
  for (let i = 0; i < seconds * 60; i++) p = moveWithCollision(p.x, p.z, ((dx / l) * speed) / 60, ((dz / l) * speed) / 60);
  return p;
}

describe('collision', () => {
  it('has the buildings, the fountain, the lamps and the giant trees', () => {
    expect(colliders().length).toBeGreaterThan(7 + 1 + 5 + 20);
  });

  it('cannot walk into a building: stops at the wall', () => {
    const start = toWorld(academy, 0, 18, { x: 0, z: 0 });
    const end = walk(start.x, start.z, academy.x - start.x, academy.z - start.z, 8, 4);
    expect(distanceTo(academy, end.x, end.z)).toBeGreaterThan(R - 0.01);
    expect(distanceTo(academy, end.x, end.z)).toBeLessThan(R + 0.5);
  });

  it('slides along a wall when walking into it at an angle', () => {
    // In front of the hall's front wall, heading diagonally in and to the right (+X local).
    const start = toWorld(academy, 2, 7.5, { x: 0, z: 0 });
    const dir = toWorld(academy, 1, -1, { x: 0, z: 0 });
    const end = walk(start.x, start.z, dir.x - academy.x, dir.z - academy.z, 4, 1);
    const moved = Math.hypot(end.x - start.x, end.z - start.z);
    expect(moved).toBeGreaterThan(2); // kept going along the wall
    expect(distanceTo(academy, end.x, end.z)).toBeGreaterThan(R - 0.01);
  });

  it('fast travel does not tunnel through a building', () => {
    // One 0.1 s frame at 500 m/s, straight through the academy.
    const start = toWorld(academy, 0, 30, { x: 0, z: 0 });
    const far = toWorld(academy, 0, -60, { x: 0, z: 0 });
    const end = moveWithCollision(start.x, start.z, (far.x - start.x) * 0.55, (far.z - start.z) * 0.55);
    expect(distanceTo(academy, end.x, end.z)).toBeGreaterThan(R - 0.01);
    expect(end.nx !== 0 || end.nz !== 0).toBe(true);
  });

  it('keeps out of the fountain basin, and passes freely on open ground', () => {
    const { plaza } = spawnLayout();
    const end = walk(plaza.x, plaza.z + 15, 0, -1, 8, 3);
    expect(Math.hypot(end.x - plaza.x, end.z - plaza.z)).toBeGreaterThan(COLLISION.fountainRadius + R - 0.01);
    const free = moveWithCollision(20_000, 20_000, 3, -4);
    expect(free.x).toBe(20_003);
    expect(free.z).toBe(19_996);
    expect(free.nx).toBe(0);
  });

  it('a wall between player and camera shortens the view; a roof well below does not', () => {
    const front = toWorld(academy, 0, 14, { x: 0, z: 0 });
    const behind = toWorld(academy, 0, -14, { x: 0, z: 0 });
    const y = academy.y + 2;
    expect(clearAlong(front.x, y, front.z, behind.x, y, behind.z)).toBeLessThan(0.5);
    expect(clearAlong(front.x, y + 80, front.z, behind.x, y + 80, behind.z)).toBe(1);
  });

  it('the door steps can be climbed: standing on them lifts the player, beside them does not', () => {
    // The academy's door is in the middle of the front wall (local z = 6); steps run out 1.47 m.
    const onSteps = toWorld(academy, 0, 6 + 0.7, { x: 0, z: 0 });
    const beside = toWorld(academy, 5, 6 + 0.7, { x: 0, z: 0 });
    expect(standHeight(onSteps.x, onSteps.z)).toBeGreaterThan(academy.y + 0.2);
    expect(standHeight(onSteps.x, onSteps.z)).toBeLessThanOrEqual(academy.y + 0.9 + 1e-9);
    expect(standHeight(beside.x, beside.z)).toBe(-Infinity);
    // Walking up to the door ends on the steps, at the plinth's edge.
    const start = toWorld(academy, 0, 18, { x: 0, z: 0 });
    const end = walk(start.x, start.z, academy.x - start.x, academy.z - start.z, 8, 4);
    expect(standHeight(end.x, end.z)).toBeGreaterThan(academy.y);
  });
});
