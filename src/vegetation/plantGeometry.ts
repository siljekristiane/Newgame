import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_SEED } from '../config/world';
import { vegetationPalette } from '../design/tokens';
import { mulberry32 } from '../world/noise';
import type { PlantKind } from '../world/vegetation';

/**
 * Procedural low-poly plant and boulder meshes, in meters, standing on y = 0.
 * Every vertex carries a colour and `sway` (0 = rigid, 1 = moves most in the
 * wind), so one material draws all kinds. `detail` 1 is for LOD 0, 0 for LOD 1.
 */

type Part = THREE.BufferGeometry;

const color = (hex: string) => new THREE.Color(hex);

/** Per-vertex colour, shading and sway on a part (made non-indexed first). */
function finish(g: THREE.BufferGeometry, base: THREE.Color, shade: (p: THREE.Vector3) => number, sway: (p: THREE.Vector3) => number): Part {
  return finishColor(g, (p, out) => out.copy(base).multiplyScalar(shade(p)), sway);
}

/** Like `finish`, with a colour per vertex (for hue shifts, not just shading). */
function finishColor(g: THREE.BufferGeometry, paint: (p: THREE.Vector3, out: THREE.Color) => void, sway: (p: THREE.Vector3) => number): Part {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const sways = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    paint(p, c);
    colors.set([c.r, c.g, c.b], v * 3);
    sways[v] = sway(p);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('sway', new THREE.BufferAttribute(sways, 1));
  return geo;
}

/** A stable 0..1 value per position: shared corners get the same, so colour noise stays smooth. */
function jitter(p: THREE.Vector3): number {
  const h = Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Radial jitter that depends only on direction, so shared corners stay welded. */
function lumpy(g: THREE.BufferGeometry, amount: number, seed: number): void {
  const pos = g.getAttribute('position');
  const p = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const d = p.clone().normalize();
    const k = 1 + amount * (Math.sin(d.x * 4.1 + seed) * Math.sin(d.y * 3.7 + seed * 2.3) + 0.6 * Math.sin(d.z * 5.3 - seed));
    pos.setXYZ(v, p.x * k, p.y * k, p.z * k);
  }
}

/** Normals pointing away from a centre: soft, rounded light on foliage. */
function sphericalNormals(g: THREE.BufferGeometry, center: THREE.Vector3, flatten = 0.6): void {
  const pos = g.getAttribute('position');
  const normals = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v).sub(center);
    p.y += flatten * p.length(); // tilt up a little: lit more like the top of a crown
    p.normalize();
    normals.set([p.x, p.y, p.z], v * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

/**
 * Bend normals upward: foliage scatters light, so its shaded side should pick
 * up sky light instead of going black against the sun.
 */
function tiltNormals(g: THREE.BufferGeometry, up: number): void {
  const n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    v.y += up;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

function trunk(radius: number, height: number, detail: number): Part {
  const g = new THREE.CylinderGeometry(radius * 0.6, radius, height, detail ? 6 : 4, 1, true);
  g.translate(0, height / 2, 0);
  return finish(g, color(vegetationPalette.bark), (p) => 0.8 + (p.y / height) * 0.3, () => 0);
}

function conifer(detail: number): Part {
  const random = mulberry32(WORLD_SEED + 71);
  const parts: Part[] = [trunk(0.3, 4, detail)];
  const tiers = detail ? 6 : 3;
  // An even number of rim points: every other one is a branch tip, the rest the gaps between.
  const segments = detail ? 12 : 6;
  const top = 13;
  const base = color(vegetationPalette.conifer);
  const tip = color(vegetationPalette.coniferTip);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const radius = 3 * (1 - f) ** 1.15 + 0.55;
    const y0 = 2 + f * (top - 3.6);
    const h = (top - y0) * (detail ? 0.42 : 0.7);
    // Open underneath: the camera is never below a branch tier, and it saves a third of the triangles.
    const g = new THREE.ConeGeometry(radius, h, segments, 1, true);
    g.rotateY(random() * Math.PI);
    g.translate(0, y0 + h / 2, 0);
    // A star-shaped, drooping rim: branch tips stick out and hang, the gaps between pull in.
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) > y0 + 0.01) continue;
      const isTip = (v % (segments + 1)) % 2 === 0;
      const k = isTip ? 1.05 + random() * 0.15 : 0.62 + random() * 0.08;
      pos.setX(v, pos.getX(v) * k);
      pos.setZ(v, pos.getZ(v) * k);
      pos.setY(v, pos.getY(v) - (isTip ? 0.7 + random() * 0.5 : 0.2));
    }
    g.computeVertexNormals();
    tiltNormals(g, 0.8);
    parts.push(
      finishColor(
        g,
        (p, out) => {
          const out01 = Math.min(1, Math.hypot(p.x, p.z) / radius);
          // Dark and dense inside, fresh growth at the tips, lighter toward the top.
          out.copy(base).lerp(tip, Math.max(0, out01 - 0.55) * 1.6);
          out.multiplyScalar((0.5 + (p.y / top) * 0.45 + out01 * 0.2) * (0.9 + jitter(p) * 0.2));
        },
        (p) => (p.y / top) ** 2,
      ),
    );
  }
  return merge(parts);
}

