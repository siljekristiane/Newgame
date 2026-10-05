import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TERRAIN_SHADOW } from '../../config/world';
import { addTerrainShadow, type FixedHorizon } from '../../materials/terrainShadow';
import { origin } from '../../state/runtime';
import { horizonAt } from '../../world/horizon';
import { heightAt } from '../../world/terrain';
import { createGiantGeometry } from './giantGeometry';
import { GIANT_TREES } from './layout';

/** Ground under a giant: the lowest point around its foot, so no root hangs in the air on any LOD. */
function footHeight(x: number, z: number): number {
  let low = heightAt(x, z);
  for (let a = 0; a < 8; a++) low = Math.min(low, heightAt(x + Math.cos(a * 0.785) * 4, z + Math.sin(a * 0.785) * 4));
  return low - 0.3;
}

/**
 * The five giant trees (regions/giants). Built once; each stands in a group
 * at its world position minus the floating origin. Drawn out to the fog, so
 * they rise over the land as landmarks. Each has its own material, so it gets
 * mountain and cloud shadow from the horizon at its own foot.
 */
export function GiantTrees() {
  const group = useRef<THREE.Group>(null);

  const trees = useMemo(
    () =>
      GIANT_TREES.map((tree) => {
        const bytes = new Uint8Array(TERRAIN_SHADOW.directions);
        horizonAt(tree.x, tree.z, bytes);
        const horizon: FixedHorizon = {
          a: { value: new THREE.Vector4(bytes[0]! / 255, bytes[1]! / 255, bytes[2]! / 255, bytes[3]! / 255) },
          b: { value: new THREE.Vector4(bytes[4]! / 255, bytes[5]! / 255, bytes[6]! / 255, bytes[7]! / 255) },
        };
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
        material.onBeforeCompile = (shader) => addTerrainShadow(shader, 'fixed', horizon);
        material.customProgramCacheKey = () => 'dw-giant';
        const meshes = createGiantGeometry(tree.kind).map((g) => {
          const mesh = new THREE.Mesh(g, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
        });
        const node = new THREE.Group();
        node.name = `giant-${tree.id}`;
        node.add(...meshes);
        return { tree, node, material, meshes, y: footHeight(tree.x, tree.z) };
      }),
    [],
  );

  useEffect(
    () => () =>
      trees.forEach((t) => {
        t.meshes.forEach((m) => m.geometry.dispose());
        t.material.dispose();
      }),
    [trees],
  );

  useFrame(() => {
    for (const t of trees) t.node.position.set(t.tree.x - origin.x, t.y, t.tree.z - origin.z);
  });

  return (
    <group ref={group}>
      {trees.map((t) => (
        <primitive key={t.tree.id} object={t.node} />
      ))}
    </group>
  );
}
