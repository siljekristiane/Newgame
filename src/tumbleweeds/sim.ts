import { SEA_LEVEL, TUMBLEWEEDS } from '../config/world';
import { climateAt } from '../world/biomes';

/**
 * Tumbleweed physics (pure, tested): a light ball that the wind pushes along
 * the ground, rolling (its spin follows its speed), bouncing on bumps, hopping
 * on gusts, sliding downhill, and knocked away by the player. The world is
 * passed in (ground height, wind, player, wall collision), so the sim knows
 * nothing about rendering.
 */
export interface Tumbleweed {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Ball radius, meters. */
  r: number;
  /** Orientation quaternion (x, y, z, w). */
  q: [number, number, number, number];
  /** Seconds to the next gust hop. */
  hopIn: number;
  /** Own gust rhythm. */
  phase: number;
}

export interface TumbleEnv {
  /** Ground (or water surface) height, world meters. */
  ground: (x: number, z: number) => number;
  /** Habitat 0..1 (dry land); see habitat(). */
  habitat: (x: number, z: number) => number;
  windX: number;
  windZ: number;
  player: { x: number; z: number; vx: number; vz: number; radius: number };
  /** Optional wall collision for a moving circle (player/collision.ts). */
  move?: (x: number, z: number, dx: number, dz: number, r: number) => { x: number; z: number; nx: number; nz: number };
  random: () => number;
}

