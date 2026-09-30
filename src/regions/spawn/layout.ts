import { SEA_LEVEL, SPAWN_AREA, WORLD_SEED } from '../../config/world';
import { hash2 } from '../../world/noise';
import { naturalHeightAt } from '../../world/naturalTerrain';

/**
 * The spawn area's layout, generated once from the natural terrain (pure and
 * deterministic, so workers and the main thread agree).
 */

export interface PathPoint {
  x: number;
  z: number;
  /** Level of the path surface here (smoothed natural ground). */
  y: number;
}

export interface SpawnLayout {
  plaza: { x: number; z: number; radius: number; y: number };
  paths: PathPoint[][];
}

let cached: SpawnLayout | null = null;

export function spawnLayout(): SpawnLayout {
  cached ??= buildLayout();
  return cached;
}

function buildLayout(): SpawnLayout {
  const p = SPAWN_AREA.plaza;
  // The plaza sits at the average ground level under it.
  let sum = 0;
  let n = 0;
  for (let a = 0; a < 8; a++) {
    for (const r of [0, p.radius * 0.5, p.radius]) {
      sum += naturalHeightAt(p.x + Math.sin(a * 0.785) * r, p.z - Math.cos(a * 0.785) * r);
      n++;
    }
  }
  const plaza = { x: p.x, z: p.z, radius: p.radius, y: sum / n };
  const paths = SPAWN_AREA.pathHeadings.map((heading, k) => route(plaza, heading, k));
  return { plaza, paths };
}

/**
 * Walks out from the plaza edge, each step choosing the heading that climbs
 * least, with a pull back toward the start direction and a little wander, so
 * paths wind along the land instead of running straight. Then smoothed and
 * resampled evenly, with a smoothed height profile.
 */
function route(plaza: SpawnLayout['plaza'], heading0: number, k: number): PathPoint[] {
  const step = SPAWN_AREA.pathStep;
  let heading = heading0;
  let x = plaza.x + Math.sin(heading) * plaza.radius;
  let z = plaza.z - Math.cos(heading) * plaza.radius;
  const raw: Array<[number, number]> = [[x, z]];
  let h = naturalHeightAt(x, z);
  for (let i = 0; i * step < SPAWN_AREA.pathLength; i++) {
    const wander = (hash2(i >> 3, k, WORLD_SEED + 700) - 0.5) * 0.8;
    let best = heading;
    let bestScore = Infinity;
    for (let d = -0.4; d <= 0.401; d += 0.1) {
      const hd = heading + d;
      const nx = x + Math.sin(hd) * step;
      const nz = z - Math.cos(hd) * step;
      const nh = naturalHeightAt(nx, nz);
      const climb = Math.abs(nh - h) / step;
      const water = nh < SEA_LEVEL + 2 ? 10 : 0;
      const score = climb * 4 + Math.abs(hd - heading0 - wander) * 0.3 + water;
      if (score < bestScore) {
        bestScore = score;
        best = hd;
      }
    }
    heading = best;
    x += Math.sin(heading) * step;
    z -= Math.cos(heading) * step;
    h = naturalHeightAt(x, z);
    if (h < SEA_LEVEL + 2) break; // reached the shore
    raw.push([x, z]);
  }
  return profile(resample(chaikin(chaikin(raw)), SPAWN_AREA.pathSpacing), plaza.y);
}

/** Corner cutting: rounds the polyline, keeping its ends. */
function chaikin(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const out: Array<[number, number]> = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function resample(pts: Array<[number, number]>, spacing: number): Array<[number, number]> {
  const out: Array<[number, number]> = [pts[0]!];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    let t = spacing - carry;
    while (t <= len) {
      out.push([ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len]);
      t += spacing;
    }
    carry = len - (t - spacing);
  }
  return out;
}

/** Heights along the path: natural ground, smoothed over ±24 m, starting at the plaza level. */
function profile(pts: Array<[number, number]>, plazaY: number): PathPoint[] {
  const ground = pts.map(([x, z]) => naturalHeightAt(x, z));
  const w = 6;
  return pts.map(([x, z], i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(pts.length - 1, i + w); j++) {
      s += ground[j]!;
      n++;
    }
    const blend = Math.min(1, i / 8); // leave the plaza at its level
    return { x, z, y: plazaY * (1 - blend) + (s / n) * blend };
  });
}
