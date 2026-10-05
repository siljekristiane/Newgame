import * as THREE from 'three';

/** 'high' in the wardrobe preview, 'medium' in the world (fewer hair strands and segments). */
export type Detail = 'high' | 'medium';

export type P3 = readonly [number, number, number];

export const v3 = (p: P3 | THREE.Vector3): THREE.Vector3 => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));

/** Seeded random numbers (mulberry32), so the same look always builds the same strands. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A body or garment shell: a profile of [radius, y] pairs, bottom to top, spun round Y. */
export function lathe(
  profile: ReadonlyArray<readonly [number, number]>,
  segments: number,
  depth = 1,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segments, phiStart, phiLength);
  g.scale(1, 1, depth);
  return g;
}

/** A limb hanging down from y = 0 to y = -len, radius r0 at the top and r1 at the bottom, with round ends. */
export function limb(len: number, r0: number, r1: number, segments = 40): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(a)), -len + r1 * Math.sin(a)));
  }
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, segments);
}

/** Root thick, tip thin: the radius along a hair strand (t = 0 at the root). */
function taper(t: number): number {
  return t < 0.15 ? 0.6 + 0.4 * (t / 0.15) : 1 - 0.88 * Math.pow((t - 0.15) / 0.85, 1.4);
}

/** A tube along a smooth curve. Hair strands taper to a point; trims and braids keep their width. */
export function strand(
  points: ReadonlyArray<P3 | THREE.Vector3>,
  radius: number,
  tubular = 40,
  radial = 8,
  opts: { closed?: boolean; taper?: boolean } = {},
): THREE.BufferGeometry {
  const closed = opts.closed ?? false;
  const curve = new THREE.CatmullRomCurve3(points.map(v3), closed, 'centripetal');
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  if (opts.taper ?? true) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      const t = i / tubular;
      curve.getPointAt(t, c);
      const s = taper(t);
      for (let j = 0; j <= radial; j++) {
        const idx = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(s).add(c);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
  }
  return g;
}

export function starShape(outer: number, inner: number, points = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** A thin, bevelled plate from a 2D shape (stars, leaves, a moon), facing +Z. */
export function plate(shapes: THREE.Shape | THREE.Shape[], depth: number, bevel = depth * 0.4): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
}

/** A ring lying flat round the Y axis (belt, collar, hem band). */
export function ring(radius: number, tube: number, depth = 1, segments = 96): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tube, 12, segments);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, depth);
  return g;
}

/**
 * Ruffles a shell below `topY`: the radius swings with the angle, more toward
 * the hem (skirts, cloaks, coat tails).
 */
export function ruffle(g: THREE.BufferGeometry, topY: number, bottomY: number, amount: number, waves: number): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (topY - p.getY(i)) / (topY - bottomY)));
    const ang = Math.atan2(p.getX(i), p.getZ(i));
    const f = 1 + amount * Math.sin(ang * waves) * t * t;
    p.setX(i, p.getX(i) * f);
    p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
}
