import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerfMonitor } from '../debug/perfMonitor';
import '../debug/testApi';
import { applyView, VIEWS } from '../debug/views';
import { useGameStore } from '../state/useGameStore';
import type { ChunkManager } from '../world/ChunkManager';

const INTERVAL = 0.2; // seconds between snapshots

type PerformanceWithMemory = Performance & { memory?: { usedJSHeapSize: number } };

/**
 * Measures what the renderer and the streaming system are doing and publishes
 * it to the store (F3 panel) and to window.__duskwood (automated tests).
 * renderer.info is read in useFrame, i.e. it holds the previous frame's totals.
 */
export function DebugProbe({ manager }: { manager: ChunkManager }) {
  const gl = useThree((s) => s.gl);
  const monitor = useRef(new PerfMonitor(120));
  const timer = useRef(0);
  const settleMs = useRef<number | null>(null);
  const jumpSeen = useRef(-1);

  useEffect(() => {
    window.__duskwood = {
      views: VIEWS.map((v) => v.id),
      setView: applyView,
      isSettled: () => settleMs.current !== null,
      debug: () => useGameStore.getState().debug,
      hud: () => useGameStore.getState().hud,
    };
    return () => {
      delete window.__duskwood;
    };
  }, []);

  useFrame((_, dt) => {
    monitor.current.push(dt * 1000);

    const { lastJumpAt } = useGameStore.getState();
    if (jumpSeen.current !== lastJumpAt) {
      jumpSeen.current = lastJumpAt;
      settleMs.current = null;
    }
    const stats = manager.stats();
    if (settleMs.current === null && stats.loaded > 0 && stats.pending === 0) {
      settleMs.current = performance.now() - lastJumpAt;
    }

    timer.current += dt;
    if (timer.current < INTERVAL) return;
    timer.current = 0;
    const perf = monitor.current.stats();
    const memory = (performance as PerformanceWithMemory).memory;
    useGameStore.getState().setDebug({
      fps: Math.round(perf.fps),
      frameMs: perf.frameMs,
      frameMsP95: perf.frameMsP95,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      heapMb: memory ? memory.usedJSHeapSize / 1_048_576 : null,
      loadedChunks: stats.loaded,
      pendingChunks: stats.pending,
      lodCounts: stats.lodCounts,
      settleMs: settleMs.current,
    });
  });

  return null;
}
