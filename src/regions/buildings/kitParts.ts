import * as THREE from 'three';

/**
 * Building blocks shared by every stone building (the academy, the building
 * kit): a mesh accumulator per surface with meter-based UVs, arched openings
 * with dressed-stone surrounds, oriented boxes and turned rings (towers,
 * cones). Pure three.js geometry, no materials.
 */

export type V3 = readonly [number, number, number];

/** The five surfaces, each with its own CC0 texture set (public/textures/academy). */
export type BuildingPart = 'wall' | 'roof' | 'trim' | 'door' | 'glass';
export const BUILDING_PARTS: readonly BuildingPart[] = ['wall', 'roof', 'trim', 'door', 'glass'];

/** Rotation about Y and an offset, applied to everything a Part receives (a wing turned on its site). */
export interface PlanTransform {
  angle: number;
  x: number;
  z: number;
}

export class Part {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  /** Current placement; UVs are taken before it, so turned wings keep the same stone size. */
  xf: PlanTransform = { angle: 0, x: 0, z: 0 };
  constructor(readonly scale: number) {}

  private push(p: V3, n: V3): void {
    const c = Math.cos(this.xf.angle);
    const s = Math.sin(this.xf.angle);
    // Same convention as three.js rotation.y: local +X → (cos, −sin), +Z → (sin, cos).
    this.pos.push(this.xf.x + p[0] * c + p[2] * s, p[1], this.xf.z - p[0] * s + p[2] * c);
    this.nor.push(n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c);
  }

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
      this.push(P[i]!, N[i]!);
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

  get triangles(): number {
    return this.pos.length / 9;
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
export function planarUv(p: V3, n: V3): [number, number] {
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

/** A point in a wall's plane: origin o, tangent t (horizontal, to the right seen from outside, t = Y × n), normal n. */
export interface WallFrame {
  o: V3;
  t: V3;
  n: V3;
}

export const at = (f: WallFrame, u: number, v: number, d: number): V3 => [
  f.o[0] + f.t[0] * u + f.n[0] * d,
  f.o[1] + v,
  f.o[2] + f.t[2] * u + f.n[2] * d,
];

/** The frame of a vertical wall facing outward along horizontal normal n, through point o. */
export function wallFrame(o: V3, n: V3): WallFrame {
  return { o, t: [n[2], 0, -n[0]], n };
}

/** A flat wall face in a wall's frame: u (along) and v (up) ranges, d out of the wall. */
export function frameQuad(part: Part, f: WallFrame, u0: number, u1: number, v0: number, v1: number, d = 0): void {
  part.quad(at(f, u0, v0, d), at(f, u1, v0, d), at(f, u1, v1, d), at(f, u0, v1, d), f.n);
}

/** A box laid out in a wall's frame: u (along), v (up) and d (out of the wall) ranges. */
export function frameBox(part: Part, f: WallFrame, u0: number, u1: number, v0: number, v1: number, d0: number, d1: number): void {
  const p = (u: number, v: number, d: number) => at(f, u, v, d);
  const t = f.t;
  const n = f.n;
  part.quad(p(u0, v0, d1), p(u1, v0, d1), p(u1, v1, d1), p(u0, v1, d1), n);
  part.quad(p(u0, v1, d0), p(u1, v1, d0), p(u1, v1, d1), p(u0, v1, d1), [0, 1, 0]);
  part.quad(p(u0, v0, d0), p(u1, v0, d0), p(u1, v0, d1), p(u0, v0, d1), [0, -1, 0]);
  part.quad(p(u1, v0, d0), p(u1, v1, d0), p(u1, v1, d1), p(u1, v0, d1), t);
  part.quad(p(u0, v0, d0), p(u0, v1, d0), p(u0, v1, d1), p(u0, v0, d1), [-t[0], -t[1], -t[2]]);
}

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
export function opening(panel: Part, trim: Part, f: WallFrame, cu: number, v0: number, w: number, h: number, frame: number, sill = true): void {
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
    // A sill: a slab under the window, wider than the surround, along the wall.
    const half = w / 2 + frame + 0.1;
    frameBox(trim, f, cu - half, cu + half, v0 - 0.16, v0, 0, 0.22);
  }
}

/**
 * A turned band round (cx, cz): radius r0 at y0 to r1 at y1 (a cylinder, a
 * cone, or a sloped ledge), smooth radial normals tilted with the slope, UVs
 * unrolled in meters (around × up the slant).
 */
export function ring(part: Part, cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, segments: number, uvRadius = Math.max(r0, r1)): void {
  const k = (r0 - r1) / Math.max(1e-6, Math.hypot(r0 - r1, y1 - y0));
  const h = Math.sqrt(Math.max(0, 1 - k * k));
  const slant = Math.hypot(r0 - r1, y1 - y0);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p00: V3 = [cx + c0 * r0, y0, cz + s0 * r0];
    const p10: V3 = [cx + c1 * r0, y0, cz + s1 * r0];
    const p01: V3 = [cx + c0 * r1, y1, cz + s0 * r1];
    const p11: V3 = [cx + c1 * r1, y1, cz + s1 * r1];
    const n0: V3 = [c0 * h, k, s0 * h];
    const n1: V3 = [c1 * h, k, s1 * h];
    const u0 = a0 * uvRadius;
    const u1 = a1 * uvRadius;
    part.tri(p00, p10, p11, n0, n1, n1, [u0, y0], [u1, y0], [u1, y0 + slant]);
    part.tri(p00, p11, p01, n0, n1, n0, [u0, y0], [u1, y0 + slant], [u0, y0 + slant]);
  }
}

/** A flat disc (soffit or floor) at height y, facing up or down. */
export function disc(part: Part, cx: number, cz: number, r: number, y: number, segments: number, up: boolean): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    part.flat([[cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx, y, cz]], [0, up ? 1 : -1, 0]);
  }
}
