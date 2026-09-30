import { SPAWN, WORLD_SIZE } from '../config/world';
import { cameraRig, player } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';

/**
 * Fixed camera views, so the same spots can be compared before and after a
 * change (by eye or by the e2e screenshots). Open one with `#v-<id>` in the URL,
 * e.g. `#v-coast`, or from the F3 panel.
 */
export interface CameraView {
  id: string;
  label: string;
  x: number;
  z: number;
  /** World point the camera looks toward. */
  target: { x: number; z: number };
  pitch: number;
  distance: number;
}

const PEAK = { x: 34_500, z: 49_500 }; // highest snowy peak, ~1 070 m

export const VIEWS: readonly CameraView[] = [
  { id: 'spawn', label: 'Spawn', x: SPAWN.x, z: SPAWN.z, target: { x: SPAWN.x, z: SPAWN.z - 1_000 }, pitch: 0.35, distance: 22 },
  { id: 'coast', label: 'Kyst', x: 50_500, z: 47_000, target: { x: 50_700, z: 45_500 }, pitch: 0.3, distance: 26 },
  { id: 'shore', label: 'Strand', x: 51_000, z: 46_760, target: { x: 51_050, z: 45_500 }, pitch: 0.22, distance: 20 },
  { id: 'valley', label: 'Dal', x: 47_000, z: 47_000, target: PEAK, pitch: 0.25, distance: 22 },
  { id: 'mountain', label: 'Fjell', x: 37_500, z: 49_800, target: PEAK, pitch: 0.2, distance: 30 },
  { id: 'edge', label: 'Verdenskanten', x: 3_500, z: WORLD_SIZE / 2, target: { x: 0, z: WORLD_SIZE / 2 }, pitch: 0.3, distance: 60 },
];

export function applyView(id: string): boolean {
  const view = VIEWS.find((v) => v.id === id);
  if (!view) return false;
  const dx = view.target.x - view.x;
  const dz = view.target.z - view.z;
  useGameStore.getState().teleport(view.x, view.z);
  player.heading = Math.atan2(dx, dz);
  // The camera sits behind the player: forward = (-sin yaw, -cos yaw).
  cameraRig.yaw = Math.atan2(-dx, -dz);
  cameraRig.pitch = view.pitch;
  cameraRig.distance = view.distance;
  return true;
}

/** '#v-coast' → 'coast'. Only plain tokens, so the hash also survives hosted previews. */
export function viewIdFromHash(hash: string): string | null {
  const m = /^#v-([a-z]+)$/.exec(hash);
  return m ? m[1]! : null;
}
