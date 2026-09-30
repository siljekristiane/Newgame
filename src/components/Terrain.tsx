import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE, LOD_LEVELS } from '../config/world';
import { world } from '../design/tokens';
import { TERRAIN_TEXTURE } from '../config/world';
import { createPropMaterial, createTerrainMaterial, morphEnabled, morphPlayer, terrainDetail } from '../materials/terrainMaterials';
import { useGameStore } from '../state/useGameStore';
import { origin, player } from '../state/runtime';
import { PROP_STRIDE } from '../world/buildChunk';
import type { ChunkManager, LoadedChunk } from '../world/ChunkManager';

interface LodMaterials {
  terrain: THREE.Material;
  /** Same without detail textures: switching textures off must cost nothing. */
  terrainPlain: THREE.Material;
  cube: THREE.Material;
  sphere: THREE.Material;
}

/**
 * Renders every loaded chunk. Chunks sit at their world position inside a
 * group that is shifted by -origin each frame, so what reaches the GPU is
 * always (world - origin): small, precise numbers.
 */
export function Terrain({ manager }: { manager: ChunkManager }) {
  useSyncExternalStore(manager.subscribe, manager.getVersion);
  const group = useRef<THREE.Group>(null);
  // One material set per LOD: they differ only in their morph range.
  const materials = useMemo<LodMaterials[]>(
    () =>
      LOD_LEVELS.map((_, lod) => ({
        terrain: createTerrainMaterial(lod),
        terrainPlain: createTerrainMaterial(lod, false),
        cube: createPropMaterial(world.stone, lod),
        sphere: createPropMaterial(world.canopy, lod),
      })),
    [],
  );
  useEffect(
    () => () =>
      materials.forEach((m) => {
        m.terrain.dispose();
        m.terrainPlain.dispose();
        m.cube.dispose();
        m.sphere.dispose();
      }),
    [materials],
  );

  const geomorph = useGameStore((s) => s.geomorph);
  const detail = useGameStore((s) => s.detailReady && s.detailOn);
  useFrame(() => {
    group.current?.position.set(-origin.x, 0, -origin.z);
    morphPlayer.value.set(player.x - origin.x, player.z - origin.z);
    morphEnabled.value = geomorph ? 1 : 0;
    terrainDetail.on.value = detail ? 1 : 0;
    // World-space UVs without big numbers: the offset repeats every uvWrap meters.
    terrainDetail.uvOffset.value.set(origin.x % TERRAIN_TEXTURE.uvWrap, origin.z % TERRAIN_TEXTURE.uvWrap);
  });

  const chunks = Array.from(manager.chunks.values());
  return (
    <group ref={group}>
      {chunks.map((chunk) => (
        <Chunk key={chunk.key} chunk={chunk} geometry={chunk.geometry} materials={materials[chunk.lod]!} detail={detail} />
      ))}
    </group>
  );
}

const Chunk = memo(function Chunk({
  chunk,
  geometry,
  materials,
  detail,
}: {
  chunk: LoadedChunk;
  geometry: THREE.BufferGeometry;
  materials: LodMaterials;
  detail: boolean;
}) {
  return (
    <group position={[chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE]}>
      <mesh geometry={geometry} material={detail ? materials.terrain : materials.terrainPlain} matrixAutoUpdate={false} userData={{ terrain: true }} receiveShadow />
      {chunk.props.length > 0 && <ChunkProps props={chunk.props} materials={materials} />}
    </group>
  );
});

const cubeBase = new THREE.BoxGeometry(1, 1, 1);
const sphereBase = new THREE.IcosahedronGeometry(0.5, 1);

/** Placeholder objects (cubes and spheres) as two instanced draw calls per chunk. */
function ChunkProps({ props, materials }: { props: Float32Array; materials: LodMaterials }) {
  const count = props.length / PROP_STRIDE;
  // Per-chunk copies of the tiny base geometries, because the morph delta is a
  // per-instance attribute stored on the geometry.
  const { cubes, spheres } = useMemo(() => {
    const m = new THREE.Matrix4();
    const cubeM: number[] = [];
    const sphereM: number[] = [];
    const cubeD: number[] = [];
    const sphereD: number[] = [];
    for (let i = 0; i < count; i++) {
      const o = i * PROP_STRIDE;
      const [x, y, z, size, kind, morphY] = [props[o]!, props[o + 1]!, props[o + 2]!, props[o + 3]!, props[o + 4]!, props[o + 5]!];
      if (kind === 0) {
        m.makeScale(size, size * 1.6, size).setPosition(x, y + size * 0.7, z);
        cubeM.push(...m.elements);
        cubeD.push(morphY - y);
      } else {
        m.makeScale(size * 1.6, size * 1.6, size * 1.6).setPosition(x, y + size * 1.2, z);
        sphereM.push(...m.elements);
        sphereD.push(morphY - y);
      }
    }
    const build = (base: THREE.BufferGeometry, matrices: number[], deltas: number[]) => {
      const geometry = base.clone();
      geometry.setAttribute('aMorphDelta', new THREE.InstancedBufferAttribute(new Float32Array(deltas), 1));
      return { geometry, matrices: new Float32Array(matrices), n: deltas.length };
    };
    return { cubes: build(cubeBase, cubeM, cubeD), spheres: build(sphereBase, sphereM, sphereD) };
  }, [props, count]);

  useEffect(
    () => () => {
      cubes.geometry.dispose();
      spheres.geometry.dispose();
    },
    [cubes, spheres],
  );

  return (
    <>
      <Instances data={cubes} material={materials.cube} />
      <Instances data={spheres} material={materials.sphere} />
    </>
  );
}

function Instances({ data, material }: { data: { geometry: THREE.BufferGeometry; matrices: Float32Array; n: number }; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(data.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = data.n;
    mesh.computeBoundingSphere();
  }, [data]);
  if (data.n === 0) return null;
  return <instancedMesh ref={ref} args={[data.geometry, material, data.n]} castShadow receiveShadow />;
}
