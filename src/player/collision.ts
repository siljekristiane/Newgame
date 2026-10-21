import { COLLISION } from '../config/world';
import { buildingHeight, PLINTH_OUT } from '../regions/buildings/buildingKit';
import { distanceTo, placedBuildings } from '../regions/buildings/placements';
import { GIANT_TREES } from '../regions/giants/layout';
import { placeLamps } from '../regions/spawn/furniture';
import { spawnLayout } from '../regions/spawn/layout';
import { groundHeightAt } from '../world/ground';

/**
 * Collision on the ground plane (pure, tested). Every solid thing is a signed
 * distance in x/z (negative inside) with a top height: the buildings, the
 * fountain, lamp posts and giant trunks. The player is a circle that is pushed
 * out along the distance's gradient, so it slides along walls instead of
 * stopping dead; long moves are cut into short steps so nothing is skipped.
 * New solid things (furniture, bridges' rails …) are one more collider.
 */
export interface Collider {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Height above the pad/ground of its top: the camera may pass above. */
  top: number;
  /** Ground level at its foot (world meters). */
  base: number;
  distance: (x: number, z: number) => number;
}

interface Grid {
  cells: Map<number, Collider[]>;
  all: Collider[];
}

let grid: Grid | null = null;

const CELL = COLLISION.cell;
const key = (cx: number, cz: number) => cz * 8192 + cx;

function circle(x: number, z: number, r: number, base: number, top: number): Collider {
  return { minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r, base, top, distance: (px, pz) => Math.hypot(px - x, pz - z) - r };
}

function buildGrid(): Grid {
  const all: Collider[] = [];
  for (const b of placedBuildings()) {
    const r = b.radius;
    // The plinth stands out from the walls: stop at its edge, not with the feet inside it.
    all.push({ minX: b.x - r, minZ: b.z - r, maxX: b.x + r, maxZ: b.z + r, base: b.y, top: buildingHeight(b.design.spec), distance: (x, z) => distanceTo(b, x, z) - PLINTH_OUT });
  }
  const layout = spawnLayout();
  all.push(circle(layout.plaza.x, layout.plaza.z, COLLISION.fountainRadius, layout.plaza.y, 2.6));
  for (const l of placeLamps(layout)) all.push(circle(l.x, l.z, COLLISION.lampRadius, l.y, 3.8));
  for (const g of GIANT_TREES) all.push(circle(g.x, g.z, COLLISION.giantRadius, groundHeightAt(g.x, g.z), 40));
  const cells = new Map<number, Collider[]>();
  for (const c of all) {
    for (let cz = Math.floor(c.minZ / CELL); cz <= Math.floor(c.maxZ / CELL); cz++) {
      for (let cx = Math.floor(c.minX / CELL); cx <= Math.floor(c.maxX / CELL); cx++) {
        const k = key(cx, cz);
        const list = cells.get(k);
        if (list) list.push(c);
        else cells.set(k, [c]);
      }
    }
  }
  return { cells, all };
}

function getGrid(): Grid {
  grid ??= buildGrid();
  return grid;
}

/** All colliders (for tests and debugging). */
export function colliders(): readonly Collider[] {
  return getGrid().all;
}

const found = new Set<Collider>();
const near: Collider[] = [];

/** Colliders whose box touches the rectangle (reuses one array: copy if you keep it). */
function query(minX: number, minZ: number, maxX: number, maxZ: number): Collider[] {
  const { cells } = getGrid();
  found.clear();
  near.length = 0;
  for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      const list = cells.get(key(cx, cz));
      if (!list) continue;
      for (const c of list) {
        if (found.has(c) || c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
        found.add(c);
        near.push(c);
      }
    }
  }
  return near;
}

export interface MoveResult {
  x: number;
  z: number;
  /** Outward normal of the last thing pushed against, or 0, 0 if nothing was hit. */
  nx: number;
  nz: number;
}

const H = 0.02;

/** Pushes a circle of radius r out of every collider it overlaps (a few rounds, for corners). */
function pushOut(list: readonly Collider[], x: number, z: number, r: number, out: MoveResult): void {
  for (let round = 0; round < 4; round++) {
    let deepest = 0;
    let hit: Collider | null = null;
    for (const c of list) {
      const d = c.distance(x, z) - r;
      if (d < deepest) {
        deepest = d;
        hit = c;
      }
    }
    if (!hit) break;
    let gx = hit.distance(x + H, z) - hit.distance(x - H, z);
    let gz = hit.distance(x, z + H) - hit.distance(x, z - H);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-9) {
      gx = 1;
      gz = 0;
    } else {
      gx /= gl;
      gz /= gl;
    }
    x -= gx * (deepest - 1e-3);
    z -= gz * (deepest - 1e-3);
    out.nx = gx;
    out.nz = gz;
  }
  out.x = x;
  out.z = z;
}

/**
 * Moves a circle of radius r from (x, z) by (dx, dz), sliding along whatever
 * it meets. Returns the new position and the last contact normal.
 */
export function moveWithCollision(x: number, z: number, dx: number, dz: number, r = COLLISION.playerRadius, out: MoveResult = { x, z, nx: 0, nz: 0 }): MoveResult {
  out.nx = 0;
  out.nz = 0;
  const list = query(Math.min(x, x + dx) - r, Math.min(z, z + dz) - r, Math.max(x, x + dx) + r, Math.max(z, z + dz) + r);
  if (list.length === 0) {
    out.x = x + dx;
    out.z = z + dz;
    return out;
  }
  const steps = Math.min(4000, Math.max(1, Math.ceil(Math.hypot(dx, dz) / COLLISION.maxStep)));
  let px = x;
  let pz = z;
  for (let i = 0; i < steps; i++) {
    pushOut(list, px + dx / steps, pz + dz / steps, r, out);
    px = out.x;
    pz = out.z;
  }
  return out;
}

/**
 * How far along the segment from (ax, ay, az) to (bx, by, bz) the view stays
 * clear of every collider by `margin` (1 = all the way). Only the parts below
 * a collider's top count, so the camera may look over a roof.
 */
export function clearAlong(ax: number, ay: number, az: number, bx: number, by: number, bz: number, margin = COLLISION.cameraMargin): number {
  const list = query(Math.min(ax, bx) - margin, Math.min(az, bz) - margin, Math.max(ax, bx) + margin, Math.max(az, bz) + margin);
  if (list.length === 0) return 1;
  const samples = Math.max(4, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
  let last = 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const z = az + (bz - az) * t;
    for (const c of list) {
      if (y > c.base + c.top || c.distance(x, z) > margin) continue;
      return last;
    }
    last = t;
  }
  return 1;
}
