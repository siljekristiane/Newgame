import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE, GRASS, LOD_LEVELS } from '../config/world';
import { createGrassMaterial, createTuftGeometry, grassUniforms } from '../materials/grassMaterial';
import { origin, player } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { GRASS_PATCH_CHUNKS, type GrassPatch } from '../world/grass';
import { worldToChunk } from '../world/chunkMath';
import type { WorkerPool } from '../world/workerPool';

const GRID = Math.ceil((GRASS.radius * 2) / GRASS.cell);

/**
 * Grass tufts within GRASS.radius of the player: one instanced draw call whose
 * instances are placed by the shader (materials/grassMaterial.ts). A worker
 * builds the ground patch (heights, grass colour and density) for the player's
 * chunk and its neighbours; it is rebuilt when the player changes chunk.
 */
export function Grass({ pool }: { pool: WorkerPool }) {
  const vegetation = useGameStore((s) => s.vegetation);

  const { mesh, state } = useMemo(() => {
    const tuft = createTuftGeometry();
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', tuft.getAttribute('position'));
    geometry.setAttribute('color', tuft.getAttribute('color'));
    geometry.setAttribute('normal', tuft.getAttribute('normal'));
    geometry.instanceCount = GRID * GRID;
    const mesh = new THREE.Mesh(geometry, createGrassMaterial());
    mesh.frustumCulled = false; // placed in the shader; the patch is always around the camera
    mesh.receiveShadow = true;
    mesh.visible = false;
    const state = {
      patch: null as GrassPatch | null,
      heights: null as THREE.DataTexture | null,
      ground: null as THREE.DataTexture | null,
      mask: null as THREE.DataTexture | null,
      wantKey: '',
      pending: false,
      disposed: false,
    };
    return { mesh, state };
  }, []);

  useEffect(
    () => () => {
      state.disposed = true;
      state.heights?.dispose();
      state.ground?.dispose();
      state.mask?.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh, state],
  );

  useFrame(() => {
    const { cx, cz } = worldToChunk(player.x, player.z);
    const key = `${cx},${cz}`;
    if (vegetation && !state.pending && state.wantKey !== key) {
      state.pending = true;
      state.wantKey = key;
      pool
        .buildGrassPatch(cx, cz)
        .then((patch) => {
          if (state.disposed) return;
          const heights = new THREE.DataTexture(patch.heights as Float32Array<ArrayBuffer>, patch.side, patch.side, THREE.RedFormat, THREE.FloatType);
          heights.needsUpdate = true;
          const ground = new THREE.DataTexture(patch.ground as Uint8Array<ArrayBuffer>, patch.side, patch.side);
          ground.magFilter = ground.minFilter = THREE.LinearFilter;
          // Palette colours are sRGB; the GPU converts them to linear on sampling (alpha stays linear).
          ground.colorSpace = THREE.SRGBColorSpace;
          ground.needsUpdate = true;
          const mask = new THREE.DataTexture(patch.mask as Uint8Array<ArrayBuffer>, patch.maskSize, patch.maskSize, THREE.RedFormat);
          mask.magFilter = mask.minFilter = THREE.LinearFilter;
          mask.needsUpdate = true;
          state.heights?.dispose();
          state.ground?.dispose();
          state.mask?.dispose();
          Object.assign(state, { patch, heights, ground, mask });
          grassUniforms.uMask.value = mask;
          grassUniforms.uPatchSize.value = GRASS_PATCH_CHUNKS * CHUNK_SIZE;
          grassUniforms.uHeights.value = heights;
          grassUniforms.uGround.value = ground;
          grassUniforms.uPatchSide.value = patch.side;
        })
        .catch((err: unknown) => console.warn('[grass] patch failed', err))
        .finally(() => {
          state.pending = false;
        });
    }

    // Only draw while the patch covers the grass square around the player.
    const p = state.patch;
    const x0 = p ? p.cx0 * CHUNK_SIZE : 0;
    const z0 = p ? p.cz0 * CHUNK_SIZE : 0;
    const size = GRASS_PATCH_CHUNKS * CHUNK_SIZE;
    const covered =
      !!p &&
      player.x - GRASS.radius > x0 &&
      player.x + GRASS.radius < x0 + size &&
      player.z - GRASS.radius > z0 &&
      player.z + GRASS.radius < z0 + size;
    mesh.visible = vegetation && covered;
    if (!mesh.visible) return;

    const baseX = Math.floor(player.x / GRASS.cell) - Math.floor(GRID / 2);
    const baseZ = Math.floor(player.z / GRASS.cell) - Math.floor(GRID / 2);
    grassUniforms.uCellBase.value.set(baseX, baseZ);
    grassUniforms.uCellBaseRender.value.set(baseX * GRASS.cell - origin.x, baseZ * GRASS.cell - origin.z);
    grassUniforms.uGrid.value = GRID;
    grassUniforms.uPatchOrigin.value.set(x0 - origin.x, z0 - origin.z);
    grassUniforms.uGridStep.value = CHUNK_SIZE / LOD_LEVELS[0].segments;
    grassUniforms.uPlayerR.value.set(player.x - origin.x, player.z - origin.z);
  });

  return <primitive object={mesh} />;
}
