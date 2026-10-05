import * as THREE from 'three';
import { lathe, limb } from './geometry';
import { material } from './materials';

/**
 * Body measurements in meters for a 1,6 m figure (buildAvatar scales the whole
 * model to AVATAR.height). Clothing patterns build round these numbers.
 */
export const BODY = {
  hipJointY: 0.86,
  hipJointX: 0.078,
  thigh: { len: 0.4, r0: 0.068, r1: 0.048 },
  shin: { len: 0.37, r0: 0.047, r1: 0.032 },
  /** Foot centre below the knee. */
  footY: -0.385,
  shoulder: { x: 0.162, y: 1.285 },
  upperArm: { len: 0.27, r0: 0.04, r1: 0.032 },
  forearm: { len: 0.24, r0: 0.031, r1: 0.025 },
  waistY: 0.97,
  neckY: 1.36,
  headY: 1.49,
  /** The head is modelled in a unit frame with radius HEAD_UNIT and scaled to headRadius. */
  headRadius: 0.118,
  /** Front-to-back depth of the torso relative to its width. */
  depth: 0.7,
  /** Torso profile: [radius, y] from the crotch up to the base of the neck. */
  torso: [
    [0.0001, 0.8], [0.11, 0.805], [0.145, 0.86], [0.15, 0.92], [0.13, 0.99], [0.115, 1.04], [0.122, 1.1],
    [0.135, 1.16], [0.15, 1.23], [0.155, 1.27], [0.13, 1.31], [0.075, 1.345], [0.0001, 1.352],
  ] as ReadonlyArray<readonly [number, number]>,
};

/** Radius the head is modelled at (see head.ts); the head group is scaled by headRadius / HEAD_UNIT. */
export const HEAD_UNIT = 0.19;

/** Joint groups the animator turns and the clothing patterns hang meshes on. */
export interface Rig {
  root: THREE.Group;
  /** Moves the whole body (bob, jump squash). Model coordinates. */
  hips: THREE.Group;
  /** Torso, arms and head; turns at the waist. Children use model coordinates. */
  torso: THREE.Group;
  torsoPivot: THREE.Group;
  /** Turns at the neck. */
  neckPivot: THREE.Group;
  /** Head frame: unit radius HEAD_UNIT, centred on the head. */
  head: THREE.Group;
  hair: THREE.Group;
  /** A ponytail that swings, if the hairstyle has one. */
  tail: THREE.Group | null;
  eyes: THREE.Group[];
  /** [left, right]. Shoulder/hip groups hang the limb down -Y from the joint. */
  shoulder: [THREE.Group, THREE.Group];
  elbow: [THREE.Group, THREE.Group];
  hip: [THREE.Group, THREE.Group];
  knee: [THREE.Group, THREE.Group];
  /** Skirts, cloaks and coat tails that swing a little. */
  sway: THREE.Object3D[];
  /** Model-space height from the sole to the top of the head (before hair). */
  modelHeight: number;
}

export function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A pivot at `y` whose child `inner` keeps using model coordinates. */
function pivotAt(parent: THREE.Object3D, y: number): { pivot: THREE.Group; inner: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.position.y = y;
  const inner = new THREE.Group();
  inner.position.y = -y;
  pivot.add(inner);
  parent.add(pivot);
  return { pivot, inner };
}

export function buildBody(skinColor: string, segments: number): Rig {
  const skin = material('skin', skinColor);
  const root = new THREE.Group();
  root.name = 'avatar';
  const hips = new THREE.Group();
  root.add(hips);

  // Legs: hip → knee → foot.
  const hip: THREE.Group[] = [];
  const knee: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(side * BODY.hipJointX, BODY.hipJointY, 0);
    hips.add(h);
    addMesh(h, limb(BODY.thigh.len, BODY.thigh.r0, BODY.thigh.r1, segments), skin);
    const k = new THREE.Group();
    k.position.y = -BODY.thigh.len;
    h.add(k);
    addMesh(k, limb(BODY.shin.len, BODY.shin.r0, BODY.shin.r1, segments), skin);
    const foot = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.6));
    foot.scale(0.036, 0.028, 0.082);
    foot.translate(0, BODY.footY, 0.026);
    addMesh(k, foot, skin);
    hip.push(h);
    knee.push(k);
  }

  // Torso turns at the waist; neck and head sit on it.
  const { pivot: torsoPivot, inner: torso } = pivotAt(hips, BODY.waistY);
  addMesh(torso, lathe(BODY.torso, segments + 16, BODY.depth), skin);
  const neckGeo = new THREE.CylinderGeometry(0.036, 0.044, 0.12, segments);
  neckGeo.translate(0, 1.385, 0);
  addMesh(torso, neckGeo, skin);
  const { pivot: neckPivot, inner: neckInner } = pivotAt(torso, BODY.neckY);
  const head = new THREE.Group();
  head.position.y = BODY.headY;
  head.scale.setScalar(BODY.headRadius / HEAD_UNIT);
  neckInner.add(head);

  // Arms: shoulder → elbow → hand.
  const shoulder: THREE.Group[] = [];
  const elbow: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const s = new THREE.Group();
    s.position.set(side * BODY.shoulder.x, BODY.shoulder.y, 0);
    torso.add(s);
    addMesh(s, limb(BODY.upperArm.len, BODY.upperArm.r0, BODY.upperArm.r1, segments), skin);
    const e = new THREE.Group();
    e.position.y = -BODY.upperArm.len;
    s.add(e);
    addMesh(e, limb(BODY.forearm.len, BODY.forearm.r0, BODY.forearm.r1, segments), skin);
    const hand = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.7));
    hand.scale(0.03, 0.044, 0.02);
    hand.translate(0, -BODY.forearm.len - 0.04, 0);
    addMesh(e, hand, skin);
    const thumb = new THREE.SphereGeometry(1, 16, 12);
    thumb.scale(0.011, 0.02, 0.011);
    thumb.translate(-side * 0.006, -BODY.forearm.len - 0.03, 0.018);
    addMesh(e, thumb, skin, false);
    shoulder.push(s);
    elbow.push(e);
  }

  const headTop = BODY.headY + BODY.headRadius * 1.02;
  const sole = BODY.hipJointY - BODY.thigh.len + BODY.footY - 0.028;
  return {
    root,
    hips,
    torso,
    torsoPivot,
    neckPivot,
    head,
    hair: new THREE.Group(),
    tail: null,
    eyes: [],
    shoulder: [shoulder[0]!, shoulder[1]!],
    elbow: [elbow[0]!, elbow[1]!],
    hip: [hip[0]!, hip[1]!],
    knee: [knee[0]!, knee[1]!],
    sway: [],
    modelHeight: headTop - sole,
  };
}
