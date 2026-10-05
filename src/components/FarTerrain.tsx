import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FAR_TERRAIN, WORLD_SIZE } from '../config/world';
import { origin, player } from '../state/runtime';
import { wantedFarTiles } from '../world/farTerrain';
import { addTerrainShadow } from '../materials/terrainShadow';
import type { ChunkManager } from '../world/ChunkManager';
import type { WorkerPool } from '../world/workerPool';

const TILES_PER_SIDE = WORLD_SIZE / FAR_TERRAIN.tileSize;

/**
 * The far ring: coarse 4 km terrain tiles from the edge of the streamed chunks
 * out to the horizon (~30 km), so distant mountains show through the haze.
 * Tiles are built in the workers when the player enters a new tile (once the
 * chunks near the player are in, so they never wait behind the horizon) and kept in
 * a group shifted by −origin, like the chunks. The shader hides the ring inside
 * FAR_TERRAIN.innerRadius and sinks it a little, so the finer chunks always win
 * where both exist.
 */
export function FarTerrain({ pool, manager }: { pool: WorkerPool; manager: ChunkManager }) {
  const group = useRef<THREE.Group>(null);

  const { material, playerR, state } = useMemo(() => {
    const playerR = { value: new THREE.Vector2() };
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPlayerR = playerR;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vDwXZ;\nvoid main() {')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y -= ${FAR_TERRAIN.sink.toFixed(1)};`)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDwXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec2 uPlayerR;\nvarying vec2 vDwXZ;\nvoid main() {')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (distance(vDwXZ, uPlayerR) < ${FAR_TERRAIN.innerRadius.toFixed(1)}) discard;`);
      addTerrainShadow(shader);
    };
    material.customProgramCacheKey = () => 'dw-far-terrain';
    const state = { tiles: new Map<string, THREE.Mesh>(), pending: new Set<string>(), centre: '', disposed: false };
    return { material, playerR, state };
  }, []);

  useEffect(
    () => () => {
      state.disposed = true;
      state.tiles.forEach((m) => m.geometry.dispose());
      state.tiles.clear();
      material.dispose();
    },
    [material, state],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(-origin.x, 0, -origin.z);
    playerR.value.set(player.x - origin.x, player.z - origin.z);

    const ptx = Math.floor(player.x / FAR_TERRAIN.tileSize);
    const ptz = Math.floor(player.z / FAR_TERRAIN.tileSize);
    const centre = `${ptx},${ptz}`;
    // The chunks around the player come first: start on the horizon once they are in.
    if (centre === state.centre || manager.stats().pending > 0) return;
    state.centre = centre;

    const wanted = new Set<string>();
    for (const { tx, tz } of wantedFarTiles(ptx, ptz, TILES_PER_SIDE)) {
      const key = `${tx},${tz}`;
      wanted.add(key);
      if (state.tiles.has(key) || state.pending.has(key)) continue;
      state.pending.add(key);
      pool
        .buildFarTile(tx, tz)
        .then((tile) => {
          state.pending.delete(key);
          if (state.disposed) return;
          // Still wanted? (The player may have moved on while it was building.)
          const ntx = Math.floor(player.x / FAR_TERRAIN.tileSize);
          const ntz = Math.floor(player.z / FAR_TERRAIN.tileSize);
          if (Math.max(Math.abs(tx - ntx), Math.abs(tz - ntz)) > FAR_TERRAIN.rings) return;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(tile.positions, 3));
          geometry.setAttribute('normal', new THREE.BufferAttribute(tile.normals, 3));
          geometry.setAttribute('color', new THREE.BufferAttribute(tile.colors, 3));
          geometry.setAttribute('horizonA', new THREE.BufferAttribute(tile.horizonA, 4, true));
          geometry.setAttribute('horizonB', new THREE.BufferAttribute(tile.horizonB, 4, true));
          geometry.setIndex(new THREE.BufferAttribute(tile.indices, 1));
          geometry.computeBoundingSphere();
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(tx * FAR_TERRAIN.tileSize, 0, tz * FAR_TERRAIN.tileSize);
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          state.tiles.set(key, mesh);
          group.current?.add(mesh);
        })
        .catch(() => state.pending.delete(key));
    }
    for (const [key, mesh] of state.tiles) {
      if (wanted.has(key)) continue;
      g.remove(mesh);
      mesh.geometry.dispose();
      state.tiles.delete(key);
    }
  });

  return <group ref={group} />;
}
