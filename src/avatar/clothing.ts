import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ClothingItem, ParamValue, PatternId } from '../wardrobe/catalog';
import { shade } from './appearance';
import { addMesh, BODY, HEAD_UNIT as R, type Rig } from './body';
import { lathe, limb, plate, ring, ruffle, seeded, starShape, strand, type Detail, type P3 } from './geometry';
import { onSkull } from './head';
import { material, type MaterialKind } from './materials';

/**
 * Clothing patterns: one builder per `pattern` in the catalog. A builder hangs
 * meshes on the rig's joints (torso, shoulders, elbows, hips, knees, head), so
 * clothes move with the body. `params` come from the catalog item.
 *
 * Layers sit a little outside each other (LAYER), so a coat covers a top.
 */
interface Ctx {
  rig: Rig;
  color: string;
  params: Readonly<Record<string, ParamValue>>;
  segments: number;
  detail: Detail;
}

const LAYER = { top: 0.008, knit: 0.013, vest: 0.019, outer: 0.026, pin: 0.034 } as const;

const str = (c: Ctx, key: string, fallback: string) => (typeof c.params[key] === 'string' ? (c.params[key] as string) : fallback);
const num = (c: Ctx, key: string, fallback: number) => (typeof c.params[key] === 'number' ? (c.params[key] as number) : fallback);
const flag = (c: Ctx, key: string) => c.params[key] === true;

/** Torso radius at height y (interpolated from BODY.torso). */
export function torsoRadius(y: number): number {
  const t = BODY.torso;
  for (let i = 1; i < t.length; i++) {
    const [r1, y1] = t[i]!;
    const [r0, y0] = t[i - 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return t[t.length - 1]![0];
}

/** Front surface depth at height y for a layer `extra` outside the body. */
const frontZ = (y: number, extra: number) => (torsoRadius(y) + extra) * BODY.depth;

/** A garment shell following the torso from `fromY` to `toY`, `offset` outside it, flaring below `flareFrom`. */
function torsoProfile(fromY: number, toY: number, offset: number, flare = 0, flareFrom = 0.88): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const y = fromY + ((toY - fromY) * i) / steps;
    const r = torsoRadius(Math.max(0.86, y)) + offset + (y < flareFrom ? (flareFrom - y) * flare : 0);
    pts.push([r, y]);
  }
  return pts;
}

function shell(c: Ctx, profile: ReadonlyArray<readonly [number, number]>, gap = 0): THREE.BufferGeometry {
  return lathe(profile, c.segments + 24, BODY.depth, gap, Math.PI * 2 - gap * 2);
}

type SleeveKind = 'long' | 'short' | 'rolled';

function sleeves(c: Ctx, kind: MaterialKind, color: string, length: SleeveKind, extra: number, cuff?: string): void {
  const m = material(kind, color);
  const { upperArm: ua, forearm: fa } = BODY;
  c.rig.shoulder.forEach((s, i) => {
    const capGeo = new THREE.SphereGeometry(ua.r0 + extra + 0.003, c.segments, Math.round(c.segments * 0.6));
    addMesh(s, capGeo, m);
    const upperLen = length === 'short' ? 0.1 : ua.len;
    addMesh(s, limb(upperLen, ua.r0 + extra + 0.004, length === 'short' ? ua.r0 + extra + 0.006 : ua.r1 + extra, c.segments), m);
    const e = c.rig.elbow[i]!;
    if (length === 'long') {
      addMesh(e, limb(fa.len - 0.03, fa.r0 + extra, fa.r1 + extra + 0.004, c.segments), m);
      if (cuff) {
        const band = addMesh(e, ring(fa.r1 + extra + 0.005, 0.006, 1, c.segments), material('metal', cuff));
        band.position.y = -fa.len + 0.035;
      }
    }
    if (length === 'rolled') {
      const roll = addMesh(e, ring(fa.r0 + extra + 0.004, 0.011, 1, c.segments), m);
      roll.position.y = -0.02;
    }
  });
}

