import * as THREE from 'three';
import { shade, type Appearance } from './appearance';
import { addMesh, HEAD_UNIT as R, type Rig } from './body';
import { strand, type Detail, type P3 } from './geometry';
import { material, unlit } from './materials';

/**
 * The head, ears and face, modelled in the head frame (radius HEAD_UNIT, centre
 * at 0). Hair and head accessories use the same frame through `onSkull`.
 */

/** Depth of the face surface at (x, y) in the head frame, plus `k` for points just above it. */
export const faceZ = (x: number, y: number, k = 1): number => 0.96 * Math.sqrt(Math.max(0, R * R * k * k - x * x - (y / 1.02) ** 2));

/** A point on (k > 1: above) the skull: theta round from the front, phi down from the crown. */
export const onSkull = (theta: number, phi: number, k = 1.04): [number, number, number] => [
  R * k * Math.sin(phi) * Math.sin(theta),
  R * k * 1.02 * Math.cos(phi),
  R * k * 0.96 * Math.sin(phi) * Math.cos(theta),
];

export function buildHead(rig: Rig, a: Appearance, detail: Detail): void {
  const seg = detail === 'high' ? 1 : 0.6;
  const skin = material('skin', a.skin);
  const head = rig.head;

  // Skull with a slightly narrower jaw and chin.
  const skull = new THREE.SphereGeometry(R, Math.round(96 * seg), Math.round(72 * seg));
  skull.scale(1, 1.02, 0.96);
  const p = skull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y >= 0) continue;
    const k = Math.min(1, -y / R);
    p.setX(i, p.getX(i) * (1 - 0.14 * k * k));
    if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) * (1 - 0.05 * k));
  }
  skull.computeVertexNormals();
  addMesh(head, skull, skin);

  // Small pointed ears, flat front to back.
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.03, 0.095, Math.round(32 * seg), 4);
    ear.translate(0, 0.0475, 0);
    ear.scale(1, 1, 0.36);
    const m = addMesh(head, ear, skin);
    m.position.set(s * 0.17, -0.005, -0.015);
    m.rotation.set(-0.45, 0, -s * 0.78);
  }

  // Eyes: white, iris, pupil, two catchlights and a lash line. Grouped so they can blink.
  const lash = material('pupil', '#2a2333');
  const shine = unlit('#ffffff');
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    const ex = s * 0.066;
    const ey = -0.016;
    eye.position.set(ex, ey, faceZ(ex, ey) - 0.004);
    eye.rotation.y = s * 0.38;
    const white = new THREE.SphereGeometry(0.038, 32, 24);
    white.scale(0.9, 1.1, 0.35);
    addMesh(eye, white, material('eyeWhite', '#f6f3f0'), false);
    const iris = new THREE.SphereGeometry(0.028, 32, 24);
    iris.scale(0.85, 1.05, 0.3);
    iris.translate(0, -0.003, 0.006);
    addMesh(eye, iris, material('iris', a.eyes), false);
    const pupil = new THREE.SphereGeometry(0.014, 24, 18);
    pupil.scale(0.8, 1.05, 0.3);
    pupil.translate(0, -0.004, 0.0095);
    addMesh(eye, pupil, material('pupil', '#1a1530'), false);
    const c1 = new THREE.SphereGeometry(0.0065, 12, 8);
    c1.translate(-s * 0.008, 0.01, 0.013);
    addMesh(eye, c1, shine, false);
    const c2 = new THREE.SphereGeometry(0.0035, 12, 8);
    c2.translate(s * 0.007, -0.011, 0.013);
    addMesh(eye, c2, shine, false);
    const lashPts: P3[] = [[-s * 0.038, 0.014, 0.009], [-s * 0.014, 0.041, 0.014], [s * 0.02, 0.04, 0.013], [s * 0.041, 0.023, 0.007], [s * 0.052, 0.031, 0.002]];
    const lashGeo = strand(lashPts, 0.005, 32, 6, { taper: false });
    addMesh(eye, lashGeo, lash, false);
    head.add(eye);
    rig.eyes.push(eye);
  }

  // Brows, nose, mouth and a soft blush.
  const brow = material('hair', shade(a.hairColor, -0.35));
  for (const s of [-1, 1]) {
    const pts = [[s * 0.034, 0.07], [s * 0.066, 0.08], [s * 0.098, 0.068]].map(([x, y]) => [x!, y!, faceZ(x!, y!) + 0.003] as const);
    addMesh(head, strand(pts, 0.005, 20, 6, { taper: false }), brow, false);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.03, 32), unlit('#ff9fb0', 0.28));
    const bx = s * 0.104;
    const by = -0.07;
    blush.position.set(bx, by, faceZ(bx, by) + 0.002);
    blush.rotation.y = s * 0.62;
    blush.scale.y = 0.6;
    head.add(blush);
  }
  const nose = new THREE.SphereGeometry(0.012, 20, 14);
  nose.scale(0.9, 0.8, 0.85);
  nose.translate(0, -0.056, faceZ(0, -0.056) - 0.003);
  addMesh(head, nose, skin, false);
  const mouthPts = [[-0.024, -0.104], [-0.011, -0.113], [0, -0.115], [0.011, -0.113], [0.024, -0.104]].map(
    ([x, y]) => [x!, y!, faceZ(x!, y!) + 0.0015] as const,
  );
  addMesh(head, strand(mouthPts, 0.0042, 24, 6, { taper: false }), material('lip', shade(a.skin, -0.45)), false);
}
