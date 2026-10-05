import * as THREE from 'three';
import type { AnimState, MotionInput } from './animate';
import { HUMANOID_BONES, type BoneMap, type HumanoidBone } from './humanoid';

/**
 * Procedural animation for any rigged (skinned) humanoid: the same idle,
 * walk, run, glide and jump as animate.ts, but driven through bone roles
 * (humanoid.ts) instead of the procedural figure's joint groups.
 *
 * Every pose is written as a rotation in the character's own space (facing
 * +Z, Y up) and converted to each bone's local frame from its rest pose, so
 * it works whatever axes the modelling tool gave the bones.
 */
interface BoneRest {
  bone: THREE.Bone;
  /** Local rotation in the rest pose. */
  rest: THREE.Quaternion;
  /** Parent's world rotation in the rest pose, relative to the rig root. */
  parent: THREE.Quaternion;
  parentInv: THREE.Quaternion;
}

export interface SkinnedRig {
  bones: Partial<Record<HumanoidBone, BoneRest>>;
  /** Rotations that bring each upper arm from the file's rest pose down to `armRest`. */
  armDown: { L: THREE.Quaternion; R: THREE.Quaternion };
  /** Rest height of the hips bone, for the walking bob. */
  hipsY: number;
}

type Side = 'L' | 'R';
const LIMBS: Record<Side, Record<'upperArm' | 'foreArm' | 'hand' | 'thigh' | 'shin' | 'foot', HumanoidBone>> = {
  L: { upperArm: 'upperArmL', foreArm: 'foreArmL', hand: 'handL', thigh: 'thighL', shin: 'shinL', foot: 'footL' },
  R: { upperArm: 'upperArmR', foreArm: 'foreArmR', hand: 'handR', thigh: 'thighR', shin: 'shinR', foot: 'footR' },
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Reads the rest pose. Call before any animation, with the model in its bind pose. */
export function createSkinnedRig(root: THREE.Object3D, map: BoneMap, armRest = 0.12): SkinnedRig {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const byName = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone);
  });
  const bones: SkinnedRig['bones'] = {};
  for (const role of HUMANOID_BONES) {
    const name = map[role];
    const bone = name ? byName.get(name) : undefined;
    if (!bone) continue;
    const parent = new THREE.Quaternion();
    if (bone.parent) {
      _m.multiplyMatrices(rootInv, bone.parent.matrixWorld).decompose(_p, parent, _s);
    }
    bones[role] = { bone, rest: bone.quaternion.clone(), parent, parentInv: parent.clone().invert() };
  }
  const worldPos = (b: THREE.Bone | undefined, out: THREE.Vector3) => (b ? out.setFromMatrixPosition(_m.multiplyMatrices(rootInv, b.matrixWorld)) : out.set(0, 0, 0));
  const lower = (side: Side) => {
    const up = bones[LIMBS[side].upperArm]?.bone;
    const fore = bones[LIMBS[side].foreArm]?.bone;
    const q = new THREE.Quaternion();
    if (!up || !fore) return q;
    const dir = worldPos(fore, _b).sub(worldPos(up, _a)).normalize();
    const s = side === 'L' ? 1 : -1;
    const target = new THREE.Vector3(s * Math.sin(armRest), -Math.cos(armRest), 0.04).normalize();
    return q.setFromUnitVectors(dir, target);
  };
  const hips = bones.hips?.bone;
  return { bones, armDown: { L: lower('L'), R: lower('R') }, hipsY: hips ? hips.position.y : 0 };
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _w = new THREE.Quaternion();

/** Character-space rotation: about X (positive leans/bends forward), then Y, then Z. */
function euler(x: number, y: number, z: number, out: THREE.Quaternion): THREE.Quaternion {
  out.setFromAxisAngle(Y, y);
  out.multiply(_q.setFromAxisAngle(X, x));
  return out.premultiply(_q.setFromAxisAngle(Z, z));
}

/** Puts a character-space rotation `w` on a bone, on top of its rest pose. */
function pose(r: BoneRest | undefined, w: THREE.Quaternion): void {
  if (!r) return;
  r.bone.quaternion.copy(r.parentInv).multiply(w).multiply(r.parent).multiply(r.rest);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One frame. Rotations about +X with a positive angle tip a limb hanging
 * down towards -Z (backwards), so a leg or arm swinging forward is negative.
 */
export function animateSkinned(rig: SkinnedRig, s: AnimState, dt: number, m: MotionInput): void {
  s.time += dt;
  const t = s.time;
  const walk = smooth(0.15, 2.5, m.speed);
  const run = smooth(9, 16, m.speed);
  const glide = smooth(60, 140, m.speed);
  const air = smooth(0.03, 0.35, m.air);
  const stride = 0.75 + run * 0.55;
  s.phase += Math.min((m.speed / stride) * Math.PI, 14) * dt;
  const swing = walk * (0.5 + 0.35 * run) * (1 - glide) * (1 - air * 0.7);
  const sinP = Math.sin(s.phase);
  const breathe = Math.sin(t * 1.6 + s.seed);
  const idle = 1 - walk;
  const b = rig.bones;

  if (b.hips) {
    b.hips.bone.position.y = rig.hipsY + Math.abs(sinP) * 0.025 * walk * (1 - glide);
    pose(b.hips, euler(0, sinP * 0.07 * walk * (1 - glide), Math.cos(s.phase) * 0.03 * walk, _w));
  }
  pose(b.spine, euler(-(run * 0.12 + glide * 0.25), 0, 0, _w));
  pose(b.chest, euler(-(run * 0.05 + glide * 0.1) + breathe * 0.01, -sinP * 0.1 * walk * (1 - glide), 0, _w));
  pose(b.neck, euler(run * 0.08 + Math.sin(t * 0.23) * 0.03 * idle, Math.sin(t * 0.37 + s.seed) * 0.18 * idle, 0, _w));
  pose(b.head, euler(run * 0.06, Math.sin(t * 0.37 + s.seed) * 0.12 * idle, Math.sin(t * 0.29 + 1) * 0.04 * idle, _w));

  for (const side of ['L', 'R'] as const) {
    const k = side === 'L' ? 1 : -1;
    const l = LIMBS[side];
    const legSwing = k * sinP * swing;
    pose(b[l.thigh], euler(-legSwing - air * 0.55 - glide * 0.25, 0, k * 0.02, _w));
    const back = Math.max(0, k * Math.sin(s.phase + Math.PI / 2));
    pose(b[l.shin], euler(back * swing * 1.3 + air * 0.95 + glide * 0.2, 0, 0, _w));
    pose(b[l.foot], euler(-back * swing * 0.3, 0, 0, _w));

    // Arms: lower from the file's rest pose, then swing against the legs.
    const armSwing = -k * sinP * swing * 0.85;
    const out = k * (air * 0.5 + glide * 0.2 + Math.abs(breathe) * 0.008);
    euler(armSwing - glide * 0.9 + Math.sin(t * 0.9 + k) * 0.02 * idle, 0, out, _w).multiply(rig.armDown[side]);
    pose(b[l.upperArm], _w);
    pose(b[l.foreArm], euler(-((0.12 + walk * 0.25 + run * 0.8) * (1 - glide) + air * 0.3), 0, 0, _w));
    pose(b[l.hand], euler(0, 0, 0, _w));
  }
}
