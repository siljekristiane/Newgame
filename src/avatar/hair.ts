import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shade, type Appearance, type HairStyleId } from './appearance';
import { addMesh, HEAD_UNIT as R, type Rig } from './body';
import { seeded, strand, v3, type Detail, type P3 } from './geometry';
import { onSkull as sp } from './head';
import { material } from './materials';

/**
 * Hairstyles: a cap over the skull plus many separate strands that taper to a
 * point. Strands are merged into one mesh per colour (one draw call each).
 *
 * To add a hairstyle: write a builder below, register it in STYLES and add it
 * to HAIR_STYLES in appearance.ts.
 */
interface HairCtx {
  /** Strand geometries in the main and the darker shade. */
  main: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  rnd: () => number;
  /** Scales strand counts and segments for the detail level. */
  count: (n: number) => number;
  seg: (n: number) => number;
  rig: Rig;
  hairColor: string;
}

function cap(ctx: HairCtx, k = 1.05): void {
  const g = new THREE.SphereGeometry(R * k, ctx.seg(96), ctx.seg(48), 0, Math.PI * 2, 0, Math.PI * 0.5);
  g.scale(1, 1.02, 0.96);
  g.rotateX(-0.32);
  ctx.main.push(g);
}

function bangs(ctx: HairCtx, n = 15, radius = 0.022, spread = 0.78, length = 1.17): void {
  const total = ctx.count(n);
  for (let b = 0; b < total; b++) {
    const th = -spread + (b / Math.max(1, total - 1)) * spread * 2 + (ctx.rnd() - 0.5) * 0.06;
    const end = length + (ctx.rnd() - 0.5) * 0.08 - Math.abs(th) * 0.05;
    const pts = [sp(th * 0.25 - 0.18, 0.05, 0.98), sp(th * 0.6 - 0.11, 0.5, 1.09), sp(th - 0.04, 0.92, 1.11), sp(th * 1.04, end, 1.075)];
    ctx.main.push(strand(pts, radius * (0.85 + ctx.rnd() * 0.3), ctx.seg(40), 8));
  }
}

/** Evenly round the back and sides, leaving the face open. */
function around(n: number, gap: number, i: number): number {
  return gap + (i / Math.max(1, n - 1)) * (Math.PI * 2 - gap * 2);
}

