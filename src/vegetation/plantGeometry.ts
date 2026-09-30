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
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const sways = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const k = shade(p);
    colors.set([base.r * k, base.g * k, base.b * k], v * 3);
    sways[v] = sway(p);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('sway', new THREE.BufferAttribute(sways, 1));
  return geo;
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
  const tiers = detail ? 4 : 3;
  const top = 13;
  const base = color(vegetationPalette.conifer);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const radius = 2.8 * (1 - f) + 0.6;
    const y0 = 2.2 + f * (top - 4.5);
    const h = (top - y0) * (detail ? 0.55 : 0.7);
    // Open underneath: the camera is never below a branch tier, and it saves a third of the triangles.
    const g = new THREE.ConeGeometry(radius, h, detail ? 8 : 5, 1, true);
    g.rotateY(random() * Math.PI);
    g.translate(0, y0 + h / 2, 0);
    // Droop the rim so tiers read as branches, not stacked cones.
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      if (y < y0 + 0.01) pos.setY(v, y - 0.5 - random() * 0.5);
    }
    g.computeVertexNormals();
    tiltNormals(g, 0.8);
    parts.push(finish(g, base, (p) => 0.62 + (p.y / top) * 0.5 + (Math.hypot(p.x, p.z) / radius) * 0.12, (p) => (p.y / top) ** 2));
  }
  return merge(parts);
}

function broadleaf(detail: number): Part {
  const parts: Part[] = [trunk(0.4, 6, detail)];
  const base = color(vegetationPalette.broadleaf);
  const blobs: Array<[number, number, number, number]> = detail
    ? [
        [0, 7.4, 0, 3.4],
        [1.8, 6.2, 0.9, 2.4],
        [-1.5, 6.5, -1.1, 2.5],
        [0.3, 5.6, -1.9, 2.1],
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
    sphericalNormals(g, new THREE.Vector3(0, 6.2, 0));
    parts.push(finish(g, base, (p) => 0.65 + ((p.y - 3.5) / 7.5) * 0.5, (p) => Math.min(1, (p.y / 10) ** 2)));
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
    return finish(g, base, (p) => 0.7 + p.y * 0.25, (p) => Math.min(1, p.y * 0.35));
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