/** A thump worth a sound: where, and how hard (m/s into the ground or from a kick). */
export interface TumbleImpact {
  kind: 'bounce' | 'kick';
  x: number;
  y: number;
  z: number;
  strength: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How suitable a spot is for tumbleweeds: dry, warm land above the sea (0..1). */
export function habitat(x: number, z: number, height: number): number {
  if (height < SEA_LEVEL + TUMBLEWEEDS.minHeight) return 0;
  const c = climateAt(x, z, height);
  if (c.temperature < TUMBLEWEEDS.minTemperature) return 0;
  return smooth(TUMBLEWEEDS.dryFrom, TUMBLEWEEDS.dryFull, c.moisture);
}

export function createTumbleweed(): Tumbleweed {
  return { active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.5, q: [0, 0, 0, 1], hopIn: 2, phase: 0 };
}

/**
 * Puts a weed somewhere new near the player: on the disc (`anywhere`) or the
 * upwind rim of the live circle, where the land suits it. Leaves it inactive
 * if no dry spot turns up.
 */
export function respawn(w: Tumbleweed, env: TumbleEnv, anywhere: boolean): void {
  const R = TUMBLEWEEDS.radius;
  const wl = Math.hypot(env.windX, env.windZ) || 1;
  const upwind = Math.atan2(-env.windZ / wl, -env.windX / wl);
  for (let tries = 0; tries < 10; tries++) {
    const a = anywhere ? env.random() * Math.PI * 2 : upwind + (env.random() - 0.5) * 2.2;
    const d = anywhere ? R * Math.sqrt(0.05 + env.random() * 0.95) : R * (0.82 + env.random() * 0.15);
    const x = env.player.x + Math.cos(a) * d;
    const z = env.player.z + Math.sin(a) * d;
    if (env.random() > env.habitat(x, z)) continue;
    w.active = true;
    w.r = TUMBLEWEEDS.size[0] + env.random() * (TUMBLEWEEDS.size[1] - TUMBLEWEEDS.size[0]);
    w.x = x;
    w.z = z;
    w.y = env.ground(x, z) + w.r;
    w.vx = w.vz = w.vy = 0;
    w.hopIn = env.random() * TUMBLEWEEDS.hopEvery[1];
    w.phase = env.random() * 100;
    return;
  }
  w.active = false;
}

/** Rotates q by angular velocity (wx, wy, wz) over dt (exact for a constant axis). */
function spin(q: [number, number, number, number], wx: number, wy: number, wz: number, dt: number): void {
  const speed = Math.hypot(wx, wy, wz);
  if (speed < 1e-6) return;
  const half = (speed * dt) / 2;
  const s = Math.sin(half) / speed;
  const ax = wx * s;
  const ay = wy * s;
  const az = wz * s;
  const aw = Math.cos(half);
  const [x, y, z, w] = q;
  // q' = a * q (world-space rotation applied after).
  q[0] = aw * x + ax * w + ay * z - az * y;
  q[1] = aw * y - ax * z + ay * w + az * x;
  q[2] = aw * z + ax * y - ay * x + az * w;
  q[3] = aw * w - ax * x - ay * y - az * z;
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  q[0] /= l;
  q[1] /= l;
  q[2] /= l;
  q[3] /= l;
}

/** One frame for one weed; impacts worth a sound are pushed to `impacts`. */
export function stepTumbleweed(w: Tumbleweed, env: TumbleEnv, dt: number, impacts: TumbleImpact[]): void {
  if (!w.active) return;
  const T = TUMBLEWEEDS;
  const steps = Math.max(1, Math.ceil(dt / T.maxStep));
  const h = dt / steps;
  // Desert wind: stronger than the weather's, never quite still, gusting in its own rhythm.
  const wl = Math.hypot(env.windX, env.windZ);
  const base = Math.max(T.minWind, wl * T.windScale);
  const dirX = wl > 1e-3 ? env.windX / wl : 1;
  const dirZ = wl > 1e-3 ? env.windZ / wl : 0;
  for (let s = 0; s < steps; s++) {
    w.phase += h;
    const gust = 0.7 + 0.45 * Math.sin(w.phase * 0.9) + 0.25 * Math.sin(w.phase * 2.3 + 1.7);
    const windX = dirX * base * gust;
    const windZ = dirZ * base * gust;
    const g = env.ground(w.x, w.z);
    const onGround = w.y - w.r <= g + 0.02;
    // Wind pulls toward its speed; the ground rolls it, the air carries it less.
    const drag = onGround ? T.dragGround : T.dragAir;
    w.vx += (windX - w.vx) * drag * h;
    w.vz += (windZ - w.vz) * drag * h;
    w.vy -= T.gravity * h;
    if (onGround) {
      // Downhill: the horizontal part of the ground normal, times gravity.
      const gx = env.ground(w.x + 0.5, w.z) - g;
      const gz = env.ground(w.x, w.z + 0.5) - g;
      const nl = Math.hypot(gx * 2, 1, gz * 2);
      w.vx += ((-gx * 2) / nl) * T.gravity * h;
      w.vz += ((-gz * 2) / nl) * T.gravity * h;
      const keep = 1 - T.friction * h;
      w.vx *= keep;
      w.vz *= keep;
      // Gust hops, higher in strong wind.
      w.hopIn -= h;
      if (w.hopIn <= 0) {
        w.vy = Math.max(w.vy, T.hop * (0.4 + env.random() * 0.6) * Math.min(1.6, base / 4));
        w.hopIn = T.hopEvery[0] + env.random() * (T.hopEvery[1] - T.hopEvery[0]);
      }
    }
    // The player knocks it away.
    const p = env.player;
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const dist = Math.hypot(dx, dz);
    const reach = w.r + p.radius;
    if (dist < reach && w.y - w.r < env.ground(p.x, p.z) + 1.4) {
      const nx = dist > 1e-6 ? dx / dist : 1;
      const nz = dist > 1e-6 ? dz / dist : 0;
      w.x = p.x + nx * reach;
      w.z = p.z + nz * reach;
      const closing = (p.vx - w.vx) * nx + (p.vz - w.vz) * nz;
      if (closing > -0.5) {
        const push = Math.max(T.minKick, closing * T.kick);
        w.vx += nx * push;
        w.vz += nz * push;
        w.vy = Math.max(w.vy, T.kickHop * (0.6 + env.random() * 0.4));
        impacts.push({ kind: 'kick', x: w.x, y: w.y, z: w.z, strength: push });
      }
    }
    // Move, sliding along walls if any.
    if (env.move) {
      const m = env.move(w.x, w.z, w.vx * h, w.vz * h, w.r);
      const into = w.vx * m.nx + w.vz * m.nz;
      if (into < 0) {
        w.vx -= into * m.nx * 1.4;
        w.vz -= into * m.nz * 1.4;
      }
      w.x = m.x;
      w.z = m.z;
    } else {
      w.x += w.vx * h;
      w.z += w.vz * h;
    }
    w.y += w.vy * h;
    const floor = env.ground(w.x, w.z) + w.r;
    if (w.y < floor) {
      if (w.vy < -1.2) impacts.push({ kind: 'bounce', x: w.x, y: floor, z: w.z, strength: -w.vy });
      w.y = floor;
      w.vy = w.vy < -1.2 ? -w.vy * T.restitution : 0;
    }
    // Spin: rolling on the ground, a lazy tumble in the air.
    const roll = (onGround ? 1 : 0.6) / w.r;
    spin(w.q, w.vz * roll, 0.15 * Math.sin(w.phase), -w.vx * roll, h);
  }
}
