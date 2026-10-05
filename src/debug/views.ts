import { GIANTS, SPAWN, WORLD_SIZE } from '../config/world';
import { GIANT_TREES } from '../regions/giants/layout';
import { heightAt } from '../world/terrain';
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

/**
 * A view of each giant tree: from whichever of eight directions sees it best
 * (the sight line from the camera to the crown stays clear of the ground),
 * close enough that it towers.
 */
function giantView(g: (typeof GIANT_TREES)[number], i: number): CameraView {
  const range = 75;
  const foot = heightAt(g.x, g.z);
  let best = { score: -Infinity, x: g.x, z: g.z };
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = g.x + Math.cos(a) * range;
    const z = g.z + Math.sin(a) * range;
    const eye = heightAt(x, z) + 3;
    // Clearance of the sight line from the eye to half the tree's height.
    let clear = Infinity;
    for (let s = 0.1; s < 1; s += 0.1) clear = Math.min(clear, eye + (foot + GIANTS.height / 2 - eye) * s - heightAt(x + (g.x - x) * s, z + (g.z - z) * s));
    if (clear > best.score) best = { score: clear, x, z };
  }
  return { id: `giant-${i + 1}`, label: g.name, x: best.x, z: best.z, target: { x: g.x, z: g.z }, pitch: 0.02, distance: 14 };
}

const GIANT_VIEWS: CameraView[] = GIANT_TREES.map(giantView);

export const VIEWS: readonly CameraView[] = [
  { id: 'spawn', label: 'Spawn', x: SPAWN.x, z: SPAWN.z, target: { x: SPAWN.x, z: SPAWN.z - 1_000 }, pitch: 0.35, distance: 22 },
  { id: 'coast', label: 'Kyst', x: 50_500, z: 47_000, target: { x: 50_700, z: 45_500 }, pitch: 0.3, distance: 26 },
  { id: 'shore', label: 'Strand', x: 51_000, z: 46_760, target: { x: 51_050, z: 45_500 }, pitch: 0.22, distance: 20 },
  { id: 'valley', label: 'Dal', x: 47_000, z: 47_000, target: PEAK, pitch: 0.25, distance: 22 },
  { id: 'mountain', label: 'Fjell', x: 37_500, z: 49_800, target: PEAK, pitch: 0.2, distance: 30 },
  { id: 'forest', label: 'Skogutsikt', x: 52_000, z: 38_000, target: { x: 47_000, z: 43_000 }, pitch: 0.45, distance: 60 },
  { id: 'snowforest', label: 'Snøskog', x: 59_500, z: 33_500, target: { x: 61_500, z: 34_500 }, pitch: 0.3, distance: 30 },
  { id: 'oldgrowth', label: 'Urskog', x: 55_500, z: 52_500, target: { x: 55_800, z: 53_500 }, pitch: 0.12, distance: 16 },
  ...GIANT_VIEWS,
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
