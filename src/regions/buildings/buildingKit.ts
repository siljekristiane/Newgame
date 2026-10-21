import type * as THREE from 'three';
import { BUILDING_PARTS, disc, frameBox, frameQuad, opening, Part, ring, wallFrame, type BuildingPart, type V3, type WallFrame } from './kitParts';

/**
 * A kit for stone buildings in the academy's style, described as data: wings
 * (any length, width and number of floors; gable or hipped slate roofs;
 * dormers; a door with steps) and towers (round or square; cone or pyramid
 * roofs; a belfry with louvred arches). Windows are laid out by themselves,
 * floor by floor, and left out where another wing or tower covers the wall.
 *
 * Everything is built in the building's own frame (origin on the pad, y up);
 * each wing is turned and moved there by its `angle` and centre. One geometry
 * per surface (wall, roof, trim, door, glass), as for the academy.
 */

export type Side = 'front' | 'back' | 'left' | 'right';

export interface WingSpec {
  /** Centre in the building frame. */
  x: number;
  z: number;
  /** Turn about Y, radians (three.js convention). 0: ridge along X, front facing +Z. */
  angle?: number;
  /** Along the ridge, and across it. */
  length: number;
  width: number;
  floors: number;
  floorHeight?: number;
  plinth?: number;
  roof?: 'gable' | 'hip';
  /** Roof rise per meter in from the eaves. */
  pitch?: number;
  overhang?: number;
  /** Window positions along each side (meters from its middle), or 'auto' (default) or 'none'. */
  windows?: Partial<Record<Side, number[] | 'auto' | 'none'>>;
  /** A tall window high in each gable end (gable roofs). */
  gableWindows?: boolean;
  /** Dormers on the roof slopes, at these positions along the ridge. */
  dormers?: { sides: Array<'front' | 'back'>; at: number[] };
  door?: { side: Side; u?: number; width?: number; height?: number; steps?: number };
}

export interface TowerSpec {
  x: number;
  z: number;
  shape: 'round' | 'square';
  /** Radius (round) or half the width (square). */
  size: number;
  /** Top of the walls above the pad. */
  height: number;
  roof: 'cone' | 'pyramid';
  roofHeight: number;
  /** Louvred arches all round the top storey (bell towers). */
  belfry?: boolean;
  plinth?: number;
  /** An arched passage through the foot along this axis (gatehouses). */
  passage?: 'x' | 'z';
}

export interface BuildingSpec {
  wings: WingSpec[];
  towers?: TowerSpec[];
}

export interface BuildingGeometry {
  parts: Record<BuildingPart, THREE.BufferGeometry>;
  triangles: number;
  /** Highest point above the pad. */
  height: number;
}

/** Meters of each surface per texture repeat (as BUILDINGS.texScale). */
export interface TexScale {
  wall: number;
  roof: number;
  trim: number;
  door: number;
}

const SINK = -1.5; // walls reach below the pad, so the ground blend never shows a gap
const DEFAULTS = { floorHeight: 3.8, plinth: 0.9, pitch: 0.9, overhang: 0.6 };
const WINDOW_SPACING = 3.8;
const SEGMENTS = 28;

const wallTop = (w: WingSpec) => (w.plinth ?? DEFAULTS.plinth) + w.floors * (w.floorHeight ?? DEFAULTS.floorHeight);

/** A point in the building frame → the wing's own frame. */
function intoWing(w: WingSpec, x: number, z: number): [number, number] {
  const a = w.angle ?? 0;
  const dx = x - w.x;
  const dz = z - w.z;
  return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
}