/** Hips and seat in the trousers' colour, just outside the body and inside every top layer. */
function pelvis(c: Ctx, color: string): void {
  const profile: Array<[number, number]> = [[0.0001, 0.76], [0.1, 0.77], [0.142, 0.82]];
  for (const y of [0.86, 0.9, 0.95]) profile.push([torsoRadius(y) + 0.004, y]);
  addMesh(c.rig.hips, lathe(profile, c.segments + 16, BODY.depth), material('fabric', color));
}

function pantLegs(c: Ctx, color: string, short: boolean): void {
  const m = material('fabric', color);
  const { thigh, shin } = BODY;
  c.rig.hip.forEach((h, i) => {
    addMesh(h, limb(short ? 0.17 : thigh.len, thigh.r0 + 0.006, short ? thigh.r0 - 0.002 : thigh.r1 + 0.006, c.segments), m);
    if (short) {
      const hem = addMesh(h, ring(thigh.r0 + 0.004, 0.007, 1, c.segments), material('fabric', shade(color, -0.2)));
      hem.position.y = -0.17;
      return;
    }
    addMesh(c.rig.knee[i]!, limb(shin.len - 0.04, shin.r0 + 0.006, shin.r1 + 0.008, c.segments), m);
  });
}

/** Small glowing stars scattered over a garment (night-sky dress, star-chart coat). */
function scatterStars(parent: THREE.Object3D, count: number, seed: number, place: (rnd: () => number) => { pos: THREE.Vector3; angle: number }): void {
  const rnd = seeded(seed);
  const base = plate(starShape(0.011, 0.0045), 0.002, 0.001);
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const { pos, angle } = place(rnd);
    const g = base.clone();
    const s = 0.6 + rnd() * 0.8;
    m.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, rnd() * Math.PI)), new THREE.Vector3(s, s, s));
    g.applyMatrix4(m);
    parts.push(g);
  }
  base.dispose();
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (merged) addMesh(parent, merged, material('metal', '#f5d83a', { glow: '#f5d83a', glowStrength: 0.9 }), false);
}

function bow(c: Ctx, color: string, y: number, extra: number): void {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.02, 0.022, 0.034, 0.014, 0.032, -0.004);
  s.bezierCurveTo(0.028, -0.022, 0.014, -0.014, 0, 0);
  s.bezierCurveTo(-0.014, -0.014, -0.028, -0.022, -0.032, -0.004);
  s.bezierCurveTo(-0.034, 0.014, -0.02, 0.022, 0, 0);
  const b = addMesh(c.rig.torso, plate(s, 0.004), material('silk', color));
  b.position.set(0, y, frontZ(y, extra));
}

