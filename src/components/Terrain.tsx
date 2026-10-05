import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE, LOD_LEVELS } from '../config/world';
import { TERRAIN_TEXTURE } from '../config/world';
import { createPlantMaterial, plantWind } from '../materials/plantMaterial';
import { createTerrainMaterial, morphEnabled, morphPlayer, morphRange, terrainDetail } from '../materials/terrainMaterials';
import { createPlantGeometry } from '../vegetation/plantGeometry';
import { PLANT_KINDS } from '../world/vegetation';
import { ChunkPlants } from './ChunkPlants';
import { useGameStore } from '../state/useGameStore';
import { origin, player, weather } from '../state/runtime';
import type { ChunkManager, LoadedChunk } from '../world/ChunkManager';

interface LodMaterials {
  terrain: THREE.Material;
  /** Same without detail textures: switching textures off must cost nothing. */
  terrainPlain: THREE.Material;
  plants: THREE.Material;
  /** Shared plant meshes, one per kind (PLANT_KINDS order); finer at LOD 0. */
  plantGeometries: THREE.BufferGeometry[];
  /** Distance where this LOD is fully morphed into the next (plants that fade are gone). */
  morphEnd: number;
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
        plants: createPlantMaterial(lod),
        plantGeometries: PLANT_KINDS.map((kind) => createPlantGeometry(kind, lod === 0 ? 1 : 0)),
        morphEnd: morphRange(lod).y,
      })),
    [],
  );
  useEffect(
    () => () =>
      materials.forEach((m) => {
        m.terrain.dispose();
        m.terrainPlain.dispose();
        m.plants.dispose();
        m.plantGeometries.forEach((g) => g.dispose());
      }),
    [materials],
  );

  const geomorph = useGameStore((s) => s.geomorph);
  const detail = useGameStore((s) => s.detailReady && s.detailOn);
  const vegetation = useGameStore((s) => s.vegetation);
  useFrame((_, dt) => {
    plantWind.time.value += Math.min(dt, 0.1);
    plantWind.originMod.value.set(origin.x % 1000, origin.z % 1000);
    plantWind.strength.value = 0.4 + Math.hypot(weather.windX, weather.windZ) / 5;
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
        <Chunk key={chunk.key} chunk={chunk} geometry={chunk.geometry} materials={materials[chunk.lod]!} farPlants={chunk.lod === 0 ? materials[1]!.plantGeometries : undefined} detail={detail} vegetation={vegetation} />
      ))}
    </group>
  );
}

const Chunk = memo(function Chunk({
  chunk,
  geometry,
  materials,
  farPlants,
  detail,
  vegetation,
}: {
  chunk: LoadedChunk;
  geometry: THREE.BufferGeometry;
  materials: LodMaterials;
  /** LOD 1's plant meshes, for the far part of the LOD 0 ring. */
  farPlants?: THREE.BufferGeometry[];
  detail: boolean;
  vegetation: boolean;
}) {
  return (
    <group position={[chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE]}>
      <mesh geometry={geometry} material={detail ? materials.terrain : materials.terrainPlain} matrixAutoUpdate={false} userData={{ terrain: true }} receiveShadow />
      {vegetation && chunk.props.length > 0 && (
        <ChunkPlants plants={chunk.props} bases={materials.plantGeometries} farBases={farPlants} material={materials.plants} cx={chunk.cx} cz={chunk.cz} morphEnd={materials.morphEnd} />
      )}
    </group>
  );
});
