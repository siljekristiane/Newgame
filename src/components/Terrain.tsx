import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../config/world';
import { world } from '../design/tokens';
import { origin } from '../state/runtime';
import type { ChunkManager, LoadedChunk } from '../world/ChunkManager';

/**
 * Renders every loaded chunk. Chunks sit at their world position inside a
 * group that is shifted by -origin each frame, so what reaches the GPU is
 * always (world - origin): small, precise numbers.
 */
export function Terrain({ manager }: { manager: ChunkManager }) {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    group.current?.position.set(-origin.x, 0, -origin.z);
  });

  const chunks = Array.from(manager.chunks.values());
  return (
    <group ref={group}>
      {chunks.map((chunk) => (
        <Chunk key={chunk.key} chunk={chunk} geometry={chunk.geometry} material={material} />
      ))}
    </group>
  );
}

const Chunk = memo(function Chunk({ chunk, geometry, material }: { chunk: LoadedChunk; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  return (
    <group position={[chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE]}>
      <mesh geometry={geometry} material={material} matrixAutoUpdate={false} />
      {chunk.props.length > 0 && <ChunkProps props={chunk.props} />}
    </group>
  );
});

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.IcosahedronGeometry(0.5, 1);
const cubeMaterial = new THREE.MeshLambertMaterial({ color: world.stone, flatShading: true });
const sphereMaterial = new THREE.MeshLambertMaterial({ color: world.canopy, flatShading: true });

/** Placeholder objects (cubes and spheres) as two instanced draw calls per chunk. */
function ChunkProps({ props }: { props: Float32Array }) {
  const cubes = useRef<THREE.InstancedMesh>(null);
  const spheres = useRef<THREE.InstancedMesh>(null);
  const count = props.length / 5;

  useEffect(() => {
    const m = new THREE.Matrix4();
    let nc = 0;
    let ns = 0;
    for (let i = 0; i < count; i++) {
      const x = props[i * 5]!;
      const y = props[i * 5 + 1]!;
      const z = props[i * 5 + 2]!;
      const size = props[i * 5 + 3]!;
      if (props[i * 5 + 4] === 0) {
        m.makeScale(size, size * 1.6, size).setPosition(x, y + size * 0.7, z);
        cubes.current?.setMatrixAt(nc++, m);
      } else {
        m.makeScale(size * 1.6, size * 1.6, size * 1.6).setPosition(x, y + size * 1.2, z);
        spheres.current?.setMatrixAt(ns++, m);
      }
    }
    for (const [mesh, n] of [[cubes.current, nc], [spheres.current, ns]] as const) {
      if (!mesh) continue;
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [props, count]);

  return (
    <>
      <instancedMesh ref={cubes} args={[cubeGeometry, cubeMaterial, count]} />
      <instancedMesh ref={spheres} args={[sphereGeometry, sphereMaterial, count]} />
    </>
  );
}
