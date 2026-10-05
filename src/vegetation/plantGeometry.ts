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
  const tiers = detail ? 5 : 3;
  // An even number of rim points: every other one is a branch tip, the rest the gaps between.
  const segments = detail ? 10 : 6;
  const top = 13;
  const base = color(vegetationPalette.conifer);
  const tip = color(vegetationPalette.coniferTip);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const radius = 3 * (1 - f) ** 1.15 + 0.55;
    const y0 = 2 + f * (top - 3.6);
    const h = (top - y0) * (detail ? 0.48 : 0.7);
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
    // Low-poly clusters; the lumps and the cluster layout carry the silhouette.
    const g = new THREE.IcosahedronGeometry(r, 0);
    lumpy(g, i === 0 ? 0.2 : 0.16, i * 1.7 + 1);
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

/** A limb from a to b: a tapered cylinder (bark), for the spreading oak. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, detail: number): Part {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), detail ? 6 : 4, 1, true);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return finish(g, color(vegetationPalette.bark), (p) => 0.75 + Math.min(0.3, p.y / 30), () => 0);
}

/** A tall, slim pine: bare lower trunk, a compact crown of short drooping tiers up top. */
function conifer2(detail: number): Part {
  const random = mulberry32(WORLD_SEED + 75);
  const top = 15;
  const parts: Part[] = [];
  const trunkG = new THREE.CylinderGeometry(0.18, 0.4, top - 2, detail ? 6 : 4, 1, true);
  trunkG.translate(0, (top - 2) / 2, 0);
  parts.push(finish(trunkG, color(vegetationPalette.bark), (p) => 0.7 + (p.y / top) * 0.4, (p) => (p.y / top) ** 2 * 0.5));
  const tiers = detail ? 4 : 2;
  const segments = detail ? 8 : 5;
  const base = color(vegetationPalette.conifer).multiplyScalar(0.92);
  const tip = color(vegetationPalette.coniferTip);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const radius = 1.9 * (1 - f) + 0.5;
    const y0 = 7.5 + f * (top - 8.5);
    const h = (top - y0) * (detail ? 0.5 : 0.75);
    const g = new THREE.ConeGeometry(radius, h, segments, 1, true);
    g.rotateY(random() * Math.PI);
    g.translate((random() - 0.5) * 0.4, y0 + h / 2, (random() - 0.5) * 0.4);
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) > y0 + 0.01) continue;
      const isTip = (v % (segments + 1)) % 2 === 0;
      const k = isTip ? 1.1 + random() * 0.25 : 0.6;
      pos.setX(v, pos.getX(v) * k);
      pos.setZ(v, pos.getZ(v) * k);
      pos.setY(v, pos.getY(v) - (isTip ? 0.4 + random() * 0.4 : 0.1));
    }
    g.computeVertexNormals();
    tiltNormals(g, 0.8);
    parts.push(
      finishColor(
        g,
        (p, out) => {
          const out01 = Math.min(1, Math.hypot(p.x, p.z) / radius);
          out.copy(base).lerp(tip, Math.max(0, out01 - 0.5) * 1.4);
          out.multiplyScalar((0.55 + (p.y / top) * 0.4 + out01 * 0.15) * (0.9 + jitter(p) * 0.2));
        },
        (p) => (p.y / top) ** 2,
      ),
    );
  }
  return merge(parts);
}

