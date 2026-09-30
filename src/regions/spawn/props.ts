import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pathPalette, world } from '../../design/tokens';

/**
 * Procedural meshes for the spawn area's furniture, in meters, standing on
 * y = 0. Colours are vertex colours, so each piece is one draw call (lamps
 * are instanced).
 */

function paint(g: THREE.BufferGeometry, hex: string, shade = 1): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const c = new THREE.Color(hex).multiplyScalar(shade);
  const n = geo.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** Lamp post: base, fluted post, arm reaching along +X, cap over the lantern. */
export function createLampPostGeometry(): THREE.BufferGeometry {
  const iron = world.pineShadow;
  const base = new THREE.CylinderGeometry(0.16, 0.2, 0.35, 8);
  base.translate(0, 0.175, 0);
  const post = new THREE.CylinderGeometry(0.055, 0.075, 3.2, 8);
  post.translate(0, 1.95, 0);
  const arm = new THREE.BoxGeometry(0.75, 0.05, 0.05);
  arm.translate(0.35, 3.4, 0);
  const cap = new THREE.ConeGeometry(0.2, 0.18, 6);
  cap.translate(0.7, 3.28, 0);
  const finial = new THREE.SphereGeometry(0.07, 8, 6);
  finial.translate(0, 3.6, 0);
  return merge([paint(base, iron, 0.8), paint(post, iron), paint(arm, iron), paint(cap, iron), paint(finial, world.lamp, 0.6)]);
}

/** The glass of the lantern hanging from the arm (lit at night). */
export function createLanternGeometry(): THREE.BufferGeometry {
  const glass = new THREE.CylinderGeometry(0.13, 0.1, 0.3, 6);
  glass.translate(0.7, 3.04, 0);
  glass.computeBoundingSphere();
  return glass;
}

/** Where the light sits on a lamp, relative to its base (for glow sprites). */
export const LANTERN_OFFSET = new THREE.Vector3(0.7, 3.04, 0);

/**
 * Two-tier fountain: a round basin with a lip, a pedestal, an upper bowl and a
 * socket for the crystal. Profile rotated around Y (lathe).
 */
export function createFountainGeometry(): THREE.BufferGeometry {
  const stone = pathPalette.paving;
  const p = (pts: Array<[number, number]>) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const basin = new THREE.LatheGeometry(
    p([
      [0.01, 0.05],
      [3.1, 0.05],
      [3.1, 0.55],
      [3.5, 0.6],
      [3.6, 0.7],
      [3.35, 0.72],
      [3.3, 0.02],
    ]),
    48,
  );
  const pedestal = new THREE.LatheGeometry(
    p([
      [0.55, 0],
      [0.45, 0.3],
      [0.3, 0.5],
      [0.26, 1.4],
      [0.35, 1.55],
      [1.3, 1.65],
      [1.4, 1.85],
      [1.2, 1.9],
      [0.25, 1.8],
      [0.22, 2.3],
      [0.32, 2.45],
      [0.01, 2.5],
    ]),
    32,
  );
  return merge([paint(basin, stone, 1.1), paint(pedestal, stone, 1.15)]);
}

/** Water surfaces of the basin and the upper bowl, as flat discs. */
export function createFountainWaterGeometry(): THREE.BufferGeometry {
  const lower = new THREE.CircleGeometry(3.1, 48);
  lower.rotateX(-Math.PI / 2);
  lower.translate(0, 0.45, 0);
  const upper = new THREE.CircleGeometry(1.25, 32);
  upper.rotateX(-Math.PI / 2);
  upper.translate(0, 1.8, 0);
  return merge([lower, upper]);
}

/** The crystal on top: a stretched octahedron. */
export function createCrystalGeometry(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(0.35, 0);
  g.scale(1, 2.2, 1);
  g.translate(0, 2.5 + 0.35 * 2.2, 0);
  g.computeVertexNormals();
  return g;
}
