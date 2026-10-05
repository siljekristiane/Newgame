import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GIANTS, WORLD_SEED } from '../../config/world';
import { giantPalette } from '../../design/tokens';
import { mulberry32 } from '../../world/noise';
import { GIANT_KINDS, type GiantKind } from './layout';

/**
 * The giant trees' meshes (procedural, in meters, standing on y = 0 with the
 * roots reaching below it). A recursive branching structure: tapered, slightly
 * curved limbs that split into smaller ones, ending in leaf clusters, needles,
 * snow or bare twigs depending on the kind. Every tree is scaled so its top is
 * at GIANTS.height (ten lamp posts).
 */

type Paint = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

const UP = new THREE.Vector3(0, 1, 0);
const hex = (h: string) => new THREE.Color(h);

/** Vertex colours from a paint function that sees position and normal. */
function painted(g: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    paint(p.fromBufferAttribute(pos, v), n.fromBufferAttribute(nor, v), c);
    colors.set([c.r, c.g, c.b], v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** A stable 0..1 per position (shared corners agree, so colour noise is smooth). */
function jitter(p: THREE.Vector3): number {
  const h = Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Bark: darker low down and in the grooves (noise), lighter up the limbs. */
const barkPaint =
  (base: string, top = 40): Paint =>
  (p, _n, out) =>
    out.set(base).multiplyScalar((0.7 + Math.min(0.35, p.y / top) * 0.8) * (0.82 + jitter(p) * 0.3));

/** A tapered tube from a to b. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial: number): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Turns `dir` away from itself by `angle` around a random perpendicular axis. */
function deviate(dir: THREE.Vector3, angle: number, random: () => number): THREE.Vector3 {
  const axis = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.95 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
  axis.applyAxisAngle(dir, random() * Math.PI * 2);
  return dir.clone().applyAxisAngle(axis, angle).normalize();
}

interface Branching {
  /** Levels of splitting below this limb. */
  depth: number;
  /** Children per split (min, max). */
  children: [number, number];
  /** Angle of a child from its parent, radians (min, max). */
  spread: [number, number];
  /** Child length and radius relative to the parent. */
  lengthK: number;
  radiusK: number;
  /** Pull toward the sky (+) or the ground (−) per level. */
  rise: number;
  /** How much a limb bends along its length. */
  bend: number;
  radial: number;
}

interface Tip {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  radius: number;
}

/** Grows a limb and its children; bark pieces go to `parts`, ends to `tips`. */
function grow(parts: THREE.BufferGeometry[], tips: Tip[], start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, level: number, spec: Branching, random: () => number): void {
  // Two pieces with a kink in the middle: limbs are never straight.
  const mid = start.clone().addScaledVector(deviate(dir, spec.bend * (0.5 + random()), random), length * 0.5);
  const dir2 = deviate(dir, spec.bend * random(), random);
  dir2.y += spec.rise * 0.5;
  dir2.normalize();
  const end = mid.clone().addScaledVector(dir2, length * 0.5);
  const rMid = radius * (1 - (1 - spec.radiusK) * 0.5);
  const rEnd = radius * spec.radiusK;
  parts.push(tube(start, mid, radius, rMid, spec.radial), tube(mid, end, rMid, rEnd, spec.radial));
  if (level >= spec.depth) {
    tips.push({ pos: end, dir: dir2, radius: rEnd });
    return;
  }
  const [c0, c1] = spec.children;
  const n = c0 + Math.floor(random() * (c1 - c0 + 1));
  for (let c = 0; c < n; c++) {
    const [s0, s1] = spec.spread;
    const child = deviate(dir2, s0 + random() * (s1 - s0), random);
    child.y += spec.rise;
    child.normalize();
    // Children leave from the last stretch of the parent, not all from one point.
    const from = mid.clone().lerp(end, 0.55 + random() * 0.45);
    grow(parts, tips, from, child, length * spec.lengthK * (0.8 + random() * 0.35), rEnd * (0.85 + random() * 0.2), level + 1, spec, random);
  }
}

/** Root flare: buttress roots spreading from the foot into the ground. */
function roots(parts: THREE.BufferGeometry[], radius: number, count: number, random: () => number): void {
  for (let r = 0; r < count; r++) {
    const a = (r / count) * Math.PI * 2 + random() * 0.4;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const top = out.clone().multiplyScalar(radius * 0.6).setY(radius * 0.9);
    const foot = out.clone().multiplyScalar(radius * (2 + random() * 0.8)).setY(-1.5);
    parts.push(tube(top, foot, radius * 0.45, radius * 0.18, 6));
  }
}

/** A lumpy leaf cluster. */
function cluster(at: THREE.Vector3, r: number, squash: number, detail: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.getAttribute('position');
  const p = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v);
    const d = p.clone().normalize();
    const k = 1 + 0.22 * (Math.sin(d.x * 4.1 + seed) * Math.sin(d.y * 3.7 + seed * 2.3) + 0.6 * Math.sin(d.z * 5.3 - seed));
    pos.setXYZ(v, p.x * k, p.y * k * squash, p.z * k);
  }
  g.computeVertexNormals();
  // Foliage scatters light: tilt normals up so the shaded side takes sky light.
  const nor = g.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let v = 0; v < nor.count; v++) {
    n.fromBufferAttribute(nor, v);
    n.y += 0.7;
    n.normalize();
    nor.setXYZ(v, n.x, n.y, n.z);
  }
  g.translate(at.x, at.y, at.z);
  return g;
}

