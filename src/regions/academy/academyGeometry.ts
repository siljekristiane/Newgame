import * as THREE from 'three';
import { ACADEMY } from '../../config/world';
import { academyLayout } from './layout';

/**
 * The academy's shape, built in code in its own frame (layout.ts): origin at
 * the hall's centre on the pad (y = 0), +Z out of the front, X along the hall.
 * One geometry per surface, so each takes its own CC0 texture set: rubble
 * stone walls, slate roofs, dressed stone trim (plinth, quoins, cornices,
 * window and door surrounds, steps), the oak door and the window glass.
 *
 * UVs are in meters divided by ACADEMY.texScale, so the stone keeps one size
 * on every face. Windows and surrounds sit proud of the walls instead of being
 * cut in, which keeps the shape simple and cheap (~15 k triangles).
 */

export type AcademyPart = 'wall' | 'roof' | 'trim' | 'door' | 'glass';
export const ACADEMY_PARTS: readonly AcademyPart[] = ['wall', 'roof', 'trim', 'door', 'glass'];

type V3 = readonly [number, number, number];

class Part {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  constructor(readonly scale: number) {}

  /** One triangle; flipped if needed so its front faces along the normals given. */
  tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, ua: [number, number], ub: [number, number], uc: [number, number]): void {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const fx = e1y * e2z - e1z * e2y;
    const fy = e1z * e2x - e1x * e2z;
    const fz = e1x * e2y - e1y * e2x;
    const dot = fx * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fz * (na[2] + nb[2] + nc[2]);
    const order = dot < 0 ? [0, 2, 1] : [0, 1, 2];
    const P = [a, b, c];
    const N = [na, nb, nc];
    const U = [ua, ub, uc];
    for (const i of order) {
      this.pos.push(...P[i]!);
      this.nor.push(...N[i]!);
      this.uv.push(U[i]![0] / this.scale, U[i]![1] / this.scale);
    }
  }

  /** A flat polygon fan (convex, points in order) with planar UVs from its normal. */
  flat(points: readonly V3[], n: V3): void {
    const uvs = points.map((p) => planarUv(p, n));
    for (let i = 1; i < points.length - 1; i++) this.tri(points[0]!, points[i]!, points[i + 1]!, n, n, n, uvs[0]!, uvs[i]!, uvs[i + 1]!);
  }

  quad(a: V3, b: V3, c: V3, d: V3, n: V3): void {
    this.flat([a, b, c, d], n);
  }

  /** An axis-aligned box (all six faces unless `skip` names them: '+y', '-y' …). */
  box(min: V3, max: V3, skip: string[] = []): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const faces: Array<[string, V3, V3[]]> = [
      ['+x', [1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      ['-x', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      ['+y', [0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      ['-y', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ['+z', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['-z', [0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    ];
    for (const [id, n, p] of faces) if (!skip.includes(id)) this.quad(p[0]!, p[1]!, p[2]!, p[3]!, n);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** Planar UV in meters: along the face's horizontal tangent and up its slope; plan view for flat tops. */
function planarUv(p: V3, n: V3): [number, number] {
  if (Math.abs(n[1]) > 0.95) return [p[0], p[2]];
  // T = normalize(Y × n), B = n × T.
  let tx = n[2];
  let tz = -n[0];
  const tl = Math.hypot(tx, tz);
  tx /= tl;
  tz /= tl;
  const bx = n[1] * tz;
  const by = n[2] * tx - n[0] * tz;
  const bz = -n[1] * tx;
  return [p[0] * tx + p[2] * tz, p[0] * bx + p[1] * by + p[2] * bz];
}

/** A point in a wall's plane: origin o, tangent t (horizontal, to the right seen from outside), normal n. */
interface WallFrame {
  o: V3;
  t: V3;
  n: V3;
}
const at = (f: WallFrame, u: number, v: number, d: number): V3 => [
  f.o[0] + f.t[0] * u + f.n[0] * d,
  f.o[1] + v,
  f.o[2] + f.t[2] * u + f.n[2] * d,
];

/** Outline of an arched opening (u, v), bottom at v = 0, width w, sides rising to `spring`, a half-circle above. */
function archOutline(w: number, spring: number, steps: number, grow = 0, drop = 0): Array<[number, number]> {
  const r = w / 2 + grow;
  const out: Array<[number, number]> = [[-r, -drop], [r, -drop], [r, spring]];
  for (let i = 1; i < steps; i++) {
    const a = (Math.PI * i) / steps;
    out.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  out.push([-r, spring]);
  return out;
}

/**
 * An arched opening on a wall: the panel (glass or door) just off the wall and
 * a dressed-stone surround standing proud around it, with a sill.
 */
function opening(panel: Part, trim: Part, f: WallFrame, cu: number, v0: number, w: number, h: number, frame: number, sill = true): void {
  const spring = Math.max(0.1, h - w / 2);
  const steps = 10;
  const inner = archOutline(w, spring, steps);
  const outer = archOutline(w, spring, steps, frame, sill ? 0 : frame * 0.4);
  const depth = 0.2;
  // Panel: a fan from the middle (the outline is convex).
  const c = at(f, cu, v0 + spring * 0.5, 0.025);
  const pts = inner.map(([u, v]) => at(f, cu + u, v0 + v, 0.025));
  for (let i = 0; i < pts.length; i++) panel.flat([c, pts[i]!, pts[(i + 1) % pts.length]!], f.n);
  // Surround: front ring between the outlines, plus the outer edge back to the wall.
  // The bottom edge is left open: the sill (or the threshold) covers it.
  for (let i = 1; i < inner.length; i++) {
    const j = (i + 1) % inner.length;
    const a = inner[i]!;
    const b = inner[j]!;
    const A = outer[i]!;
    const B = outer[j]!;
    trim.quad(at(f, cu + a[0], v0 + a[1], depth), at(f, cu + b[0], v0 + b[1], depth), at(f, cu + B[0], v0 + B[1], depth), at(f, cu + A[0], v0 + A[1], depth), f.n);
    // Outer edge, facing out from the opening.
    const eu = B[0] - A[0];
    const ev = B[1] - A[1];
    const el = Math.hypot(eu, ev) || 1;
    const nu = ev / el;
    const nv = -eu / el;
    const en: V3 = [f.t[0] * nu, nv, f.t[2] * nu];
    trim.quad(at(f, cu + A[0], v0 + A[1], 0), at(f, cu + B[0], v0 + B[1], 0), at(f, cu + B[0], v0 + B[1], depth), at(f, cu + A[0], v0 + A[1], depth), en);
    // Inner reveal, facing into the opening.
    trim.quad(at(f, cu + a[0], v0 + a[1], 0.025), at(f, cu + b[0], v0 + b[1], 0.025), at(f, cu + b[0], v0 + b[1], depth), at(f, cu + a[0], v0 + a[1], depth), [-en[0], -en[1], -en[2]]);
  }
  if (sill) {
    // A sill: a slab under the window, wider than the surround.
    const half = w / 2 + frame + 0.1;
    const p0 = at(f, cu - half, v0 - 0.16, 0);
    const p1 = at(f, cu + half, v0, 0.22);
    const min: V3 = [Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2])];
    const max: V3 = [Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2])];
    trim.box(min, max);
  }
}

export interface AcademyGeometry {
  parts: Record<AcademyPart, THREE.BufferGeometry>;
  triangles: number;
  /** Highest point (tower roof tip), meters above the pad. */
  height: number;
}

export function createAcademyGeometry(): AcademyGeometry {
  const { hall, tower, door, texScale } = ACADEMY;
  const P: Record<AcademyPart, Part> = {
    wall: new Part(texScale.wall),
    roof: new Part(texScale.roof),
    trim: new Part(texScale.trim),
    door: new Part(texScale.door),
    glass: new Part(1),
  };
  const W = hall.width / 2;
  const D = hall.depth / 2;
  const top = hall.wallHeight;
  const base = hall.plinth;
  const sink = -1.5; // below the pad, so the blend never shows a gap

  // Plinth: dressed stone around the hall, a little proud of the walls.
  P.trim.box([-W - 0.25, sink, -D - 0.25], [W + 0.25, base, D + 0.25], ['-y']);

  // Hall walls (from the plinth up) and gables under the ridge along X.
  P.wall.quad([-W, base, D], [W, base, D], [W, top, D], [-W, top, D], [0, 0, 1]);
  P.wall.quad([W, base, -D], [-W, base, -D], [-W, top, -D], [W, top, -D], [0, 0, -1]);
  for (const s of [1, -1] as const) {
    const n: V3 = [s, 0, 0];
    P.wall.quad([s * W, base, -D], [s * W, base, D], [s * W, top, D], [s * W, top, -D], n);
    P.wall.flat([[s * W, top, -D], [s * W, top, D], [s * W, hall.ridge, 0]], n);
  }

  // Quoins: dressed blocks up each hall corner, alternately long and short on each face.
  const course = 0.55;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * W;
      const z = sz * D;
      for (let k = 0, y = base; y < top - 0.01; k++, y += course) {
        const y1 = Math.min(top, y + course - 0.04);
        const along = k % 2 === 0 ? 0.95 : 0.5;
        const across = k % 2 === 0 ? 0.5 : 0.95;
        // On the long wall (z face) and on the end wall (x face), standing 0.1 m proud.
        P.trim.box([Math.min(x, x - sx * along), y, Math.min(z, z + sz * 0.1)], [Math.max(x, x - sx * along), y1, Math.max(z, z + sz * 0.1)]);
        P.trim.box([Math.min(x, x + sx * 0.1), y, Math.min(z, z - sz * across)], [Math.max(x, x + sx * 0.1), y1, Math.max(z, z - sz * across)]);
      }
    }
  }

  // Cornice under the eaves on the long sides.
  P.trim.box([-W - 0.2, top - 0.45, D - 0.05], [W + 0.2, top, D + 0.22], ['-z']);
  P.trim.box([-W - 0.2, top - 0.45, -D - 0.22], [W + 0.2, top, -D + 0.05], ['+z']);

  // Roof: two slate slopes with some thickness, the ridge along X.
  const o = hall.overhang;
  const rise = hall.ridge - top;
  const run = D;
  const drop = (o * rise) / run;
  const eaveY = top - drop;
  const thick = 0.25;
  const RX = W + o;
  for (const s of [1, -1] as const) {
    const slope = Math.hypot(rise, run);
    const n: V3 = [0, run / slope, (s * rise) / slope];
    const eave = s * (D + o);
    P.roof.quad([-RX, eaveY, eave], [RX, eaveY, eave], [RX, hall.ridge, 0], [-RX, hall.ridge, 0], n);
    // Underside and the eave's edge.
    P.roof.quad([-RX, eaveY - thick, eave], [-RX, hall.ridge - thick, 0], [RX, hall.ridge - thick, 0], [RX, eaveY - thick, eave], [-n[0], -n[1], -n[2]]);
    P.roof.quad([-RX, eaveY - thick, eave], [RX, eaveY - thick, eave], [RX, eaveY, eave], [-RX, eaveY, eave], [0, 0, s]);
    // Gable edges (verge).
    for (const sx of [1, -1] as const) {
      P.roof.quad([sx * RX, eaveY - thick, eave], [sx * RX, eaveY, eave], [sx * RX, hall.ridge, 0], [sx * RX, hall.ridge - thick, 0], [sx, 0, 0]);
    }
  }
  // Ridge cap.
  P.trim.box([-RX - 0.05, hall.ridge - 0.1, -0.22], [RX + 0.05, hall.ridge + 0.18, 0.22]);

  // Round tower on the front corner, with a cornice and a slate cone.
  const layout = academyLayout();
  const tx = layout.tower.x;
  const tz = layout.tower.z;
  const R = tower.radius;
  const seg = tower.segments;
  const ring = (part: Part, r0: number, r1: number, y0: number, y1: number, outward = true) => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p00: V3 = [tx + c0 * r0, y0, tz + s0 * r0];
      const p10: V3 = [tx + c1 * r0, y0, tz + s1 * r0];
      const p01: V3 = [tx + c0 * r1, y1, tz + s0 * r1];
      const p11: V3 = [tx + c1 * r1, y1, tz + s1 * r1];
      // Normals tilt with the slope (cone) and stay radial.
      const k = (r0 - r1) / Math.max(1e-6, Math.hypot(r0 - r1, y1 - y0));
      const h = Math.sqrt(Math.max(0, 1 - k * k));
      const sign = outward ? 1 : -1;
      const n0: V3 = [c0 * h * sign, k * sign, s0 * h * sign];
      const n1: V3 = [c1 * h * sign, k * sign, s1 * h * sign];
      const slant = Math.hypot(r0 - r1, y1 - y0);
      const u0 = a0 * R;
      const u1 = a1 * R;
      part.tri(p00, p10, p11, n0, n1, n1, [u0, y0], [u1, y0], [u1, y0 + slant]);
      part.tri(p00, p11, p01, n0, n1, n0, [u0, y0], [u1, y0 + slant], [u0, y0 + slant]);
    }
  };
  ring(P.trim, R + 0.25, R + 0.25, sink, base);
  ring(P.wall, R, R, base, tower.wallHeight);
  ring(P.trim, R + 0.3, R + 0.3, tower.wallHeight, tower.wallHeight + 0.6);
  ring(P.trim, R, R + 0.3, tower.wallHeight - 0.3, tower.wallHeight);
  const coneBase = tower.wallHeight + 0.6;
  ring(P.roof, R + 0.55, 0.001, coneBase - 0.25, tower.top);
  ring(P.roof, R + 0.55, R + 0.55, coneBase - 0.45, coneBase - 0.25);
  // Flat soffit under the cone's overhang.
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const y = coneBase - 0.45;
    P.roof.flat([[tx + Math.cos(a0) * (R + 0.55), y, tz + Math.sin(a0) * (R + 0.55)], [tx + Math.cos(a1) * (R + 0.55), y, tz + Math.sin(a1) * (R + 0.55)], [tx, y, tz]], [0, -1, 0]);
  }
  // Finial.
  P.trim.box([tx - 0.08, tower.top - 0.2, tz - 0.08], [tx + 0.08, tower.top + 0.9, tz + 0.08]);

  // Windows: two rows on the long sides, one on each gable end, slits in the tower.
  const front: WallFrame = { o: [0, 0, D], t: [1, 0, 0], n: [0, 0, 1] };
  const back: WallFrame = { o: [0, 0, -D], t: [-1, 0, 0], n: [0, 0, -1] };
  const right: WallFrame = { o: [W, 0, 0], t: [0, 0, -1], n: [1, 0, 0] };
  const left: WallFrame = { o: [-W, 0, 0], t: [0, 0, 1], n: [-1, 0, 0] };
  const rows = [
    { v: base + 1.4, w: 1.3, h: 2.6 },
    { v: base + 5.0, w: 1.2, h: 2.3 },
  ];
  for (const r of rows) {
    for (const u of [-4.5, 4.5, 8.5]) opening(P.glass, P.trim, front, u, r.v, r.w, r.h, 0.32);
    for (const u of [-8.5, -4.5, 0, 4.5, 8.5]) opening(P.glass, P.trim, back, u, r.v, r.w, r.h, 0.32);
    opening(P.glass, P.trim, right, 0, r.v, r.w, r.h, 0.32);
  }
  // A tall window in each gable, and one on the end behind the tower.
  opening(P.glass, P.trim, right, 0, top + 0.6, 1.1, 2.6, 0.3);
  opening(P.glass, P.trim, left, -2.5, base + 1.4, 1.3, 2.6, 0.32);
  opening(P.glass, P.trim, left, 0, top + 0.6, 1.1, 2.6, 0.3);
  // Tower slits facing away from the hall (angles in the tower's own ring).
  for (const [a, v] of [[Math.PI * 0.75, base + 2.2], [Math.PI * 0.35, base + 6.5], [Math.PI * 1.0, base + 10.5], [Math.PI * 0.6, base + 13]] as const) {
    const n: V3 = [Math.cos(a), 0, Math.sin(a)];
    // Tangent T = Y × n.
    const f: WallFrame = { o: [tx + n[0] * R, 0, tz + n[2] * R], t: [n[2], 0, -n[0]], n };
    opening(P.glass, P.trim, f, 0, v, 0.55, 1.7, 0.22);
  }

  // Door: an arched oak door in a deep stone surround, with steps down to the pad.
  opening(P.door, P.trim, front, 0, base, door.width, door.height, 0.55, false);
  const stepDepth = 0.45;
  const stepRise = base / door.steps;
  for (let i = 0; i < door.steps; i++) {
    const zIn = D + 0.12 + (door.steps - 1 - i) * stepDepth;
    P.trim.box([-door.width / 2 - 0.8, sink, D], [door.width / 2 + 0.8, stepRise * (i + 1), zIn + stepDepth], ['-y']);
  }

  const parts = {} as Record<AcademyPart, THREE.BufferGeometry>;
  let triangles = 0;
  for (const k of ACADEMY_PARTS) {
    parts[k] = P[k].geometry();
    triangles += P[k].pos.length / 9;
  }
  return { parts, triangles, height: tower.top + 0.9 };
}
