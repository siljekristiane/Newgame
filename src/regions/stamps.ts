import { GIANTS, SPAWN_AREA } from '../config/world';
import { spawnLayout, type PathPoint } from './spawn/layout';
import { nearestGiantDistance } from './giants/layout';

/**
 * Hand-made regions pressed into the natural terrain: flat plazas and paths
 * whose ground is eased toward a smooth path level. Pure, so every worker
 * gets the same heights.
 *
 * Segments are bucketed in a coarse grid, so a height lookup only checks the
 * few path pieces near it; points outside the region's box cost one compare.
 */

const CELL = 64;

interface Segment {
  a: PathPoint;
  b: PathPoint;
}

interface Index {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  cols: number;
  cells: Map<number, Segment[]>;
}

let index: Index | null = null;

/** How far the stamp reaches beyond a path's centre line. */
const REACH = SPAWN_AREA.pathWidth / 2 + SPAWN_AREA.pathShoulder;

function buildIndex(): Index {
  const { plaza, paths } = spawnLayout();
  const margin = Math.max(REACH, plaza.radius + SPAWN_AREA.plaza.blend) + 1;
  let minX = plaza.x - margin;
  let maxX = plaza.x + margin;
  let minZ = plaza.z - margin;
  let maxZ = plaza.z + margin;
  for (const path of paths) {
    for (const p of path) {
      minX = Math.min(minX, p.x - margin);
      maxX = Math.max(maxX, p.x + margin);
      minZ = Math.min(minZ, p.z - margin);
      maxZ = Math.max(maxZ, p.z + margin);
    }
  }
  const cols = Math.ceil((maxX - minX) / CELL) + 1;
  const cells = new Map<number, Segment[]>();
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const seg = { a: path[i]!, b: path[i + 1]! };
      const x0 = Math.floor((Math.min(seg.a.x, seg.b.x) - REACH - minX) / CELL);
      const x1 = Math.floor((Math.max(seg.a.x, seg.b.x) + REACH - minX) / CELL);
      const z0 = Math.floor((Math.min(seg.a.z, seg.b.z) - REACH - minZ) / CELL);
      const z1 = Math.floor((Math.max(seg.a.z, seg.b.z) + REACH - minZ) / CELL);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const key = cz * cols + cx;
          const list = cells.get(key);
          if (list) list.push(seg);
          else cells.set(key, [seg]);
        }
      }
    }
  }
  return { minX, minZ, maxX, maxZ, cols, cells };
}

function getIndex(): Index {
  index ??= buildIndex();
  return index;
}

export interface PathHit {
  /** Distance from the path's centre line, meters (Infinity if none near). */
  distance: number;
  /** Path level at the nearest point. */
  y: number;
}

const hit: PathHit = { distance: Infinity, y: 0 };

/** Nearest path within the stamp's reach. Returns a shared object: copy what you need. */
export function nearestPath(x: number, z: number): PathHit {
  hit.distance = Infinity;
  const idx = getIndex();
  if (x < idx.minX || x > idx.maxX || z < idx.minZ || z > idx.maxZ) return hit;
  const list = idx.cells.get(Math.floor((z - idx.minZ) / CELL) * idx.cols + Math.floor((x - idx.minX) / CELL));
  if (!list) return hit;
  for (const { a, b } of list) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < hit.distance) {
      hit.distance = d;
      hit.y = a.y + (b.y - a.y) * t;
    }
  }
  return hit;
}

/** Distance from the plaza's edge (negative inside). */
export function plazaDistance(x: number, z: number): number {
  const { plaza } = spawnLayout();
  return Math.hypot(x - plaza.x, z - plaza.z) - plaza.radius;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The natural height with plazas and paths pressed in. */
export function stampHeight(x: number, z: number, natural: number): number {
  const idx = getIndex();
  if (x < idx.minX || x > idx.maxX || z < idx.minZ || z > idx.maxZ) return natural;
  let h = natural;
  const path = nearestPath(x, z);
  if (path.distance < REACH) {
    h += (path.y - h) * (1 - smooth(SPAWN_AREA.pathWidth / 2, REACH, path.distance));
  }
  const { plaza } = spawnLayout();
  const pd = plazaDistance(x, z);
  if (pd < SPAWN_AREA.plaza.blend) h += (plaza.y - h) * (1 - smooth(0, SPAWN_AREA.plaza.blend, pd));
  return h;
}

/**
 * Paints where grass must not grow (paths, plazas) into a byte mask of
 * size² texels, `cell` meters each, whose north-west corner is (x0, z0).
 * Rasterizes per segment, so it only touches texels near a path. Returns
 * false (mask untouched) when no region reaches the area.
 */
export function rasterizeClearing(mask: Uint8Array, size: number, x0: number, z0: number, cell: number): boolean {
  const idx = getIndex();
  const x1 = x0 + size * cell;
  const z1 = z0 + size * cell;
  if (idx.maxX < x0 || idx.minX > x1 || idx.maxZ < z0 || idx.minZ > z1) return false;
  const half = SPAWN_AREA.pathWidth / 2;
  const paint = (px0: number, pz0: number, px1: number, pz1: number, value: (x: number, z: number) => number) => {
    const i0 = Math.max(0, Math.floor((px0 - x0) / cell));
    const i1 = Math.min(size - 1, Math.floor((px1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((pz0 - z0) / cell));
    const j1 = Math.min(size - 1, Math.floor((pz1 - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const v = Math.round(value(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) * 255);
        if (v > mask[j * size + i]!) mask[j * size + i] = v;
      }
    }
  };
  const { plaza, paths } = spawnLayout();
  const r = plaza.radius + 1;
  paint(plaza.x - r, plaza.z - r, plaza.x + r, plaza.z + r, (x, z) => 1 - smooth(-0.3, 0.6, plazaDistance(x, z)));
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const m = half + 1;
      paint(Math.min(a.x, b.x) - m, Math.min(a.z, b.z) - m, Math.max(a.x, b.x) + m, Math.max(a.z, b.z) + m, (x, z) => {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        return 1 - smooth(half - 0.3, half + 0.5, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
      });
    }
  }
  return true;
}

/**
 * How much a point is kept clear of plants: 1 on a path or the plaza (plus
 * SPAWN_AREA.plantClearance), easing to 0 a few meters further out, and around
 * the five giant trees, so each stands free.
 */
export function clearing(x: number, z: number): number {
  const edge = SPAWN_AREA.pathWidth / 2 + SPAWN_AREA.plantClearance;
  const onPath = 1 - smooth(edge, edge + 2, nearestPath(x, z).distance);
  const onPlaza = 1 - smooth(SPAWN_AREA.plantClearance, SPAWN_AREA.plantClearance + 4, plazaDistance(x, z));
  const byGiant = 1 - smooth(GIANTS.clearInner, GIANTS.clearOuter, nearestGiantDistance(x, z));
  return Math.max(onPath, onPlaza, byGiant);
}