/** A broad oak: short thick trunk, limbs spreading out, a clustered crown wider than it is tall. */
function broadleaf2(detail: number): Part {
  const random = mulberry32(WORLD_SEED + 77);
  const parts: Part[] = [trunk(0.6, 4, detail)];
  const base = color(vegetationPalette.broadleaf).multiplyScalar(0.9);
  const light = color(vegetationPalette.broadleafLight);
  const center = new THREE.Vector3(0, 6.5, 0);
  // Seen from afar (detail 0) the limbs vanish under the crown: two wide clusters are enough.
  const limbs = detail ? 4 : 0;
  const ends: THREE.Vector3[] = [];
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + random() * 0.6;
    const from = new THREE.Vector3(0, 3.4 + random() * 0.6, 0);
    const to = new THREE.Vector3(Math.cos(a) * (3 + random()), 6 + random() * 1.5, Math.sin(a) * (3 + random()));
    parts.push(limb(from, to, 0.35, 0.18, detail));
    ends.push(to);
  }
  if (!detail) ends.push(new THREE.Vector3(1.6, 6.6, 0.8));
  ends.push(new THREE.Vector3(0, 8, 0));
  ends.forEach((e, i) => {
    const r = i === ends.length - 1 ? (detail ? 3 : 3.8) : 2.3 + random() * 0.6;
    const g = new THREE.IcosahedronGeometry(r, 0);
    lumpy(g, 0.2, i * 2.1 + 3);
    g.scale(1.15, 0.7, 1.15);
    g.translate(e.x, e.y + 0.6, e.z);
    sphericalNormals(g, center);
    const sun = random() * 0.5 + (e.y - 6) * 0.15;
    parts.push(
      finishColor(
        g,
        (p, out) => {
          const under = Math.min(1, Math.max(0, (center.y + 0.5 - p.y) / 3));
          out.copy(base).lerp(light, Math.min(1, Math.max(0, sun)) * (1 - under));
          out.multiplyScalar((0.95 - under * 0.45) * (0.92 + jitter(p) * 0.16));
        },
        (p) => Math.min(1, (p.y / 10) ** 2),
      ),
    );
  });
  return merge(parts);
}

/**
 * Old-growth spruce (drawn ~2× a normal tree): a massive trunk bare far up,
 * then many star-shaped, drooping tiers down a long, narrow crown.
 */
function giantConifer(detail: number): Part {
  const random = mulberry32(WORLD_SEED + 79);
  const top = 13.5;
  const parts: Part[] = [];
  const trunkG = new THREE.CylinderGeometry(0.22, 0.6, top - 1, detail ? 8 : 5, 1, true);
  trunkG.translate(0, (top - 1) / 2, 0);
  parts.push(finish(trunkG, color(vegetationPalette.bark).multiplyScalar(0.85), (p) => 0.7 + (p.y / top) * 0.4, (p) => (p.y / top) ** 2 * 0.4));
  // Root flare: a short wide cone at the foot.
  const flare = new THREE.CylinderGeometry(0.6, 1.1, 0.9, detail ? 8 : 5, 1, true);
  flare.translate(0, 0.45, 0);
  parts.push(finish(flare, color(vegetationPalette.bark).multiplyScalar(0.75), () => 0.75, () => 0));
  const tiers = detail ? 7 : 4;
  const segments = detail ? 12 : 6;
  const base = color(vegetationPalette.conifer).multiplyScalar(0.85);
  const tip = color(vegetationPalette.coniferTip);
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const radius = 2.6 * (1 - f) ** 1.1 + 0.45;
    const y0 = 4.2 + f * (top - 5.4);
    const h = (top - y0) * (detail ? 0.38 : 0.6);
    const g = new THREE.ConeGeometry(radius, h, segments, 1, true);
    g.rotateY(random() * Math.PI);
    g.translate(0, y0 + h / 2, 0);
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) > y0 + 0.01) continue;
      const isTip = (v % (segments + 1)) % 2 === 0;
      const k = isTip ? 1.05 + random() * 0.25 : 0.58 + random() * 0.1;
      pos.setX(v, pos.getX(v) * k);
      pos.setZ(v, pos.getZ(v) * k);
      pos.setY(v, pos.getY(v) - (isTip ? 0.6 + random() * 0.5 : 0.15));
    }
    g.computeVertexNormals();
    tiltNormals(g, 0.8);
    parts.push(
      finishColor(
        g,
        (p, out) => {
          const out01 = Math.min(1, Math.hypot(p.x, p.z) / radius);
          out.copy(base).lerp(tip, Math.max(0, out01 - 0.6) * 1.3);
          out.multiplyScalar((0.45 + (p.y / top) * 0.45 + out01 * 0.2) * (0.88 + jitter(p) * 0.24));
        },
        (p) => (p.y / top) ** 2,
      ),
    );
  }
  return merge(parts);
}