function broadleaf(detail: number): Part {
  const random = mulberry32(WORLD_SEED + 73);
  const parts: Part[] = [trunk(0.4, 6, detail)];
  const base = color(vegetationPalette.broadleaf);
  const light = color(vegetationPalette.broadleafLight);
  const center = new THREE.Vector3(0, 6.6, 0);
  const blobs: Array<[number, number, number, number]> = detail
    ? [
        [0, 7.4, 0, 3.3],
        [1.8, 6.2, 0.9, 2.3],
        [-1.5, 6.5, -1.1, 2.4],
        [0.3, 5.6, -1.9, 2],
        [-0.6, 8.9, 0.8, 1.7],
        [1.2, 8.3, -1.2, 1.6],
      ]
    : [
        [0, 7.2, 0, 3.6],
        [1.2, 6, 0.4, 2.6],
      ];
  blobs.forEach(([x, y, z, r], i) => {
    // Only the main crown gets the finer sphere; it carries the silhouette.
    const g = new THREE.IcosahedronGeometry(r, i === 0 ? detail : 0);
    lumpy(g, 0.16, i * 1.7 + 1);
    g.scale(1, 0.85, 1);
    g.translate(x, y, z);
    sphericalNormals(g, center);
    // Each leaf cluster its own shade of green; dark underneath and deep inside the crown.
    const sun = random() * 0.6 + (y - 5.5) * 0.12;
    parts.push(
      finishColor(
        g,
        (p, out) => {
          const under = Math.min(1, Math.max(0, (center.y - p.y) / 3.5));
          const depth = 1 - Math.min(1, p.distanceTo(center) / 4.5);
          out.copy(base).lerp(light, Math.min(1, Math.max(0, sun)) * (1 - under));
          out.multiplyScalar((0.95 - under * 0.4 - depth * 0.25) * (0.92 + jitter(p) * 0.16));
        },
        (p) => Math.min(1, (p.y / 10) ** 2),
      ),
    );
  });
  return merge(parts);
}

function bush(detail: number): Part {
  const base = color(vegetationPalette.bush);
  const parts = (detail ? [[0, 0.7, 0, 1.1], [0.7, 0.55, 0.3, 0.8]] : [[0, 0.7, 0, 1.2]]).map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r!, detail);
    lumpy(g, 0.2, i + 4);
    g.scale(1, 0.75, 1);
    g.translate(x!, y!, z!);
    sphericalNormals(g, new THREE.Vector3(0, 0.3, 0));
    return finish(g, base, (p) => (0.55 + p.y * 0.35) * (0.9 + jitter(p) * 0.2), (p) => Math.min(1, p.y * 0.35));
  });
  return merge(parts);
}

function rock(detail: number): Part {
  const g = new THREE.IcosahedronGeometry(1, detail);
  lumpy(g, 0.28, 9);
  g.scale(1.4, 0.75, 1.1);
  g.translate(0, 0.25, 0); // a third sunk into the ground
  g.computeVertexNormals(); // faceted: reads as broken stone
  return finish(g, color(vegetationPalette.rock), (p) => 0.75 + p.y * 0.25, () => 0);
}

function merge(parts: Part[]): Part {
  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

const BUILDERS: Record<PlantKind, (detail: number) => Part> = { conifer, broadleaf, bush, rock };

export function createPlantGeometry(kind: PlantKind, detail: number): THREE.BufferGeometry {
  const g = BUILDERS[kind](detail);
  g.computeBoundingSphere();
  return g;
}