/** Leaves: dark underneath, lighter where the sun reaches. */
const leafPaint =
  (base: string, light: string, crownMid: number): Paint =>
  (p, n, out) => {
    const sun = Math.min(1, Math.max(0, (p.y - crownMid) / 12 + n.y * 0.3));
    out.set(base).lerp(hex(light), sun * (0.6 + jitter(p) * 0.4));
    out.multiplyScalar(0.62 + sun * 0.38);
  };

function ancientOak(random: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const tips: Tip[] = [];
  const trunk: THREE.BufferGeometry[] = [tube(new THREE.Vector3(0, -3, 0), new THREE.Vector3(0.6, 6, 0.3), 3, 2.5, 14), tube(new THREE.Vector3(0.6, 6, 0.3), new THREE.Vector3(0.2, 11, -0.4), 2.5, 2, 14)];
  roots(trunk, 3, 9, random);
  const spec: Branching = { depth: 2, children: [2, 3], spread: [0.45, 0.9], lengthK: 0.62, radiusK: 0.55, rise: 0.12, bend: 0.25, radial: 8 };
  const limbs = 6;
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + random() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0.55 + random() * 0.35, Math.sin(a)).normalize();
    grow(parts, tips, new THREE.Vector3(0.2, 9 + random() * 2.5, -0.4), dir, 13 + random() * 3, 1.25, 0, spec, random);
  }
  tips.forEach((t, i) => leaves.push(cluster(t.pos.clone().addScaledVector(UP, 1.2), 4 + random() * 1.5, 0.7, 1, i)));
  return [painted(mergeGeometries([...trunk, ...parts])!, barkPaint(giantPalette.barkOld)), painted(mergeGeometries(leaves)!, leafPaint(giantPalette.oakLeaf, giantPalette.oakLeafLight, 22))];
}

function meadowLinden(random: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const tips: Tip[] = [];
  const trunk: THREE.BufferGeometry[] = [tube(new THREE.Vector3(0, -3, 0), new THREE.Vector3(-0.3, 10, 0.2), 2.4, 1.7, 12)];
  roots(trunk, 2.4, 7, random);
  const spec: Branching = { depth: 2, children: [2, 3], spread: [0.3, 0.65], lengthK: 0.66, radiusK: 0.55, rise: 0.25, bend: 0.18, radial: 8 };
  const limbs = 8;
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + random() * 0.4;
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7).normalize();
    grow(parts, tips, new THREE.Vector3(-0.3, 8 + random() * 3, 0.2), dir, 11 + random() * 3, 0.95, 0, spec, random);
  }
  // A dense, rounded crown: big clusters at the tips and a few filling the middle.
  tips.forEach((t, i) => leaves.push(cluster(t.pos, 4.2 + random() * 1.2, 0.85, 1, i)));
  for (let k = 0; k < 6; k++) leaves.push(cluster(new THREE.Vector3((random() - 0.5) * 14, 20 + random() * 8, (random() - 0.5) * 14), 6, 0.8, 1, 40 + k));
  return [painted(mergeGeometries([...trunk, ...parts])!, barkPaint(giantPalette.bark)), painted(mergeGeometries(leaves)!, leafPaint(giantPalette.lindenLeaf, giantPalette.lindenLeafLight, 20))];
}

function deadTree(random: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const tips: Tip[] = [];
  // A twisted, split trunk; huge bare limbs reaching out and up, many dry twigs.
  const trunk: THREE.BufferGeometry[] = [
    tube(new THREE.Vector3(0, -3, 0), new THREE.Vector3(1, 5, -0.5), 2.6, 2.1, 10),
    tube(new THREE.Vector3(1, 5, -0.5), new THREE.Vector3(0.2, 10, 0.6), 2.1, 1.6, 10),
  ];
  roots(trunk, 2.6, 8, random);
  const spec: Branching = { depth: 3, children: [2, 3], spread: [0.4, 0.95], lengthK: 0.6, radiusK: 0.5, rise: 0.15, bend: 0.4, radial: 6 };
  const limbs = 5;
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + random() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0.7 + random() * 0.5, Math.sin(a)).normalize();
    grow(parts, tips, new THREE.Vector3(0.2, 8 + random() * 2, 0.6), dir, 14 + random() * 4, 1.15, 0, spec, random);
  }
  // Dry twigs at every tip.
  for (const t of tips) for (let k = 0; k < 2; k++) parts.push(tube(t.pos, t.pos.clone().addScaledVector(deviate(t.dir, 0.6, random), 2.5 + random() * 2), t.radius, 0.03, 4));
  return [painted(mergeGeometries([...trunk, ...parts])!, (p, _n, out) => out.set(giantPalette.deadwood).multiplyScalar((0.72 + Math.min(0.3, p.y / 45)) * (0.8 + jitter(p) * 0.35)))];
}

