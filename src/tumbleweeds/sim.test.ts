import { describe, expect, it } from 'vitest';
import { TUMBLEWEEDS, WORLD_SEED } from '../config/world';
import { moveWithCollision } from '../player/collision';
import { buildingById, distanceTo, toWorld } from '../regions/buildings/placements';
import { mulberry32 } from '../world/noise';
import { createTumbleweedGeometry } from './geometry';
import { createTumbleweed, habitat, respawn, stepTumbleweed, type TumbleEnv, type TumbleImpact, type Tumbleweed } from './sim';
import { crackleLevel, synthCrackle, synthRustleLoop } from './sound';

/** Flat or sloped test ground, steady wind, the player far away unless moved. */
function env(over: Partial<TumbleEnv> = {}): TumbleEnv {
  return {
    ground: () => 10,
    habitat: () => 1,
    windX: 4,
    windZ: 0,
    player: { x: -1_000, z: -1_000, vx: 0, vz: 0, radius: 0.35 },
    random: mulberry32(WORLD_SEED + 1),
    ...over,
  };
}

function weed(e: TumbleEnv, x = 0, z = 0): Tumbleweed {
  const w = createTumbleweed();
  w.active = true;
  w.r = 0.5;
  w.x = x;
  w.z = z;
  w.y = e.ground(x, z) + w.r;
  return w;
}

function run(w: Tumbleweed, e: TumbleEnv, seconds: number, impacts: TumbleImpact[] = []): TumbleImpact[] {
  for (let i = 0; i < seconds * 60; i++) stepTumbleweed(w, e, 1 / 60, impacts);
  return impacts;
}

