import * as THREE from 'three';
import { AVATAR } from '../config/world';
import { wornItems } from '../wardrobe/unlocks';
import type { Appearance } from './appearance';
import { buildBody, type Rig } from './body';
import { dressAvatar } from './clothing';
import type { Detail } from './geometry';
import { buildHair } from './hair';
import { buildHead } from './head';

export interface Avatar {
  /** Feet at y = 0, facing +Z, AVATAR.height tall. Add it to the scene and turn it with rotation.y. */
  group: THREE.Group;
  rig: Rig;
  triangles: number;
  dispose: () => void;
}

/**
 * Builds the whole avatar from an appearance: body, face, hair and every worn
 * item. The same function serves the world ('medium') and the wardrobe ('high').
 */
export function buildAvatar(appearance: Appearance, detail: Detail = AVATAR.gameDetail): Avatar {
  const segments = detail === 'high' ? 40 : 24;
  const rig = buildBody(appearance.skin, segments);
  buildHead(rig, appearance, detail);
  buildHair(rig, appearance, detail);
  dressAvatar(rig, wornItems(appearance.outfit), detail);

  // Stand on the sole of the lowest foot (shoes add a little) and scale to AVATAR.height.
  const group = new THREE.Group();
  group.name = 'avatar';
  group.add(rig.root);
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root);
  rig.root.position.y = -box.min.y;
  group.scale.setScalar(AVATAR.height / rig.modelHeight);

  let triangles = 0;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    triangles += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });

  return {
    group,
    rig,
    triangles: Math.round(triangles),
    dispose: () =>
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
      }),
  };
}
