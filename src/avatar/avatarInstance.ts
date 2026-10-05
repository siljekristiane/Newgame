import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { AVATAR } from '../config/world';
import { animateAvatar, createAnimState, type MotionInput } from './animate';
import type { Appearance } from './appearance';
import { buildAvatar } from './buildAvatar';
import type { Detail } from './geometry';
import { BODY_MODELS, type GlbBody } from './models';
import { animateSkinned, createSkinnedRig } from './skinnedAnimator';

/**
 * What the game needs from an avatar, whatever it is built from. Player,
 * the wardrobe preview and anything later (NPCs, other players) only talk to
 * this, so a new kind of body is one new factory below.
 */
export interface AvatarInstance {
  /** Feet at y = 0, facing +Z, AVATAR.height tall. */
  group: THREE.Group;
  triangles: number;
  /** Which body it is (models.ts). */
  body: keyof typeof BODY_MODELS;
  /** One animation frame. */
  update: (dt: number, motion: MotionInput) => void;
  dispose: () => void;
}

/** Builds the avatar for a look. Procedural bodies are ready at once; .glb bodies load first. */
export async function createAvatar(appearance: Appearance, detail: Detail, seed = 0): Promise<AvatarInstance> {
  const model = BODY_MODELS[appearance.body];
  if (model.kind === 'glb') {
    try {
      return await glbAvatar(appearance.body, model, seed);
    } catch (err) {
      console.warn(`Avatar model "${appearance.body}" could not be loaded, using the procedural figure`, err);
    }
  }
  return proceduralAvatar(appearance, detail, seed);
}

export function proceduralAvatar(appearance: Appearance, detail: Detail, seed = 0): AvatarInstance {
  const av = buildAvatar(appearance, detail);
  const anim = createAnimState(seed);
  return {
    group: av.group,
    triangles: av.triangles,
    body: 'procedural',
    update: (dt, m) => animateAvatar(av.rig, anim, dt, m),
    dispose: av.dispose,
  };
}

const gltfCache = new Map<string, Promise<GLTF>>();

/** Loads a .glb once; every avatar using it gets its own clone (shared geometry and textures). */
function loadGltf(file: string): Promise<GLTF> {
  let p = gltfCache.get(file);
  if (!p) {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    p = new GLTFLoader().loadAsync(base + file);
    p.catch(() => gltfCache.delete(file));
    gltfCache.set(file, p);
  }
  return p;
}

async function glbAvatar(body: keyof typeof BODY_MODELS, model: GlbBody, seed: number): Promise<AvatarInstance> {
  const gltf = await loadGltf(model.file);
  const scene = cloneSkinned(gltf.scene);
  return fromRiggedScene(scene, body, model, seed);
}

/**
 * Wraps a rigged scene (already loaded/cloned) as an avatar: scaled to
 * AVATAR.height with the feet on the ground, shadows on, animated by role.
 * Exported for tests, which build a small rig in code.
 */
export function fromRiggedScene(scene: THREE.Object3D, body: keyof typeof BODY_MODELS, model: GlbBody, seed = 0): AvatarInstance {
  let triangles = 0;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned bounds follow the bind pose, not the animation.
    mesh.frustumCulled = false;
    const g = mesh.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });

  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const h = Math.max(1e-3, box.max.y - box.min.y);
  const inner = new THREE.Group();
  inner.add(scene);
  scene.position.y = -box.min.y;
  inner.scale.setScalar(AVATAR.height / h);
  const group = new THREE.Group();
  group.name = `avatar:${body}`;
  group.add(inner);

  const rig = createSkinnedRig(scene, model.bones, model.armRest);
  const anim = createAnimState(seed);
  return {
    group,
    triangles: Math.round(triangles),
    body,
    update: (dt, m) => animateSkinned(rig, anim, dt, m),
    // Geometry, materials and textures are shared with the cached file.
    dispose: () => group.removeFromParent(),
  };
}
