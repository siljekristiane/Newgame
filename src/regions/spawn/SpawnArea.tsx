import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { origin } from '../../state/runtime';
import { spawnLayout } from './layout';
import { buildPathGeometry, buildPlazaGeometry, createGroundMaterial } from './meshes';
import { gravelTexture, pavingTexture } from './textures';

/**
 * The spawn area (step 6): paved plaza and gravel paths on the terrain.
 * Everything is built relative to the plaza centre; the group sits at
 * plaza − origin, so the GPU only sees small numbers.
 */
export function SpawnArea() {
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);
  const layout = spawnLayout();

  const parts = useMemo(() => {
    const { plaza, paths } = layout;
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    return {
      gravel: createGroundMaterial('gravel', gravelTexture(), 2, anisotropy),
      paving: createGroundMaterial('paving', pavingTexture(), 4, anisotropy),
      paths: paths.map((p) => buildPathGeometry(p, plaza.x, plaza.z)),
      plaza: buildPlazaGeometry(plaza, plaza.x, plaza.z),
    };
  }, [layout, gl]);

  useEffect(
    () => () => {
      for (const m of [parts.gravel, parts.paving]) {
        (m.userData.textures as THREE.Texture[]).forEach((t) => t.dispose());
        m.dispose();
      }
      parts.paths.forEach((g) => g.dispose());
      parts.plaza.dispose();
    },
    [parts],
  );

  useFrame(() => group.current?.position.set(layout.plaza.x - origin.x, 0, layout.plaza.z - origin.z));

  return (
    <group ref={group}>
      {parts.paths.map((g, i) => (
        <mesh key={i} geometry={g} material={parts.gravel} receiveShadow renderOrder={1} />
      ))}
      <mesh geometry={parts.plaza} material={parts.paving} receiveShadow renderOrder={2} />
    </group>
  );
}
