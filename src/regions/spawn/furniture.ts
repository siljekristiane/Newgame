import { SPAWN_AREA } from '../../config/world';
import { groundHeightAt } from '../../world/ground';
import type { SpawnLayout } from './layout';

/**
 * Where the spawn area's lamps stand (pure): along every path at a fixed
 * spacing, alternating sides, and in a ring round the plaza, leaving the path
 * openings free.
 */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  /** Rotation about Y so the arm reaches over the path (radians). */
  rotation: number;
}

export function placeLamps({ plaza, paths }: SpawnLayout): Lamp[] {
  const { lampSpacing, lampOffset, plazaLamps } = SPAWN_AREA;
  const lamps: Lamp[] = [];
  const at = (x: number, z: number, rotation: number) => lamps.push({ x, y: groundHeightAt(x, z), z, rotation });

  // Round the plaza, but not where a path leaves it.
  const openings = paths.map((p) => Math.atan2(p[0]!.z - plaza.z, p[0]!.x - plaza.x));
  for (let i = 0; i < plazaLamps; i++) {
    const a = (i / plazaLamps) * Math.PI * 2 + Math.PI / plazaLamps;
    const blocked = openings.some((o) => Math.abs(Math.atan2(Math.sin(a - o), Math.cos(a - o))) < 0.3);
    if (blocked) continue;
    const r = plaza.radius - 1.2;
    // Arm pointing in toward the fountain.
    at(plaza.x + Math.cos(a) * r, plaza.z + Math.sin(a) * r, -a + Math.PI);
  }

  // Along the paths.
  paths.forEach((path) => {
    const every = Math.round(lampSpacing / SPAWN_AREA.pathSpacing);
    for (let i = every; i < path.length - 1; i += every) {
      const p = path[i]!;
      const next = path[i + 1]!;
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const side = (i / every) % 2 === 0 ? 1 : -1;
      // Left-hand normal of the direction of travel, times the side.
      const nx = (dz / len) * side;
      const nz = (-dx / len) * side;
      const x = p.x + nx * lampOffset;
      const z = p.z + nz * lampOffset;
      // The arm (local +X) points back over the path.
      at(x, z, Math.atan2(nz, -nx));
    }
  });
  return lamps;
}
