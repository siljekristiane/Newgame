import { BUILDINGS } from '../../config/world';
import { naturalHeightAt } from '../../world/naturalTerrain';
import { spawnLayout } from '../spawn/layout';
import { buildingDistance, stepHeight } from './buildingKit';
import { DESIGNS, type BuildingDesign } from './designs';

/**
 * Where each building stands (pure, so workers and the main thread agree):
 * world position, turn and pad level, from BUILDINGS.sites and the plaza.
 *
 * Building frame: origin on the pad at the site, +Z out of the front. The
 * turn follows three.js rotation.y, so local (lx, lz) lands at
 * (x + lx·cos r + lz·sin r, z − lx·sin r + lz·cos r).
 */
export interface PlacedBuilding {
  id: string;
  design: BuildingDesign;
  x: number;
  z: number;
  rotation: number;
  /** Pad level. */
  y: number;
  /** Reach of the footprint from the site, meters (quick rejects). */
  radius: number;
  /** Ground eases from the pad back to the land over this distance. */
  padBlend: number;
}

let cached: PlacedBuilding[] | null = null;

export function placedBuildings(): readonly PlacedBuilding[] {
  cached ??= place();
  return cached;
}

export function buildingById(id: string): PlacedBuilding {
  const b = placedBuildings().find((p) => p.id === id);
  if (!b) throw new Error(`no building "${id}"`);
  return b;
}

/** World point → a building's frame. */
export function toLocal(b: PlacedBuilding, x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

/** A building's frame → world point. */
export function toWorld(b: PlacedBuilding, lx: number, lz: number, out: { x: number; z: number }): { x: number; z: number } {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  out.x = b.x + lx * c + lz * s;
  out.z = b.z - lx * s + lz * c;
  return out;
}

const local = { x: 0, z: 0 };

/** Distance from a building's walls, meters (negative inside); far points get a cheap lower bound. */
export function distanceTo(b: PlacedBuilding, x: number, z: number): number {
  const far = Math.hypot(x - b.x, z - b.z) - b.radius;
  if (far > 30) return far;
  toLocal(b, x, z, local);
  return buildingDistance(b.design.spec, local.x, local.z);
}

/** The nearest building and the distance from its walls. */
export function nearestBuilding(x: number, z: number): { building: PlacedBuilding; distance: number } {
  let best = { building: placedBuildings()[0]!, distance: Infinity };
  for (const b of placedBuildings()) {
    const d = distanceTo(b, x, z);
    if (d < best.distance) best = { building: b, distance: d };
  }
  return best;
}

function footprintRadius(design: BuildingDesign): number {
  let r = 0;
  for (const w of design.spec.wings) r = Math.max(r, Math.hypot(Math.abs(w.x) + Math.max(w.length, w.width) / 2, Math.abs(w.z) + Math.max(w.length, w.width) / 2));
  for (const t of design.spec.towers ?? []) r = Math.max(r, Math.hypot(t.x, t.z) + t.size * Math.SQRT2);
  // Plinth, steps and a little extra.
  return r + 2;
}

function place(): PlacedBuilding[] {
  const { plaza } = spawnLayout();
  return BUILDINGS.sites.map((site) => {
    const design = DESIGNS.find((d) => d.id === site.design);
    if (!design) throw new Error(`no design "${site.design}"`);
    const radius = footprintRadius(design);
    const b: PlacedBuilding = {
      id: site.id,
      design,
      x: plaza.x + site.dx,
      z: plaza.z + site.dz,
      rotation: site.rotation,
      y: plaza.y,
      radius,
      padBlend: radius < BUILDINGS.smallRadius ? BUILDINGS.smallPadBlend : BUILDINGS.padBlend,
    };
    // Out of the plaza's reach, the pad sits at the mean natural ground under the walls.
    if (Math.hypot(site.dx, site.dz) > BUILDINGS.plazaLevelWithin) {
      let sum = 0;
      let n = 0;
      for (let lx = -radius; lx <= radius; lx += 2) {
        for (let lz = -radius; lz <= radius; lz += 2) {
          if (buildingDistance(design.spec, lx, lz) > 0) continue;
          const p = toWorld(b, lx, lz, { x: 0, z: 0 });
          sum += naturalHeightAt(p.x, p.z);
          n++;
        }
      }
      if (n > 0) b.y = sum / n;
    }
    return b;
  });
}

/** Ground the player can stand on from the buildings (door steps), world height, or -Infinity. */
export function standHeight(x: number, z: number): number {
  let h = -Infinity;
  for (const b of placedBuildings()) {
    if (Math.hypot(x - b.x, z - b.z) > b.radius) continue;
    toLocal(b, x, z, local);
    const step = stepHeight(b.design.spec, local.x, local.z);
    if (step > 0) h = Math.max(h, b.y + step);
  }
  return h;
}
