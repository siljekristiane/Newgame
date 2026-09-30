import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { TERRAIN_TEXTURE } from '../config/world';
import { applyTerrainTextures } from '../materials/terrainMaterials';
import { useGameStore } from '../state/useGameStore';
import type { WorkerPool } from '../world/workerPool';

/**
 * Generates the terrain detail textures in a worker (~1 s) and uploads them.
 * Until then the terrain shows its biome colours only, so nothing waits on it.
 */
export function TerrainTextures({ pool }: { pool: WorkerPool }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    pool
      .buildTerrainTextures(TERRAIN_TEXTURE.size)
      .then((set) => {
        if (cancelled) return;
        dispose = applyTerrainTextures(set, gl.capabilities.getMaxAnisotropy());
        useGameStore.getState().setDetailReady(true);
      })
      .catch((err: unknown) => console.warn('[terrain] detail textures failed; biome colours only', err));
    return () => {
      cancelled = true;
      dispose?.();
      useGameStore.getState().setDetailReady(false);
    };
  }, [pool, gl]);
  return null;
}