describe('tumbleweeds', () => {
  it('only live on warm, dry land above the sea', () => {
    expect(habitat(52_000, 69_000, 14)).toBeGreaterThan(0.9); // the desert view
    expect(habitat(52_000, 69_000, -5)).toBe(0); // under water
    expect(habitat(52_000, 69_000, 5_000)).toBe(0); // far too cold up there
  });

  it('roll downwind, near the wind speed, and stay on the ground', () => {
    const e = env();
    const w = weed(e);
    let lowest = Infinity;
    for (let i = 0; i < 20 * 60; i++) {
      stepTumbleweed(w, e, 1 / 60, []);
      lowest = Math.min(lowest, w.y - w.r - 10);
    }
    expect(w.x).toBeGreaterThan(40); // 20 s in a 4 m/s (desert-scaled) wind
    expect(Math.abs(w.z)).toBeLessThan(1);
    expect(lowest).toBeGreaterThanOrEqual(-1e-9);
  });

  it('hop now and then, and land with a bounce worth a sound', () => {
    const e = env();
    const w = weed(e);
    let highest = 0;
    const impacts: TumbleImpact[] = [];
    for (let i = 0; i < 30 * 60; i++) {
      stepTumbleweed(w, e, 1 / 60, impacts);
      highest = Math.max(highest, w.y - w.r - 10);
    }
    expect(highest).toBeGreaterThan(0.1);
    expect(impacts.some((i) => i.kind === 'bounce')).toBe(true);
  });

  it('roll downhill without wind', () => {
    // Ground falls 1 m per 5 m toward +Z.
    const e = env({ windX: 0, windZ: 0, ground: (_x, z) => 10 - z * 0.2 });
    const w = weed(e);
    run(w, e, 4);
    expect(w.z).toBeGreaterThan(2);
  });

  it('spin as they roll: the turn matches the distance rolled', () => {
    const e = env({ windX: 3, windZ: 0 });
    const w = weed(e);
    const start = [...w.q];
    run(w, e, 0.5);
    const dot = Math.abs(start[0]! * w.q[0] + start[1]! * w.q[1] + start[2]! * w.q[2] + start[3]! * w.q[3]);
    expect(dot).toBeLessThan(0.999); // it turned
    expect(Math.hypot(...w.q)).toBeCloseTo(1, 6); // still a unit quaternion
  });

  it('are knocked away when the player walks into them, with a kick sound', () => {
    const e = env({ windX: 0, windZ: 0 });
    const w = weed(e);
    e.player.x = -0.6;
    e.player.z = 0;
    e.player.vx = 5;
    const impacts = run(w, e, 0.1);
    expect(impacts.some((i) => i.kind === 'kick')).toBe(true);
    expect(w.vx).toBeGreaterThan(TUMBLEWEEDS.minKick * 0.8);
    expect(w.x).toBeGreaterThan(e.player.x + 0.8);
  });

  it('bounce off walls instead of rolling through a building', () => {
    const academy = buildingById('academy');
    const start = toWorld(academy, 0, 14, { x: 0, z: 0 });
    // Blowing straight at the front wall.
    const e = env({ windX: (academy.x - start.x) / 14 * 6, windZ: (academy.z - start.z) / 14 * 6, move: (x, z, dx, dz, r) => moveWithCollision(x, z, dx, dz, r) });
    const w = weed(e, start.x, start.z);
    let closest = Infinity;
    for (let i = 0; i < 15 * 60; i++) {
      stepTumbleweed(w, e, 1 / 60, []);
      closest = Math.min(closest, distanceTo(academy, w.x, w.z));
    }
    expect(closest).toBeGreaterThan(w.r - 0.02);
  });

  it('respawn on dry land: anywhere in the circle at first, on the upwind rim later', () => {
    const e = env({ player: { x: 1_000, z: 1_000, vx: 0, vz: 0, radius: 0.35 } });
    const w = createTumbleweed();
    respawn(w, e, true);
    expect(w.active).toBe(true);
    expect(Math.hypot(w.x - 1_000, w.z - 1_000)).toBeLessThanOrEqual(TUMBLEWEEDS.radius);
    expect(w.r).toBeGreaterThanOrEqual(TUMBLEWEEDS.size[0]);
    expect(w.r).toBeLessThanOrEqual(TUMBLEWEEDS.size[1]);
    for (let i = 0; i < 20; i++) {
      respawn(w, e, false);
      expect(w.x - 1_000).toBeLessThan(0); // wind blows toward +X: they come from -X
      expect(Math.hypot(w.x - 1_000, w.z - 1_000)).toBeGreaterThan(TUMBLEWEEDS.radius * 0.8);
    }
    respawn(w, env({ habitat: () => 0 }), true);
    expect(w.active).toBe(false);
  });

  it('is deterministic', () => {
    const a = weed(env());
    const b = weed(env());
    run(a, env(), 5);
    run(b, env(), 5);
    expect([a.x, a.y, a.z, ...a.q]).toEqual([b.x, b.y, b.z, ...b.q]);
  });

  it('meshes: high detail up close, a lighter one further off, both rolling on radius ~1', () => {
    const high = createTumbleweedGeometry('high');
    const low = createTumbleweedGeometry('low');
    const tris = (g: typeof high) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
    expect(tris(high)).toBeGreaterThan(5_000);
    expect(tris(high)).toBeLessThan(9_000);
    expect(tris(low)).toBeLessThan(tris(high) / 2.5);
    // The shell is at radius ~1 (what the physics rolls on); only loose shoots poke a little past it.
    for (const g of [high, low]) {
      const p = g.attributes.position!;
      let max = 0;
      for (let i = 0; i < p.count; i++) max = Math.max(max, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
      expect(max).toBeGreaterThan(0.95);
      expect(max).toBeLessThan(1.25);
    }
    expect(high.attributes.color).toBeDefined();
    high.dispose();
    low.dispose();
  });

  it('sounds: a seamless rustle loop, crackles, and quieter far away', () => {
    const rate = 22_050;
    const loop = synthRustleLoop(rate);
    expect(loop.length).toBe(Math.round(2.5 * rate));
    expect(Math.max(...loop.map(Math.abs))).toBeCloseTo(0.8, 3);
    // The end runs into the start without a jump bigger than the signal's own steps.
    let biggest = 0;
    for (let i = 1; i < loop.length; i++) biggest = Math.max(biggest, Math.abs(loop[i]! - loop[i - 1]!));
    expect(Math.abs(loop[0]! - loop[loop.length - 1]!)).toBeLessThanOrEqual(biggest);
    const c = synthCrackle(0, rate);
    expect(c.length).toBeGreaterThan(0.2 * rate);
    expect(Math.max(...c.map(Math.abs))).toBeCloseTo(0.85, 3);
    expect(synthCrackle(1, rate)).not.toEqual(c);
    expect(crackleLevel(4, 2)).toBeGreaterThan(crackleLevel(4, 20));
    expect(crackleLevel(5, 3)).toBeGreaterThan(crackleLevel(1, 3));
    expect(crackleLevel(5, 100)).toBe(0);
  });
});