const STYLES: Record<HairStyleId, (ctx: HairCtx) => void> = {
  long(ctx) {
    cap(ctx);
    const n = ctx.count(64);
    for (let k = 0; k < n; k++) {
      const th = around(n, 0.5, k) + (ctx.rnd() - 0.5) * 0.05;
      const dx = Math.sin(th);
      const dz = Math.cos(th);
      const pts: P3[] = [sp(th, 0.15, 0.98), sp(th, 0.7, 1.07), sp(th, 1.25, 1.1), sp(th, 1.7, 1.13)];
      const len = 5 + Math.round(ctx.rnd() * 1.5);
      for (let j = 1; j <= len; j++) {
        const rr = 0.215 + 0.012 * j + 0.03 * Math.abs(dx);
        const w = Math.sin(j * 1.4 + th * 3) * 0.022;
        pts.push([dx * rr + w * dz, -0.1 - j * 0.075, dz * rr * (dz < 0 ? 0.95 : 0.9) - w * dx]);
      }
      (k % 5 === 0 ? ctx.dark : ctx.main).push(strand(pts, 0.024 + ctx.rnd() * 0.006, ctx.seg(56), 8));
    }
    bangs(ctx);
    for (const s of [-1, 1]) {
      const th = s * 0.72;
      const pts: P3[] = [sp(th, 0.3, 1.0), sp(th, 0.9, 1.1), sp(th * 1.08, 1.4, 1.13), [s * 0.19, -0.1, 0.1], [s * 0.18, -0.2, 0.11], [s * 0.2, -0.3, 0.1]];
      ctx.main.push(strand(pts, 0.026, ctx.seg(48), 8));
    }
  },

  bob(ctx) {
    cap(ctx);
    const n = ctx.count(62);
    for (let k = 0; k < n; k++) {
      const th = around(n, 0.62, k) + (ctx.rnd() - 0.5) * 0.05;
      const dx = Math.sin(th);
      const dz = Math.cos(th);
      const endY = -0.13 - ctx.rnd() * 0.035 + (dz > 0 ? 0.02 : 0);
      const pts: P3[] = [sp(th, 0.15, 0.98), sp(th, 0.75, 1.09), sp(th, 1.35, 1.15), sp(th, 1.82, 1.14), [dx * 0.19, endY, dz * 0.175]];
      (k % 6 === 0 ? ctx.dark : ctx.main).push(strand(pts, 0.031 + ctx.rnd() * 0.005, ctx.seg(44), 8));
    }
    bangs(ctx, 13, 0.027, 0.72, 1.14);
  },

  ponytail(ctx) {
    cap(ctx);
    const tie = new THREE.Vector3(0, 0.14, -0.15);
    const n = ctx.count(54);
    for (let k = 0; k < n; k++) {
      const th = around(n, 0.62, k);
      const a = v3(sp(th, 1.42, 1.02));
      const b = v3(sp(th, 0.95, 1.1));
      const c = b.clone().lerp(tie, 0.55).multiplyScalar(1.04);
      ctx.main.push(strand([tie.clone(), c, b, a], 0.022, ctx.seg(36), 8));
    }
    bangs(ctx);
    const band = new THREE.TorusGeometry(0.032, 0.012, 16, 48);
    band.rotateX(0.9);
    band.translate(tie.x, tie.y, tie.z);
    addMesh(ctx.rig.hair, band, material('silk', '#a89bd9'));
    // The tail swings on its own group (see animate.ts).
    const tail = new THREE.Group();
    tail.position.copy(tie);
    const tailMain: THREE.BufferGeometry[] = [];
    const tailDark: THREE.BufferGeometry[] = [];
    const m = ctx.count(40);
    for (let k = 0; k < m; k++) {
      const ox = (ctx.rnd() - 0.5) * 0.06;
      const oy = (ctx.rnd() - 0.5) * 0.04;
      const ph = ctx.rnd() * 6;
      const pts: P3[] = [
        [ox * 0.2, oy * 0.2, 0], [ox * 0.6, 0.07 + oy, -0.05], [ox, 0.05 + oy, -0.15], [ox * 1.4, -0.08, -0.2 + oy * 0.5],
        [ox * 1.6 + Math.sin(ph) * 0.02, -0.26, -0.17], [ox * 1.3 + Math.sin(ph + 1) * 0.03, -0.44 - ctx.rnd() * 0.06, -0.12],
      ];
      (k % 6 === 0 ? tailDark : tailMain).push(strand(pts, 0.024 + ctx.rnd() * 0.006, ctx.seg(48), 8));
    }
    ctx.rig.hair.add(tail);
    ctx.rig.tail = tail;
    attachMerged(tail, tailMain, tailDark, ctx);
  },

  crown(ctx) {
    cap(ctx);
    const n = ctx.count(50);
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2;
      ctx.main.push(strand([sp(th + 0.3, 0.12, 1.0), sp(th + 0.15, 0.7, 1.08), sp(th, 1.3, 1.07)], 0.024, ctx.seg(30), 8));
    }
    bangs(ctx, 9, 0.022, 0.55, 1.1);
    // Three real braided strands round the head.
    const steps = ctx.seg(260);
    for (let s = 0; s < 3; s++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const t = a * 14 + (s * Math.PI * 2) / 3;
        const base = new THREE.Vector3(Math.sin(a) * R * 1.07, 0.05 + 0.05 * Math.cos(a), Math.cos(a) * R * 1.07 * 0.96);
        base.y += 0.028 * Math.sin(t);
        base.addScaledVector(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 0.014 + 0.013 * Math.sin(2 * t));
        pts.push(base);
      }
      (s === 1 ? ctx.dark : ctx.main).push(strand(pts, 0.019, steps * 2, 10, { closed: true, taper: false }));
    }
  },

  curly(ctx) {
    cap(ctx, 1.07);
    const n = ctx.count(46);
    for (let k = 0; k < n; k++) {
      const th = around(n, 0.66, k) + (ctx.rnd() - 0.5) * 0.08;
      const dx = Math.sin(th);
      const dz = Math.cos(th);
      const pts: P3[] = [sp(th, 0.25, 1.0), sp(th, 0.95, 1.12), sp(th, 1.4, 1.18)];
      const turns = 3 + ctx.rnd() * 1.5;
      const steps = 18;
      const startY = pts[2]![1];
      const endY = -0.2 - ctx.rnd() * 0.06;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const a = t * turns * Math.PI * 2 + k;
        const rr = 0.2 + 0.02 * t;
        const curl = 0.026 * (1 - 0.3 * t);
        pts.push([dx * rr + Math.cos(a) * curl * dz, startY + (endY - startY) * t + Math.sin(a) * curl, dz * rr * 0.95 - Math.cos(a) * curl * dx]);
      }
      (k % 4 === 0 ? ctx.dark : ctx.main).push(strand(pts, 0.026, ctx.seg(70), 8));
    }
    // A fringe of small curls over the forehead.
    for (let b = 0; b < ctx.count(9); b++) {
      const th = -0.6 + (b / 8) * 1.2;
      const pts: P3[] = [sp(th * 0.3, 0.1, 0.99), sp(th, 0.6, 1.1)];
      for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2.4 + b;
        const base = sp(th, 0.6 + i * 0.06, 1.12);
        pts.push([base[0] + Math.cos(a) * 0.018, base[1] + Math.sin(a) * 0.018, base[2] + 0.01]);
      }
      ctx.main.push(strand(pts, 0.022, ctx.seg(40), 8));
    }
  },
};

function attachMerged(parent: THREE.Object3D, main: THREE.BufferGeometry[], dark: THREE.BufferGeometry[], ctx: HairCtx): void {
  for (const [list, color] of [[main, ctx.hairColor], [dark, shade(ctx.hairColor, -0.28)]] as const) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (merged) addMesh(parent, merged, material('hair', color));
  }
}

export function buildHair(rig: Rig, a: Appearance, detail: Detail): void {
  const f = detail === 'high' ? 1 : 0.55;
  rig.head.add(rig.hair);
  const ctx: HairCtx = {
    main: [],
    dark: [],
    rnd: seeded(a.hairStyle.length * 977 + 13),
    count: (n) => Math.max(3, Math.round(n * f)),
    seg: (n) => Math.max(6, Math.round(n * (detail === 'high' ? 1 : 0.6))),
    rig,
    hairColor: a.hairColor,
  };
  STYLES[a.hairStyle](ctx);
  attachMerged(rig.hair, ctx.main, ctx.dark, ctx);
}
