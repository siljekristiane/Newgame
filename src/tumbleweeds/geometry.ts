import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_SEED } from '../config/world';
import { tumbleweedPalette } from '../design/tokens';
import { mulberry32 } from '../world/noise';

/**
 * A tumbleweed, radius 1 (scaled per instance): a loose ball of thin, curved,
 * branching twigs: arcs round the shell that wander in and out, with forks and
 * short side shoots, pale and sun-bleached outside, darker inside. Every twig
 * is a real tube: ~7 k triangles up close ('high'), ~2 k further off ('low',
 * the same twigs, fewer sides and segments, no side shoots).
 */
export function createTumbleweedGeometry(detail: 'high' | 'low' = 'high', seed = 0): THREE.BufferGeometry {
  const high = detail === 'high';
  const random = mulberry32(WORLD_SEED + 9_100 + seed);
  const parts: THREE.BufferGeometry[] = [];
  const pale = new THREE.Color(tumbleweedPalette.twigPale);
  const mid = new THREE.Color(tumbleweedPalette.twig);
  const dark = new THREE.Color(tumbleweedPalette.twigDark);

  const twig = (points: THREE.Vector3[], radius: number, segments: number, sides: number) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const g = new THREE.TubeGeometry(curve, segments, radius, sides, false);
    // Colour by depth: the shell is bleached, the core dark.
    const pos = g.attributes.position!;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      const t = Math.min(1, Math.max(0, (d - 0.35) / 0.65));
      c.copy(dark).lerp(mid, Math.min(1, t * 1.6)).lerp(pale, Math.max(0, t - 0.55) * 1.6);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  };

  const randomDir = () => {
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return new THREE.Vector3(Math.cos(a) * s, u, Math.sin(a) * s);
  };

  // Main twigs: arcs along great circles of the shell, wandering in radius.
  for (let i = 0; i < 46; i++) {
    const a = randomDir();
    const b = randomDir().cross(a).normalize();
    const start = random() * Math.PI * 2;
    const sweep = 1.2 + random() * 2.2;
    const n = 7;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = start + (sweep * k) / n;
      const r = 0.72 + random() * 0.28;
      pts.push(a.clone().multiplyScalar(Math.cos(t) * r).addScaledVector(b, Math.sin(t) * r));
    }
    twig(pts, (0.012 + random() * 0.01) * (high ? 1 : 1.4), high ? 12 : 6, high ? 4 : 3);
    // Short side shoots, pointing outward a little.
    for (let f = 0; f < 2; f++) {
      const from = pts[1 + Math.floor(random() * (n - 2))]!;
      const out = from.clone().normalize().multiplyScalar(0.06 + random() * 0.1).add(randomDir().multiplyScalar(0.12));
      const thin = 0.007 + random() * 0.004;
      if (high) twig([from.clone(), from.clone().add(out.clone().multiplyScalar(0.5)), from.clone().add(out)], thin, 3, 3);
    }
  }
  // Inner tangle: shorter, thicker, darker stems through the core.
  for (let i = 0; i < 14; i++) {
    const a = randomDir().multiplyScalar(0.15 + random() * 0.4);
    const b = randomDir().multiplyScalar(0.3 + random() * 0.45);
    const m = a.clone().add(b).multiplyScalar(0.5).add(randomDir().multiplyScalar(0.12));
    twig([a, m, b], 0.018 + random() * 0.01, high ? 6 : 3, high ? 5 : 3);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('tumbleweed: merge failed');
  merged.computeBoundingSphere();
  return merged;
}
