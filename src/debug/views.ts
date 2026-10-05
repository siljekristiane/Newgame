import { GIANTS, SPAWN, WORLD_SIZE } from '../config/world';
import { GIANT_TREES } from '../regions/giants/layout';
import { groundHeightAt } from '../world/ground';
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
 * A view of each giant tree: from whichever direction and distance sees it
 * best. The sight line from the camera to the foot of the tree must clear the
 * rendered ground, and the whole tree must fit in the frame (the camera looks
 * down at the player by `pitch`, so a tree uphill needs the camera further back).
 */
function giantView(g: (typeof GIANT_TREES)[number], i: number): CameraView {
  const foot = groundHeightAt(g.x, g.z);
  const halfFov = 0.4; // radians above the view centre that still show
  let best = { score: -Infinity, x: g.x, z: g.z, back: 30, pitch: 0.15 };
  let fallback = { score: -Infinity, x: g.x + 120, z: g.z, back: 60, pitch: 0.1 };
  for (const [back, pitch] of [[30, 0.15], [60, 0.1], [90, 0.08]] as const) {
    for (const range of [60, 90, 120, 160, 200]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = g.x + Math.cos(a) * range;
        const z = g.z + Math.sin(a) * range;
        const cx = g.x + Math.cos(a) * (range + back);
        const cz = g.z + Math.sin(a) * (range + back);
        // The camera sits back*sin(pitch) above the player's chest, but never in the ground (the
        // follow camera lifts it), and then it looks down more steeply at the player.
        const chest = groundHeightAt(x, z) + 1;
        const eye = Math.max(chest + back * Math.sin(pitch), groundHeightAt(cx, cz) + 1.5);
        const look = Math.atan((eye - chest) / back);
        let clear = Infinity;
        for (let s = 0.05; s < 0.95; s += 0.05) clear = Math.min(clear, eye + (foot + 5 - eye) * s - groundHeightAt(cx + (g.x - cx) * s, cz + (g.z - cz) * s));
        const top = Math.atan((foot + GIANTS.height - eye) / (range + back));
        // Closer is better (the tree towers); a little preference for a middling distance.
        const score = Math.min(clear, 6) - back * 0.05 - Math.abs(range - 90) * 0.02;
        // If nothing fits, the clearest view that comes closest to fitting.
        const near = Math.min(clear, 6) - Math.max(0, top + look - halfFov) * 40;
        if (near > fallback.score) fallback = { score: near, x, z, back, pitch };
        if (clear < 4 || top + look > halfFov) continue;
        if (score > best.score) best = { score, x, z, back, pitch };
      }
    }
  }
  if (best.score === -Infinity) best = fallback;
  return { id: `giant-${i + 1}`, label: g.name, x: best.x, z: best.z, target: { x: g.x, z: g.z }, pitch: best.pitch, distance: best.back };
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