/** Distance from a part's walls, meters (negative inside). */
function wingDistance(w: WingSpec, x: number, z: number): number {
  const [lx, lz] = intoWing(w, x, z);
  const qx = Math.abs(lx) - w.length / 2;
  const qz = Math.abs(lz) - w.width / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
function towerDistance(t: TowerSpec, x: number, z: number): number {
  if (t.shape === 'round') return Math.hypot(x - t.x, z - t.z) - t.size;
  const qx = Math.abs(x - t.x) - t.size;
  const qz = Math.abs(z - t.z) - t.size;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

/** Distance from the building's walls in its own frame (negative inside). */
export function buildingDistance(spec: BuildingSpec, x: number, z: number): number {
  let d = Infinity;
  for (const w of spec.wings) d = Math.min(d, wingDistance(w, x, z));
  for (const t of spec.towers ?? []) d = Math.min(d, towerDistance(t, x, z));
  return d;
}

/** How far the plinth stands out from the walls (meters): the walkable edge of a building. */
export const PLINTH_OUT = 0.25;

/**
 * Height above the pad of the door steps under (x, z) in the building frame,
 * or 0 off the steps: lets the player climb them. Mirrors the steps buildWing
 * lays out (each 0.45 m deep, the top one level with the plinth).
 */
export function stepHeight(spec: BuildingSpec, x: number, z: number): number {
  let best = 0;
  for (const w of spec.wings) {
    if (!w.door) continue;
    const [lx, lz] = intoWing(w, x, z);
    const L = w.length / 2;
    const D = w.width / 2;
    const side = w.door.side;
    const u = side === 'front' ? lx : side === 'back' ? -lx : side === 'right' ? -lz : lz;
    const d = side === 'front' ? lz - D : side === 'back' ? -lz - D : side === 'right' ? lx - L : -lx - L;
    const steps = w.door.steps ?? 3;
    const half = (w.door.width ?? 2.4) / 2 + 0.8;
    if (Math.abs(u - (w.door.u ?? 0)) > half || d < 0 || d > 0.12 + steps * 0.45) continue;
    const i = Math.min(steps - 1, Math.floor(steps - (d - 0.12) / 0.45));
    best = Math.max(best, ((w.plinth ?? DEFAULTS.plinth) / steps) * (i + 1));
  }
  return best;
}

/** Highest point of a building above its pad, without building the mesh (roof ridges, tower tips). */
export function buildingHeight(spec: BuildingSpec): number {
  let h = 0;
  for (const w of spec.wings) {
    const pitch = w.pitch ?? DEFAULTS.pitch;
    h = Math.max(h, wallTop(w) + (w.width / 2) * pitch + 0.2);
  }
  for (const t of spec.towers ?? []) h = Math.max(h, t.height + 0.35 + t.roofHeight + 0.9);
  return h;
}

/** How high some other part stands over (x, z), or 0: windows below that are covered. */
function coveredTo(spec: BuildingSpec, self: object, x: number, z: number): number {
  let h = 0;
  for (const w of spec.wings) if (w !== self && wingDistance(w, x, z) < 0.4) h = Math.max(h, wallTop(w) + 0.6);
  for (const t of spec.towers ?? []) if (t !== self && towerDistance(t, x, z) < 0.4) h = Math.max(h, t.height + t.roofHeight);
  return h;
}

export function createBuildingGeometry(spec: BuildingSpec, scale: TexScale): BuildingGeometry {
  const P: Record<BuildingPart, Part> = {
    wall: new Part(scale.wall),
    roof: new Part(scale.roof),
    trim: new Part(scale.trim),
    door: new Part(scale.door),
    glass: new Part(1),
  };
  let height = 0;
  for (const w of spec.wings) height = Math.max(height, buildWing(P, spec, w));
  for (const t of spec.towers ?? []) height = Math.max(height, buildTower(P, spec, t));
  const parts = {} as Record<BuildingPart, THREE.BufferGeometry>;
  let triangles = 0;
  for (const k of BUILDING_PARTS) {
    parts[k] = P[k].geometry();
    triangles += P[k].triangles;
  }
  return { parts, triangles, height };
}

function setAll(P: Record<BuildingPart, Part>, angle: number, x: number, z: number): void {
  for (const k of BUILDING_PARTS) P[k].xf = { angle, x, z };
}

/** Newell normal of a planar polygon, flipped to face `hint`. */
function faceNormal(pts: readonly V3[], hint: V3): V3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  const s = nx * hint[0] + ny * hint[1] + nz * hint[2] < 0 ? -1 : 1;
  return [(s * nx) / l, (s * ny) / l, (s * nz) / l];
}

/** Builds one wing; returns its highest point. */
function buildWing(P: Record<BuildingPart, Part>, spec: BuildingSpec, w: WingSpec): number {
  const angle = w.angle ?? 0;
  setAll(P, angle, w.x, w.z);
  const L = w.length / 2;
  const D = w.width / 2;
  const base = w.plinth ?? DEFAULTS.plinth;
  const fh = w.floorHeight ?? DEFAULTS.floorHeight;
  const top = wallTop(w);
  const pitch = w.pitch ?? DEFAULTS.pitch;
  const o = w.overhang ?? DEFAULTS.overhang;
  const roof = w.roof ?? 'gable';
  const ridgeY = top + D * pitch;
  // A wing-local point → the building frame (to ask what else stands there).
  const toBuilding = (lx: number, lz: number): [number, number] => [w.x + lx * Math.cos(angle) + lz * Math.sin(angle), w.z - lx * Math.sin(angle) + lz * Math.cos(angle)];

  // Plinth.
  P.trim.box([-L - PLINTH_OUT, SINK, -D - PLINTH_OUT], [L + PLINTH_OUT, base, D + PLINTH_OUT], ['-y']);

  // Walls, and gables for a gable roof.
  const sides: Record<Side, { f: WallFrame; half: number }> = {
    front: { f: wallFrame([0, 0, D], [0, 0, 1]), half: L },
    back: { f: wallFrame([0, 0, -D], [0, 0, -1]), half: L },
    right: { f: wallFrame([L, 0, 0], [1, 0, 0]), half: D },
    left: { f: wallFrame([-L, 0, 0], [-1, 0, 0]), half: D },
  };
  for (const side of Object.values(sides)) frameQuad(P.wall, side.f, -side.half, side.half, base, top);
  if (roof === 'gable') {
    for (const s of [1, -1] as const) P.wall.flat([[s * L, top, -D], [s * L, top, D], [s * L, ridgeY, 0]], [s, 0, 0]);
  }

  // Quoins up the corners, and a string course at every floor.
  // Trim under the eaves stops below the roof's underside (thickness + slope over its depth).
  const thick = 0.25;
  const underEave = (out: number) => top - thick - out * pitch - 0.02;
  const course = 0.55;
  const quoinTop = underEave(0.1);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * L;
      const z = sz * D;
      for (let k = 0, y = base; y < quoinTop - 0.01; k++, y += course) {
        const y1 = Math.min(quoinTop, y + course - 0.04);
        const along = k % 2 === 0 ? 0.95 : 0.5;
        const across = k % 2 === 0 ? 0.5 : 0.95;
        P.trim.box([Math.min(x, x - sx * along), y, Math.min(z, z + sz * 0.1)], [Math.max(x, x - sx * along), y1, Math.max(z, z + sz * 0.1)]);
        P.trim.box([Math.min(x, x + sx * 0.1), y, Math.min(z, z - sz * across)], [Math.max(x, x + sx * 0.1), y1, Math.max(z, z - sz * across)]);
      }
    }
  }
  for (let f = 1; f < w.floors; f++) {
    const y = base + f * fh;
    for (const side of Object.values(sides)) frameBox(P.trim, side.f, -side.half, side.half, y - 0.12, y + 0.12, 0, 0.12);
  }
  // Cornice under the eaves (the long sides; all round under a hipped roof).
  for (const [key, side] of Object.entries(sides) as Array<[Side, (typeof sides)[Side]]>) {
    if (roof === 'gable' && (key === 'left' || key === 'right')) continue;
    frameBox(P.trim, side.f, -side.half - 0.2, side.half + 0.2, underEave(0.22) - 0.45, underEave(0.22), 0, 0.22);
  }

  // Roof.
  const eaveY = top - o * pitch;
  const hw = D + o;
  const hl = L + o;
  if (roof === 'gable') {
    for (const s of [1, -1] as const) {
      const eave = s * hw;
      const slope: V3[] = [[-hl, eaveY, eave], [hl, eaveY, eave], [hl, ridgeY, 0], [-hl, ridgeY, 0]];
      const n = faceNormal(slope, [0, 1, s]);
      P.roof.quad(slope[0]!, slope[1]!, slope[2]!, slope[3]!, n);
      P.roof.quad([-hl, eaveY - thick, eave], [-hl, ridgeY - thick, 0], [hl, ridgeY - thick, 0], [hl, eaveY - thick, eave], [-n[0], -n[1], -n[2]]);
      P.roof.quad([-hl, eaveY - thick, eave], [hl, eaveY - thick, eave], [hl, eaveY, eave], [-hl, eaveY, eave], [0, 0, s]);
      for (const sx of [1, -1] as const) P.roof.quad([sx * hl, eaveY - thick, eave], [sx * hl, eaveY, eave], [sx * hl, ridgeY, 0], [sx * hl, ridgeY - thick, 0], [sx, 0, 0]);
    }
    P.trim.box([-hl - 0.05, ridgeY - 0.1, -0.22], [hl + 0.05, ridgeY + 0.18, 0.22]);
  } else {
    // Hipped: equal pitch on all four sides; the ridge shortens by the width.
    const r = Math.max(0, hl - hw);
    const ry = eaveY + hw * pitch;
    const c: V3[] = [[-hl, eaveY, hw], [hl, eaveY, hw], [hl, eaveY, -hw], [-hl, eaveY, -hw]];
    const faces: Array<[V3[], V3]> = [
      [[c[0]!, c[1]!, [r, ry, 0], [-r, ry, 0]], [0, 1, 1]],
      [[c[2]!, c[3]!, [-r, ry, 0], [r, ry, 0]], [0, 1, -1]],
      [[c[1]!, c[2]!, [r, ry, 0]], [1, 1, 0]],
      [[c[3]!, c[0]!, [-r, ry, 0]], [-1, 1, 0]],
    ];
    for (const [pts, hint] of faces) P.roof.flat(pts, faceNormal(pts, hint));
    // Fascia and soffit all round.
    for (const side of Object.values(sides)) frameBox(P.roof, side.f, -side.half - o, side.half + o, eaveY - thick, eaveY, o - 0.02, o);
    P.roof.quad([-hl, eaveY - thick, -hw], [hl, eaveY - thick, -hw], [hl, eaveY - thick, hw], [-hl, eaveY - thick, hw], [0, -1, 0]);
    if (r > 0) P.trim.box([-r - 0.2, ry - 0.1, -0.22], [r + 0.2, ry + 0.18, 0.22]);
  }

  // Dormers: a small gabled window box on the slope.
  if (w.dormers) {
    const H = 2.2;
    const dw = 1.0;
    for (const sideName of w.dormers.sides) {
      const s = sideName === 'front' ? 1 : -1;
      for (const u of w.dormers.at) {
        const zf = s * (D - 0.25);
        const zb = s * (D - H / pitch);
        const yH = top + H;
        const yR = yH + 0.75;
        const zr = s * (D - (H + 0.75) / pitch);
        const n: V3 = [0, 0, s];
        P.wall.flat([[u - dw, top, zf], [u + dw, top, zf], [u + dw, yH, zf], [u - dw, yH, zf]], n);
        P.wall.flat([[u - dw, yH, zf], [u + dw, yH, zf], [u, yR, zf]], n);
        for (const sx of [1, -1] as const) {
          P.wall.flat([[u + sx * dw, top + 0.25 * pitch, zf], [u + sx * dw, yH, zf], [u + sx * dw, yH, zb]], [sx, 0, 0]);
          const slope: V3[] = [[u + sx * (dw + 0.15), yH - 0.05, zf + s * 0.3], [u + sx * (dw + 0.15), yH - 0.05, zb], [u, yR, zr], [u, yR, zf + s * 0.3]];
          P.roof.flat(slope, faceNormal(slope, [sx, 1, 0]));
        }
        opening(P.glass, P.trim, wallFrame([u, 0, zf], n), 0, top + 0.35, 0.9, 1.6, 0.18);
      }
    }
  }

  // Windows, floor by floor, where nothing else covers the wall; the door on its floor.
  const door = w.door;
  for (const [key, side] of Object.entries(sides) as Array<[Side, (typeof sides)[Side]]>) {
    const choice = w.windows?.[key] ?? 'auto';
    if (choice === 'none') continue;
    let us: number[];
    if (choice === 'auto') {
      const n = Math.max(1, Math.floor((side.half * 2 - 2.4) / WINDOW_SPACING) + 1);
      const span = (n - 1) * WINDOW_SPACING;
      us = Array.from({ length: n }, (_, i) => -span / 2 + i * WINDOW_SPACING);
    } else us = choice;
    for (let f = 0; f < w.floors; f++) {
      const v0 = base + f * fh + (f === 0 ? 0.9 : 0.7);
      // Up to the next string course, or under the cornice on the top floor.
      const limit = f === w.floors - 1 ? underEave(0.22) - 0.75 : base + (f + 1) * fh - 0.45;
      const h = Math.min(2.6, limit - v0);
      if (h < 1.1) continue;
      for (const u of us) {
        if (door && door.side === key && f === 0 && Math.abs(u - (door.u ?? 0)) < (door.width ?? 2.4) / 2 + 1.3) continue;
        // Ask the building what stands just outside this window.
        const outside = [side.f.o[0] + side.f.t[0] * u + side.f.n[0] * 0.6, side.f.o[2] + side.f.t[2] * u + side.f.n[2] * 0.6] as const;
        const [bx, bz] = toBuilding(outside[0], outside[1]);
        if (coveredTo(spec, w, bx, bz) > v0) continue;
        opening(P.glass, P.trim, side.f, u, v0, 1.2, h, 0.3);
      }
    }
  }
  if (roof === 'gable' && (w.gableWindows ?? true) && D * pitch > 3.2) {
    for (const key of ['left', 'right'] as const) {
      const side = sides[key];
      const outside = [side.f.o[0] + side.f.n[0] * 0.6, side.f.o[2] + side.f.n[2] * 0.6] as const;
      const [bx, bz] = toBuilding(outside[0], outside[1]);
      if (coveredTo(spec, w, bx, bz) > top + 0.6) continue;
      opening(P.glass, P.trim, side.f, 0, top + 0.6, 1.1, Math.min(2.6, D * pitch - 1.2), 0.3);
    }
  }
  if (door) {
    const f = sides[door.side].f;
    const dw = door.width ?? 2.4;
    const steps = door.steps ?? 3;
    opening(P.door, P.trim, f, door.u ?? 0, base, dw, door.height ?? 4, 0.55, false);
    for (let i = 0; i < steps; i++) frameBox(P.trim, f, (door.u ?? 0) - dw / 2 - 0.8, (door.u ?? 0) + dw / 2 + 0.8, SINK, (base / steps) * (i + 1), 0, 0.12 + (steps - i) * 0.45);
  }
  setAll(P, 0, 0, 0);
  return roof === 'gable' ? ridgeY + 0.18 : eaveY + hw * pitch + (hl > hw ? 0.18 : 0);
}

