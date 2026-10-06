import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AVATAR } from '../config/world';
import { createAnimState } from './animate';
import { DEFAULT_APPEARANCE, sanitizeAppearance, type Appearance } from './appearance';
import { fromRiggedScene } from './avatarInstance';
import { HUMANOID_BONES, IDENTITY_BONE_MAP } from './humanoid';
import { BODY_IDS, BODY_MODELS, type GlbBody } from './models';
import { animateSkinned, createSkinnedRig } from './skinnedAnimator';

const credits = readFileSync(new URL('../../CREDITS.md', import.meta.url), 'utf8');

/** Reads the JSON chunk of a .glb (no three.js loader needed in Node). */
function glbJson(file: string): { nodes?: Array<{ name?: string }>; skins?: unknown[] } {
  const buf = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as { nodes?: Array<{ name?: string }>; skins?: unknown[] };
}

describe('body models', () => {
  it('every .glb body exists, is credited, is skinned and has the bones its map names', () => {
    for (const id of BODY_IDS) {
      const m = BODY_MODELS[id];
      if (m.kind !== 'glb') continue;
      expect(existsSync(new URL(`../../public/${m.file}`, import.meta.url)), m.file).toBe(true);
      expect(credits.includes(m.file.split('/').pop()!), `${m.file} in CREDITS.md`).toBe(true);
      const json = glbJson(m.file);
      expect(json.skins?.length ?? 0, m.file).toBeGreaterThan(0);
      const names = new Set((json.nodes ?? []).map((n) => n.name));
      for (const bone of Object.values(m.bones)) expect(names.has(bone), `${m.file}: ${bone}`).toBe(true);
    }
  });

  it('old saves without a body get the default body', () => {
    const old: Partial<Appearance> = { ...DEFAULT_APPEARANCE };
    delete old.body;
    expect(sanitizeAppearance({ ...old }).body).toBe(DEFAULT_APPEARANCE.body);
    expect(sanitizeAppearance({ ...old, body: 'procedural' }).body).toBe('procedural');
    expect(sanitizeAppearance({ ...old, body: 'dragon' }).body).toBe(DEFAULT_APPEARANCE.body);
  });
});

/** A small A-pose humanoid with a skinned box per bone, built in code. */
function testRig(): THREE.Group {
  const pos: Record<string, [number, number, number]> = {
    hips: [0, 0.95, 0], spine: [0, 1.05, 0], chest: [0, 1.2, 0], neck: [0, 1.38, 0], head: [0, 1.46, 0],
    upperArmL: [0.17, 1.31, 0], foreArmL: [0.32, 1.1, 0], handL: [0.45, 0.92, 0],
    upperArmR: [-0.17, 1.31, 0], foreArmR: [-0.32, 1.1, 0], handR: [-0.45, 0.92, 0],
    thighL: [0.09, 0.88, 0], shinL: [0.1, 0.47, 0], footL: [0.1, 0.08, 0],
    thighR: [-0.09, 0.88, 0], shinR: [-0.1, 0.47, 0], footR: [-0.1, 0.08, 0],
  };
  const parent: Record<string, string> = {
    spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
    upperArmL: 'chest', foreArmL: 'upperArmL', handL: 'foreArmL', upperArmR: 'chest', foreArmR: 'upperArmR', handR: 'foreArmR',
    thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
  };
  const bones = new Map<string, THREE.Bone>();
  for (const name of HUMANOID_BONES) {
    const b = new THREE.Bone();
    b.name = name;
    bones.set(name, b);
  }
  for (const name of HUMANOID_BONES) {
    const b = bones.get(name)!;
    const p = pos[name]!;
    const par = parent[name];
    if (par) {
      const pp = pos[par]!;
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      bones.get(par)!.add(b);
    } else b.position.set(...p);
  }
  const list = [...bones.values()];
  const geo = new THREE.BoxGeometry(0.5, 1.65, 0.3, 2, 8, 2);
  geo.translate(0, 0.825, 0);
  const n = geo.attributes.position!.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) wt[i * 4] = 1; // all on the hips
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wt, 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(bones.get('hips')!, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  return root;
}

describe('skinned animation', () => {
  const model: GlbBody = { kind: 'glb', name: 'Test', file: '', bones: IDENTITY_BONE_MAP, armRest: 0.12, dressable: false };

  it('scales a rigged model to AVATAR.height with the feet on the ground', () => {
    const av = fromRiggedScene(testRig(), 'elf', model);
    av.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(av.group);
    expect(Math.abs(box.min.y)).toBeLessThan(0.01);
    expect(box.max.y).toBeGreaterThan(AVATAR.height * 0.97);
    expect(box.max.y).toBeLessThan(AVATAR.height * 1.03);
  });

  it('lowers the arms from the rest pose and swings the legs when walking', () => {
    const root = testRig();
    const rig = createSkinnedRig(root, IDENTITY_BONE_MAP, 0.12);
    const s = createAnimState(1);
    const world = (name: string) => {
      root.updateMatrixWorld(true);
      return new THREE.Vector3().setFromMatrixPosition(root.getObjectByName(name)!.matrixWorld);
    };
    animateSkinned(rig, s, 1 / 60, { speed: 0, air: 0 });
    const arm = world('foreArmL').sub(world('upperArmL')).normalize();
    expect(Math.acos(-arm.y)).toBeLessThan(0.2); // close to straight down (was ~0.62 rad out)
    expect(arm.x).toBeGreaterThan(0); // still on its own side

    let maxSwing = 0;
    for (let i = 0; i < 90; i++) {
      animateSkinned(rig, s, 1 / 60, { speed: 4, air: 0 });
      maxSwing = Math.max(maxSwing, Math.abs(world('shinL').z - world('thighL').z));
    }
    expect(maxSwing).toBeGreaterThan(0.08);
    for (const [speed, air] of [[30, 0], [400, 0], [3, 0.6]] as const) {
      for (let i = 0; i < 30; i++) animateSkinned(rig, s, 1 / 60, { speed, air });
      expect(Number.isFinite(world('handR').y)).toBe(true);
    }
  });

  it('walks with each arm swinging against the leg on its side, and leans into a run and the glide', () => {
    const root = testRig();
    const rig = createSkinnedRig(root, IDENTITY_BONE_MAP, 0.12);
    const s = createAnimState(1);
    const world = (name: string) => {
      root.updateMatrixWorld(true);
      return new THREE.Vector3().setFromMatrixPosition(root.getObjectByName(name)!.matrixWorld);
    };
    animateSkinned(rig, s, 1 / 60, { speed: 0, air: 0 });
    const arm0 = world('handL').z - world('upperArmL').z;
    let c = 0;
    let ll = 0;
    let aa = 0;
    for (let i = 0; i < 300; i++) {
      animateSkinned(rig, s, 1 / 120, { speed: 4, air: 0 });
      const leg = world('footL').z - world('thighL').z;
      const arm = world('handL').z - world('upperArmL').z - arm0;
      c += leg * arm;
      ll += leg * leg;
      aa += arm * arm;
    }
    expect(c / Math.sqrt(ll * aa)).toBeLessThan(-0.5);
    for (const speed of [14, 150]) {
      for (let i = 0; i < 60; i++) animateSkinned(rig, s, 1 / 30, { speed, air: 0 });
      expect(world('head').z - world('hips').z, `speed ${speed}`).toBeGreaterThan(0.02);
    }
  });
});
