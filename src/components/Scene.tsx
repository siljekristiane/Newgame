import { useEffect, useState } from 'react';
import { ChunkManager } from '../world/ChunkManager';
import { WorkerPool } from '../world/workerPool';
import { Atmosphere } from './Atmosphere';
import { DebugProbe } from './DebugProbe';
import { FollowCamera } from './FollowCamera';
import { GameLoop } from './GameLoop';
import { Grass } from './Grass';
import { Player } from './Player';
import { Terrain } from './Terrain';
import { TerrainTextures } from './TerrainTextures';
import { Water } from './Water';
import { SpawnArea } from '../regions/spawn/SpawnArea';
import { Precipitation } from '../weather/Precipitation';

export function Scene() {
  // Created in an effect (not useMemo) so StrictMode's mount → unmount → mount
  // gets a fresh pool instead of a disposed one.
  const [systems, setSystems] = useState<{ pool: WorkerPool; manager: ChunkManager } | null>(null);
  useEffect(() => {
    const pool = new WorkerPool();
    const manager = new ChunkManager(pool);
    // Workers are an external resource: they must be created (and torn down) in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSystems({ pool, manager });
    return () => {
      manager.dispose();
      pool.dispose();
    };
  }, []);
  if (!systems) return null;
  const { pool, manager } = systems;

  return (
    <>
      <Atmosphere />
      <Water pool={pool} />
      <Terrain manager={manager} />
      <Grass pool={pool} />
      <SpawnArea />
      <Precipitation />
      <TerrainTextures pool={pool} />
      <Player />
      <GameLoop manager={manager} pool={pool} />
      <FollowCamera />
      <DebugProbe manager={manager} />
    </>
  );
}