/** Builds one tower; returns its highest point. */
function buildTower(P: Record<BuildingPart, Part>, spec: BuildingSpec, t: TowerSpec): number {
  setAll(P, 0, 0, 0);
  const base = t.plinth ?? DEFAULTS.plinth;
  const { x: tx, z: tz, size: R, height: top } = t;
  const roofBase = top + 0.6;
  const tip = roofBase - 0.25 + t.roofHeight;
  if (t.shape === 'round') {
    ring(P.trim, tx, tz, R + PLINTH_OUT, R + PLINTH_OUT, SINK, base, SEGMENTS, R);
    ring(P.wall, tx, tz, R, R, base, top, SEGMENTS, R);
    ring(P.trim, tx, tz, R + 0.3, R + 0.3, top, roofBase, SEGMENTS, R);
    ring(P.trim, tx, tz, R, R + 0.3, top - 0.3, top, SEGMENTS, R);
    ring(P.roof, tx, tz, R + 0.55, 0.001, roofBase - 0.25, tip, SEGMENTS, R);
    ring(P.roof, tx, tz, R + 0.55, R + 0.55, roofBase - 0.45, roofBase - 0.25, SEGMENTS, R);
    disc(P.roof, tx, tz, R + 0.55, roofBase - 0.45, SEGMENTS, false);
    // Slit windows climbing round, facing away from whatever the tower stands against.
    for (let k = 0, v = base + 2.2; v < top - 2.4; k++, v += 3.6) {
      for (let tries = 0; tries < 8; tries++) {
        const a = (k * 0.62 + tries * 0.25) * Math.PI;
        const n: V3 = [Math.cos(a), 0, Math.sin(a)];
        if (coveredTo(spec, t, tx + n[0] * (R + 0.6), tz + n[2] * (R + 0.6)) > v) continue;
        opening(P.glass, P.trim, wallFrame([tx + n[0] * R, 0, tz + n[2] * R], n), 0, v, 0.55, 1.7, 0.22);
        break;
      }
    }
  } else {
    P.trim.box([tx - R - PLINTH_OUT, SINK, tz - R - PLINTH_OUT], [tx + R + PLINTH_OUT, base, tz + R + PLINTH_OUT], ['-y']);
    const faces: Array<[V3, V3]> = [
      [[tx, 0, tz + R], [0, 0, 1]],
      [[tx, 0, tz - R], [0, 0, -1]],
      [[tx + R, 0, tz], [1, 0, 0]],
      [[tx - R, 0, tz], [-1, 0, 0]],
    ];
    const through = (n: V3) => (t.passage === 'z' && n[2] !== 0) || (t.passage === 'x' && n[0] !== 0);
    const archH = 4.2;
    const archW = Math.min(3.2, R * 1.2);
    for (const [o, n] of faces) {
      const f = wallFrame(o, n);
      frameQuad(P.wall, f, -R, R, base, top);
      // A gate through the foot (oak gates in a deep arch).
      if (through(n)) opening(P.door, P.trim, f, 0, 0, archW, archH, 0.5, false);
      frameBox(P.trim, f, -R - 0.3, R + 0.3, top - 0.5, top, 0, 0.25);
      // Windows up the face where it is free, and the belfry on top.
      for (let v = base + (through(n) ? archH + 1.4 : 2.2); v < top - (t.belfry ? 5.5 : 2.6); v += 3.8) {
        if (coveredTo(spec, t, o[0] + n[0] * 0.6, o[2] + n[2] * 0.6) > v) continue;
        opening(P.glass, P.trim, f, 0, v, 0.7, 1.9, 0.24);
      }
      if (t.belfry) {
        const bw = Math.min(1.4, R * 0.55);
        for (const u of R > 2.6 ? [-R * 0.42, R * 0.42] : [0]) opening(P.door, P.trim, f, u, top - 4.6, bw, 3.4, 0.25);
      }
    }
    // Quoins.
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        for (let k = 0, y = base; y < top - 0.5; k++, y += 0.55) {
          const y1 = Math.min(top - 0.5, y + 0.51);
          const a = k % 2 === 0 ? 0.9 : 0.45;
          const b = k % 2 === 0 ? 0.45 : 0.9;
          const x = tx + sx * R;
          const z = tz + sz * R;
          P.trim.box([Math.min(x, x - sx * a), y, Math.min(z, z + sz * 0.1)], [Math.max(x, x - sx * a), y1, Math.max(z, z + sz * 0.1)]);
          P.trim.box([Math.min(x, x + sx * 0.1), y, Math.min(z, z - sz * b)], [Math.max(x, x + sx * 0.1), y1, Math.max(z, z - sz * b)]);
        }
      }
    }
    // Pyramid roof with overhang and a soffit.
    const e = R + 0.55;
    const y0 = roofBase - 0.25;
    const apex: V3 = [tx, tip, tz];
    const ring4: V3[] = [[tx - e, y0, tz + e], [tx + e, y0, tz + e], [tx + e, y0, tz - e], [tx - e, y0, tz - e]];
    for (let i = 0; i < 4; i++) {
      const tri = [ring4[i]!, ring4[(i + 1) % 4]!, apex];
      const mid: V3 = [(ring4[i]![0] + ring4[(i + 1) % 4]![0]) / 2 - tx, 1, (ring4[i]![2] + ring4[(i + 1) % 4]![2]) / 2 - tz];
      P.roof.flat(tri, faceNormal(tri, mid));
    }
    P.roof.box([tx - e, y0 - 0.2, tz - e], [tx + e, y0, tz + e], ['+y']);
  }
  // Finial.
  P.trim.box([tx - 0.08, tip - 0.2, tz - 0.08], [tx + 0.08, tip + 0.9, tz + 0.08]);
  return tip + 0.9;
}