/**
 * Old-growth leafy tree (drawn ~2× a normal tree): a tall, slightly bent
 * trunk, limbs high up, and a crown of leaf clusters far above the ground.
 */
function giantBroadleaf(detail: number): Part {
  const random = mulberry32(WORLD_SEED + 81);
  const parts: Part[] = [];
  const base = color(vegetationPalette.broadleaf).multiplyScalar(0.85);
  const light = color(vegetationPalette.broadleafLight);
  // A bent trunk in three pieces, thick at the foot.
  const knots = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, 3.5, 0.1), new THREE.Vector3(0.1, 6.5, -0.25), new THREE.Vector3(0.45, 8.6, 0)];
  const radii = [0.75, 0.5, 0.36, 0.25];
  for (let k = 0; k < 3; k++) parts.push(limb(knots[k]!, knots[k + 1]!, radii[k]!, radii[k + 1]!, detail));
  const flare = new THREE.CylinderGeometry(0.75, 1.25, 0.8, detail ? 8 : 5, 1, true);
  flare.translate(0, 0.4, 0);
  parts.push(finish(flare, color(vegetationPalette.bark).multiplyScalar(0.75), () => 0.75, () => 0));
  const center = new THREE.Vector3(0.3, 9.5, 0);
  const limbs = detail ? 5 : 2;
  const ends: THREE.Vector3[] = [];
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + random() * 0.8;
    const from = knots[2 + (l % 2)]!.clone();
    const to = new THREE.Vector3(Math.cos(a) * (2.6 + random() * 1.2), from.y + 1.8 + random() * 1.4, Math.sin(a) * (2.6 + random() * 1.2));
    parts.push(limb(from, to, 0.24, 0.1, detail));
    ends.push(to);
  }
  ends.push(knots[3]!.clone().add(new THREE.Vector3(0, 1.4, 0)));
  ends.forEach((e, i) => {
    const r = i === ends.length - 1 ? 2.6 : 1.8 + random() * 0.7;
    const g = new THREE.IcosahedronGeometry(r, detail && i === ends.length - 1 ? 1 : 0);
    lumpy(g, 0.22, i * 1.9 + 5);
    g.scale(1.1, 0.75, 1.1);
    g.translate(e.x, e.y + 0.4, e.z);
    sphericalNormals(g, center);
    const sun = random() * 0.6 + (e.y - 9) * 0.12;
    parts.push(
      finishColor(
        g,
        (p, out) => {
          const under = Math.min(1, Math.max(0, (center.y - p.y) / 2.5));
          out.copy(base).lerp(light, Math.min(1, Math.max(0, sun)) * (1 - under));
          out.multiplyScalar((0.95 - under * 0.45) * (0.9 + jitter(p) * 0.2));
        },
        (p) => Math.min(1, (p.y / 12) ** 2),
      ),
    );
  });
  return merge(parts);
}

function bush(detail: number): Part {
  const base = color(vegetationPalette.bush);
  const parts = (detail ? [[0, 0.7, 0, 1.1], [0.7, 0.55, 0.3, 0.8]] : [[0, 0.7, 0, 1.2]]).map(([x, y, z, r], i) => {
    // Low-poly is enough for a shrub; the lumps keep it from reading as a ball.
    const g = new THREE.IcosahedronGeometry(r!, 0);
    lumpy(g, 0.24, i + 4);
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

const BUILDERS: Record<PlantKind, (detail: number) => Part> = { conifer, broadleaf, bush, rock, conifer2, broadleaf2, giantConifer, giantBroadleaf };

export function createPlantGeometry(kind: PlantKind, detail: number): THREE.BufferGeometry {
  const g = BUILDERS[kind](detail);
  g.computeBoundingSphere();
  return g;
}
