import { useEffect, useState } from 'react';
import { CAMERA } from '../config/world';
import { world } from '../design/tokens';
import { ChunkManager } from '../world/ChunkManager';
import { WorkerPool } from '../world/workerPool';
import { FollowCamera } from './FollowCamera';
import { GameLoop } from './GameLoop';
import { Player } from './Player';
import { Sky } from './Sky';
import { Terrain } from './Terrain';
import { Water } from './Water';

export function Scene() {
  // Created in an effect (not useMemo) so StrictMode's mount → unmount → mount
  // gets a fresh pool instead of a disposed one.
  const [systems, setSystems] = useState<{ pool: WorkerPool; manager: ChunkManager } | null>(null);
  useEffect(() => {
    const pool = new WorkerPool();
    const manager = new ChunkManager(pool);
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
      <fog attach="fog" args={[world.skyGlow, CAMERA.fogNear, CAMERA.fogFar]} />
      <hemisphereLight args={[world.skyGlow, world.meadow, 1.3]} />
      {/* Warm late-afternoon sun from the south-west. */}
      <directionalLight color="#ffe2b8" intensity={2.6} position={[-0.8, 1, 0.6]} />
      <Sky />
      <Water />
      <Terrain manager={manager} />
      <Player />
      <GameLoop manager={manager} pool={pool} />
      <FollowCamera />
    </>
  );
}
