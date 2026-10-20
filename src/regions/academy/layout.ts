import { ACADEMY } from '../../config/world';
import { spawnLayout } from '../spawn/layout';

/**
 * Where the academy stands (pure, so workers and the main thread agree):
 * beside the spawn plaza, door towards the fountain, on a pad at plaza level.
 *
 * Building frame: origin at the hall's centre on the pad, +Z out of the front
 * (towards the plaza), X along the hall. The world rotation is `rotation` about Y
 * (three.js convention), so local (lx, lz) lands at
 * (x + lx·cos r + lz·sin r, z − lx·sin r + lz·cos r).
 */
export interface AcademyLayout {
  x: number;
  z: number;
  /** Pad level (= the plaza's). */
  y: number;
  rotation: number;
  /** Tower centre in the building frame. */
  tower: { x: number; z: number };
}

let cached: AcademyLayout | null = null;

export function academyLayout(): AcademyLayout {
  if (cached) return cached;
  const { plaza } = spawnLayout();
  const h = ACADEMY.heading;
  cached = {
    x: plaza.x + Math.sin(h) * ACADEMY.distance,
    z: plaza.z - Math.cos(h) * ACADEMY.distance,
    y: plaza.y,
    // Local +Z = (sin r, cos r) must point back at the plaza: (−sin h, cos h).
    rotation: -h,
    // On the front corner at −X (to the left, seen from the plaza).
    tower: { x: -ACADEMY.hall.width / 2, z: ACADEMY.hall.depth / 2 },
  };
  return cached;
}

/** World point → building frame. */
export function toLocal(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const a = academyLayout();
  const dx = x - a.x;
  const dz = z - a.z;
  const c = Math.cos(a.rotation);
  const s = Math.sin(a.rotation);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

/** Building frame → world point. */
export function toWorld(lx: number, lz: number, out: { x: number; z: number }): { x: number; z: number } {
  const a = academyLayout();
  const c = Math.cos(a.rotation);
  const s = Math.sin(a.rotation);
  out.x = a.x + lx * c + lz * s;
  out.z = a.z - lx * s + lz * c;
  return out;
}

const local = { x: 0, z: 0 };

/** Bounding radius of the footprint around the hall centre, for quick rejects. */
export const ACADEMY_RADIUS = Math.hypot(ACADEMY.hall.width / 2 + ACADEMY.tower.radius, ACADEMY.hall.depth / 2 + ACADEMY.tower.radius);

/**
 * Distance from the building's walls (hall, tower and front steps), meters;
 * negative inside. Far points return a cheap lower bound.
 */
export function academyDistance(x: number, z: number): number {
  const a = academyLayout();
  const far = Math.hypot(x - a.x, z - a.z) - ACADEMY_RADIUS;
  if (far > 40) return far;
  toLocal(x, z, local);
  const { hall, tower, door } = ACADEMY;
  // Hall rectangle, with the steps in front of the door.
  const box = (hx: number, hz: number, cx: number, cz: number) => {
    const qx = Math.abs(local.x - cx) - hx;
    const qz = Math.abs(local.z - cz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  };
  const hallD = box(hall.width / 2, hall.depth / 2, 0, 0);
  const stepDepth = 0.12 + door.steps * 0.45;
  const stepsD = box(door.width / 2 + 0.8, stepDepth / 2, 0, hall.depth / 2 + stepDepth / 2);
  const towerD = Math.hypot(local.x - a.tower.x, local.z - a.tower.z) - tower.radius;
  return Math.min(hallD, stepsD, towerD);
}