const PATTERNS: Record<PatternId, (c: Ctx) => void> = {
  tunic(c) {
    const m = material('fabric', c.color, { doubleSided: true });
    addMesh(c.rig.torso, shell(c, torsoProfile(0.72, 1.335, LAYER.top, 0.35)), m);
    sleeves(c, 'fabric', c.color, 'long', LAYER.top);
    const belt = str(c, 'belt', '#6b4a2e');
    addMesh(c.rig.torso, ring(torsoRadius(0.97) + LAYER.top + 0.004, 0.009, BODY.depth, c.segments + 24), material('leather', belt)).position.y = 0.97;
    const buckle = addMesh(c.rig.torso, new THREE.TorusGeometry(0.013, 0.004, 8, 24), material('metal', '#c9a75c'));
    buckle.position.set(0, 0.97, frontZ(0.97, LAYER.top + 0.012));
    addMesh(c.rig.torso, ring(torsoRadius(1.33) + LAYER.top, 0.006, BODY.depth, c.segments + 24), m).position.y = 1.333;
  },

  blouse(c) {
    const m = material('silk', c.color, { doubleSided: true });
    addMesh(c.rig.torso, shell(c, torsoProfile(0.9, 1.335, LAYER.top)), m);
    for (const s of c.rig.shoulder) {
      const puff = new THREE.SphereGeometry(0.058, c.segments, Math.round(c.segments * 0.7));
      puff.scale(1, 0.9, 1);
      puff.translate(0, -0.035, 0);
      addMesh(s, puff, m);
      const band = addMesh(s, ring(BODY.upperArm.r0 + 0.006, 0.006, 1, c.segments), material('silk', str(c, 'ribbon', '#a89bd9')));
      band.position.y = -0.085;
    }
    const collar = addMesh(c.rig.torso, ring(torsoRadius(1.335) + 0.012, 0.014, 0.85, c.segments + 24), m);
    collar.position.y = 1.338;
    bow(c, str(c, 'ribbon', '#a89bd9'), 1.29, LAYER.top + 0.008);
  },

  shirtVest(c) {
    const shirt = str(c, 'shirt', '#8fb3c9');
    addMesh(c.rig.torso, shell(c, torsoProfile(0.86, 1.335, LAYER.top)), material('fabric', shirt, { doubleSided: true }));
    sleeves(c, 'fabric', shirt, 'rolled', LAYER.top);
    const gap = 0.5;
    const profile = torsoProfile(0.84, 1.3, LAYER.vest);
    addMesh(c.rig.torso, shell(c, profile, gap), material('fabric', c.color, { doubleSided: true }));
    const trim = material('fabric', shade(c.color, -0.3));
    const buttons = material('metal', str(c, 'buttons', '#f0dcb8'));
    for (const a of [gap, -gap]) {
      const edge: P3[] = profile.map(([r, y]) => [Math.sin(a) * r, y, Math.cos(a) * r * BODY.depth]);
      addMesh(c.rig.torso, strand(edge, 0.005, 60, 6, { taper: false }), trim, false);
      for (const y of [0.92, 1.0, 1.08]) {
        const b = addMesh(c.rig.torso, new THREE.SphereGeometry(0.007, 12, 8), buttons, false);
        const r = torsoRadius(y) + LAYER.vest + 0.003;
        b.position.set(Math.sin(a) * r, y, Math.cos(a) * r * BODY.depth);
      }
    }
    addMesh(c.rig.torso, ring(torsoRadius(1.335) + LAYER.top, 0.007, BODY.depth, c.segments + 24), material('fabric', shirt)).position.y = 1.333;
  },

  sweater(c) {
    const m = material('knit', c.color, { doubleSided: true });
    addMesh(c.rig.torso, shell(c, torsoProfile(0.82, 1.335, LAYER.knit)), m);
    sleeves(c, 'knit', c.color, 'long', LAYER.knit);
    const rib = material('knit', shade(c.color, -0.15));
    addMesh(c.rig.torso, ring(torsoRadius(0.84) + LAYER.knit, 0.012, BODY.depth, c.segments + 24), rib).position.y = 0.825;
    const neck = new THREE.CylinderGeometry(0.05, 0.058, 0.09, c.segments, 1, true);
    neck.translate(0, 1.375, 0);
    addMesh(c.rig.torso, neck, m);
    addMesh(c.rig.torso, ring(0.05, 0.01, 1, c.segments), rib).position.y = 1.42;
    for (const e of c.rig.elbow) addMesh(e, ring(BODY.forearm.r1 + LAYER.knit + 0.004, 0.009, 1, c.segments), rib).position.y = -BODY.forearm.len + 0.035;
  },

  dress(c) {
    const m = material('silk', c.color, { doubleSided: true });
    addMesh(c.rig.torso, shell(c, torsoProfile(0.97, 1.335, LAYER.top)), m);
    const skirt = lathe([[0.3, 0.5], [0.27, 0.58], [0.21, 0.74], [0.16, 0.88], [torsoRadius(0.99) + 0.012, 0.995]], c.segments * 3, 0.85);
    ruffle(skirt, 0.99, 0.5, 0.07, 10);
    const sk = addMesh(c.rig.hips, skirt, m);
    c.rig.sway.push(sk);
    for (const s of c.rig.shoulder) {
      const puff = new THREE.SphereGeometry(0.055, c.segments, Math.round(c.segments * 0.7));
      puff.scale(1, 0.85, 1);
      puff.translate(0, -0.03, 0);
      addMesh(s, puff, m);
    }
    addMesh(c.rig.torso, ring(torsoRadius(0.99) + 0.012, 0.009, 0.85, c.segments + 24), material('silk', shade(c.color, 0.25))).position.y = 0.99;
    if (flag(c, 'stars')) {
      scatterStars(sk, c.detail === 'high' ? 60 : 30, 7, (rnd) => {
        const y = 0.52 + rnd() * 0.42;
        const t = (0.995 - y) / 0.495;
        const r = 0.17 + t * 0.14;
        const a = rnd() * Math.PI * 2;
        return { pos: new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * 0.85), angle: a };
      });
    }
  },

  coat(c) {
    const gap = 0.34;
    const profile: Array<[number, number]> = [];
    for (let i = 0; i <= 22; i++) {
      const y = 0.5 + (0.84 * i) / 22;
      const r = y >= 0.86 ? torsoRadius(y) + LAYER.outer : torsoRadius(0.86) + LAYER.outer + (0.86 - y) * 0.3;
      profile.push([r, y]);
    }
    const coat = addMesh(c.rig.torso, shell(c, profile, gap), material('fabric', c.color, { doubleSided: true }));
    c.rig.sway.push(coat);
    const trim = material('metal', str(c, 'trim', '#d9b45c'));
    for (const a of [gap, -gap]) {
      const edge: P3[] = profile.map(([r, y]) => [Math.sin(a) * r, y, Math.cos(a) * r * BODY.depth]);
      addMesh(c.rig.torso, strand(edge, 0.005, 90, 8, { taper: false }), trim, false);
    }
    sleeves(c, 'fabric', c.color, 'long', LAYER.outer - 0.008, str(c, 'trim', '#d9b45c'));
    addMesh(c.rig.torso, ring(torsoRadius(0.97) + LAYER.outer + 0.004, 0.008, BODY.depth, c.segments + 24), material('fabric', str(c, 'belt', '#7a5ea8'))).position.y = 0.97;
    const buckle = addMesh(c.rig.torso, plate(starShape(0.016, 0.007), 0.003), material('metal', str(c, 'trim', '#d9b45c')));
    buckle.position.set(0, 0.97, frontZ(0.97, LAYER.outer + 0.012));
    if (flag(c, 'stars')) {
      scatterStars(coat, c.detail === 'high' ? 70 : 34, 11, (rnd) => {
        const y = 0.52 + rnd() * 0.76;
        const a = gap + 0.15 + rnd() * (Math.PI * 2 - gap * 2 - 0.3);
        const r = (y >= 0.86 ? torsoRadius(y) : torsoRadius(0.86) + (0.86 - y) * 0.3) + LAYER.outer + 0.002;
        return { pos: new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * BODY.depth), angle: a };
      });
    }
  },

  cloak(c) {
    const m = material('fabric', c.color, { doubleSided: true });
    const geo = new THREE.CylinderGeometry(0.2, 0.3, 0.84, c.segments * 2, 16, true, Math.PI * 0.42, Math.PI * 1.16);
    geo.translate(0, 0.9, 0);
    ruffle(geo, 1.32, 0.48, 0.05, 9);
    geo.scale(1, 1, 0.82);
    const cloak = addMesh(c.rig.torso, geo, m);
    c.rig.sway.push(cloak);
    const hood = new THREE.TorusGeometry(0.085, 0.03, 16, c.segments * 2, Math.PI * 1.2);
    hood.rotateX(Math.PI / 2);
    hood.rotateY(Math.PI * 0.4);
    addMesh(c.rig.torso, hood, material('fabric', str(c, 'hood', shade(c.color, -0.15)))).position.y = 1.335;
    for (const s of [-1, 1]) {
      const clasp = addMesh(c.rig.torso, new THREE.SphereGeometry(0.011, 16, 12), material('metal', str(c, 'clasp', '#d9b45c')));
      clasp.position.set(s * 0.085, 1.31, 0.06);
    }
  },

  pants(c) {
    pelvis(c, c.color);
    pantLegs(c, c.color, false);
  },

  shorts(c) {
    pelvis(c, c.color);
    pantLegs(c, c.color, true);
  },

  skirt(c) {
    const m = material('fabric', c.color, { doubleSided: true });
    const g = lathe([[0.27, 0.6], [0.25, 0.66], [0.2, 0.78], [0.165, 0.89], [torsoRadius(0.97) + 0.012, 0.975]], c.segments * 3, 0.85);
    ruffle(g, 0.97, 0.6, 0.07, 10);
    c.rig.sway.push(addMesh(c.rig.hips, g, m));
    addMesh(c.rig.hips, ring(torsoRadius(0.97) + 0.012, 0.01, 0.85, c.segments + 24), material('fabric', str(c, 'band', shade(c.color, -0.2)))).position.y = 0.968;
    pelvis(c, shade(c.color, -0.1));
  },

  boots(c) {
    const leather = material('leather', c.color);
    const sole = material('leather', '#2f2638');
    const height = num(c, 'height', 0.09);
    for (const k of c.rig.knee) {
      const shoe = new THREE.SphereGeometry(1, c.segments, Math.round(c.segments * 0.6));
      shoe.scale(0.044, 0.038, 0.094);
      shoe.translate(0, BODY.footY, 0.028);
      addMesh(k, shoe, leather);
      const s = new THREE.SphereGeometry(1, c.segments, Math.round(c.segments * 0.4));
      s.scale(0.046, 0.012, 0.098);
      s.translate(0, BODY.footY - 0.03, 0.028);
      addMesh(k, s, sole);
      if (height > 0.05) {
        const cuff = addMesh(k, limb(height, BODY.shin.r1 + 0.012, BODY.shin.r1 + 0.009, c.segments), leather);
        cuff.position.y = BODY.footY + 0.02 + height;
        const band = addMesh(k, ring(BODY.shin.r1 + 0.013, 0.005, 1, c.segments), material('leather', str(c, 'band', shade(c.color, -0.3))));
        band.position.y = BODY.footY + 0.02 + height;
      }
    }
  },

  sandals(c) {
    const strap = material('leather', c.color);
    for (const k of c.rig.knee) {
      const s = new THREE.SphereGeometry(1, c.segments, Math.round(c.segments * 0.4));
      s.scale(0.042, 0.009, 0.092);
      s.translate(0, BODY.footY - 0.026, 0.026);
      addMesh(k, s, strap);
      for (const [z, r] of [[0.06, 0.03], [0.0, 0.034]] as const) {
        const band = new THREE.TorusGeometry(r, 0.0045, 8, 32);
        band.rotateX(Math.PI / 2);
        band.scale(1, 1, 0.75);
        addMesh(k, band, strap, false).position.set(0, BODY.footY - 0.004, z);
      }
      const star = addMesh(k, plate(starShape(0.012, 0.005), 0.002), material('metal', '#f5d83a', { glow: '#f5d83a', glowStrength: 0.4 }), false);
      star.position.set(0, BODY.footY + 0.01, 0.075);
      star.rotation.x = -0.6;
    }
  },

  circlet(c) {
    const gold = material('metal', c.color);
    const band = new THREE.TorusGeometry(R * 0.94, 0.0065, 12, 160);
    band.rotateX(Math.PI / 2);
    band.rotateX(-0.36);
    addMesh(c.rig.hair, band, gold, false).position.y = 0.075;
    const moon = new THREE.Shape();
    moon.absarc(0, 0, 0.032, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0.013, 0.008, 0.027, 0, Math.PI * 2, true);
    moon.holes.push(hole);
    const m = addMesh(c.rig.hair, plate(moon, 0.005), material('metal', str(c, 'moon', '#eef0f7'), { glow: '#c9c2ff', glowStrength: 0.35 }), false);
    m.position.set(0, 0.15, 0.17);
    m.rotation.x = -0.36;
  },

  flowerCrown(c) {
    const petal = new THREE.Shape();
    petal.absellipse(0, 0.012, 0.008, 0.013, 0, Math.PI * 2, false, 0);
    const petals: THREE.BufferGeometry[] = [];
    const centers: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const pos = new THREE.Vector3(...onSkull(th, 0.62, 1.13));
      const out = pos.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      for (let p = 0; p < 5; p++) {
        const g = plate(petal, 0.002, 0.001);
        g.rotateZ((p / 5) * Math.PI * 2);
        m.compose(pos, q, new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(m);
        petals.push(g);
      }
      const center = new THREE.SphereGeometry(0.007, 12, 8);
      center.translate(pos.x + out.x * 0.003, pos.y + out.y * 0.003, pos.z + out.z * 0.003);
      centers.push(center);
      const leaf = new THREE.SphereGeometry(1, 12, 8);
      leaf.scale(0.006, 0.004, 0.016);
      const lp = new THREE.Vector3(...onSkull(th + Math.PI / n, 0.64, 1.11));
      leaf.lookAt(lp.clone().add(new THREE.Vector3(-lp.z, 0, lp.x)));
      leaf.translate(lp.x, lp.y, lp.z);
      leaves.push(leaf);
    }
    for (const [list, mat] of [
      [petals, material('silk', c.color)],
      [centers, material('silk', str(c, 'center', '#f5d83a'))],
      [leaves, material('leaf', '#5e8f4f')],
    ] as const) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (merged) addMesh(c.rig.hair, merged, mat, false);
    }
  },

  leafClip(c) {
    const leaf = new THREE.Shape();
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(0.03, 0.03, 0, 0.075);
    leaf.quadraticCurveTo(-0.03, 0.03, 0, 0);
    const m = material('leaf', c.color);
    for (const [rz, dx] of [[0.6, 0], [-0.3, 0.012], [1.4, -0.01]] as const) {
      const l = addMesh(c.rig.hair, plate(leaf, 0.003, 0.0015), m, false);
      l.position.set(0.17 + dx, 0.08, 0.06);
      l.rotation.set(0, 1.2, rz);
    }
    const berry = addMesh(c.rig.hair, new THREE.SphereGeometry(0.013, 20, 14), material('gem', str(c, 'berry', '#d9b45c'), { glow: '#7a5a10', glowStrength: 0.5 }), false);
    berry.position.set(0.185, 0.085, 0.07);
  },

  starPin(c) {
    const y = 1.2;
    const pin = addMesh(c.rig.torso, plate(starShape(0.02, 0.009), 0.004), material('metal', c.color, { glow: '#7a5a10', glowStrength: 0.4 }), false);
    pin.position.set(0.05, y, frontZ(y, LAYER.pin) + 0.002);
    pin.rotation.y = 0.35;
  },

  scarf(c) {
    const m = material('knit', c.color);
    addMesh(c.rig.torso, ring(0.062, 0.024, 0.85, c.segments * 2), m).position.y = 1.348;
    const tails: Array<[P3[], string]> = [
      [[[0.02, 1.345, 0.055], [0.04, 1.3, 0.085], [0.048, 1.22, 0.1], [0.055, 1.15, 0.1]], c.color],
      [[[0.0, 1.345, 0.058], [0.014, 1.29, 0.09], [0.022, 1.24, 0.1]], str(c, 'tail', shade(c.color, -0.12))],
    ];
    for (const [pts, color] of tails) addMesh(c.rig.torso, strand(pts, 0.018, 40, 12, { taper: false }), material('knit', color));
  },

  brooch(c) {
    const y = 1.22;
    const pos = new THREE.Vector3(-0.055, y, frontZ(y, LAYER.pin));
    const frame = addMesh(c.rig.torso, new THREE.TorusGeometry(0.014, 0.004, 10, 40), material('metal', c.color), false);
    frame.position.copy(pos);
    const gem = new THREE.SphereGeometry(0.012, 24, 16);
    gem.scale(1, 1, 0.55);
    addMesh(c.rig.torso, gem, material('gem', str(c, 'gem', '#9fd9e0'), { glow: str(c, 'gem', '#9fd9e0'), glowStrength: 0.35 }), false).position.copy(pos);
  },
};

export function dressAvatar(rig: Rig, worn: ReadonlyArray<{ item: ClothingItem; color: string }>, detail: Detail): void {
  const segments = detail === 'high' ? 40 : 24;
  for (const { item, color } of worn) {
    PATTERNS[item.pattern]({ rig, color, params: item.params, segments, detail });
  }
}