function windPine(random: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const crown: THREE.BufferGeometry[] = [];
  const tips: Tip[] = [];
  // A tall trunk bent by the wind toward +X, bare to high up.
  const knots = [new THREE.Vector3(0, -3, 0), new THREE.Vector3(0.4, 8, 0), new THREE.Vector3(1.6, 16, 0.3), new THREE.Vector3(3.6, 23, 0.2), new THREE.Vector3(6, 28, 0)];
  const radii = [2.3, 1.9, 1.5, 1.1, 0.7];
  const trunk: THREE.BufferGeometry[] = [];
  for (let k = 0; k < knots.length - 1; k++) trunk.push(tube(knots[k]!, knots[k + 1]!, radii[k]!, radii[k + 1]!, 12));
  roots(trunk, 2.3, 7, random);
  const spec: Branching = { depth: 1, children: [2, 3], spread: [0.4, 0.8], lengthK: 0.6, radiusK: 0.5, rise: 0.05, bend: 0.2, radial: 6 };
  for (let l = 0; l < 7; l++) {
    const a = (l / 7) * Math.PI * 2;
    // Longer limbs on the lee side (+X): the crown streams with the wind.
    const lee = 0.6 + 0.4 * Math.cos(a);
    const dir = new THREE.Vector3(Math.cos(a), 0.25 + random() * 0.2, Math.sin(a)).normalize();
    grow(parts, tips, knots[3]!.clone().lerp(knots[4]!, random()), dir, (7 + random() * 3) * lee + 3, 0.6, 0, spec, random);
  }
  // Flat, layered needle pads: the umbrella crown of an old pine.
  tips.forEach((t, i) => crown.push(cluster(t.pos.clone().addScaledVector(UP, 0.8), 3.4 + random(), 0.38, 1, i)));
  crown.push(cluster(knots[4]!.clone().addScaledVector(UP, 1.5), 5.5, 0.4, 1, 99));
  return [painted(mergeGeometries([...trunk, ...parts])!, barkPaint('#5a4433')), painted(mergeGeometries(crown)!, leafPaint(giantPalette.pineNeedle, '#4c6a3c', 26))];
}

function snowFir(random: () => number): THREE.BufferGeometry[] {
  const top = 40;
  const trunk: THREE.BufferGeometry[] = [tube(new THREE.Vector3(0, -3, 0), new THREE.Vector3(0, top - 2, 0), 2.6, 0.35, 12)];
  roots(trunk, 2.6, 8, random);
  const tiers: THREE.BufferGeometry[] = [];
  const count = 20;
  const segments = 28;
  for (let t = 0; t < count; t++) {
    const f = t / count;
    const radius = 11 * (1 - f) ** 1.05 + 1.2;
    const y0 = 5 + f * (top - 7);
    const h = (top - y0) * 0.3 + 2;
    const g = new THREE.ConeGeometry(radius, h, segments, 1, true);
    g.rotateY(random() * Math.PI);
    g.translate(0, y0 + h / 2, 0);
    // Star-shaped, drooping rim: branch tips bowed under the snow.
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      if (pos.getY(v) > y0 + 0.01) continue;
      const tip = (v % (segments + 1)) % 2 === 0;
      const k = tip ? 1.05 + random() * 0.2 : 0.62 + random() * 0.08;
      pos.setX(v, pos.getX(v) * k);
      pos.setZ(v, pos.getZ(v) * k);
      pos.setY(v, pos.getY(v) - (tip ? 1.6 + random() * 1.2 : 0.4));
    }
    g.computeVertexNormals();
    tiers.push(g);
  }
  const needles = hex(giantPalette.firNeedle);
  const snow = hex(giantPalette.snow);
  return [
    painted(mergeGeometries(trunk)!, barkPaint(giantPalette.barkOld, top)),
    painted(mergeGeometries(tiers)!, (p, n, out) => {
      // Snow lies thick on every upward face; the dark needles show beneath and on the undersides.
      const cover = Math.min(1, Math.max(0, (n.y - 0.15) * 2.2 + (jitter(p) - 0.5) * 0.5));
      out.copy(needles).multiplyScalar(0.6 + (p.y / top) * 0.35).lerp(snow, cover);
    }),
  ];
}

const BUILDERS: Record<GiantKind, (random: () => number) => THREE.BufferGeometry[]> = { ancientOak, meadowLinden, deadTree, windPine, snowFir };

/**
 * The meshes of one giant tree (bark first, then foliage if any), scaled so
 * its top is GIANTS.height above the ground.
 */
export function createGiantGeometry(kind: GiantKind): THREE.BufferGeometry[] {
  const random = mulberry32(WORLD_SEED + 5_000 + GIANT_KINDS.indexOf(kind) * 97);
  const parts = BUILDERS[kind](random);
  let topY = 0;
  for (const g of parts) {
    g.computeBoundingBox();
    topY = Math.max(topY, g.boundingBox!.max.y);
  }
  const k = GIANTS.height / topY;
  for (const g of parts) {
    g.scale(k, k, k);
    g.computeBoundingSphere();
  }
  return parts;
}
