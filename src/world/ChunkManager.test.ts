import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, LOD_LEVELS, UNLOAD_RADIUS, VIEW_RADIUS } from '../config/world';
import { buildChunk, type ChunkData, type ChunkRequest } from './buildChunk';
import { ChunkManager } from './ChunkManager';
import { chunkDistance, chunkKey, desiredChunks, lodForDistance } from './chunkMath';
import type { WorkerPool } from './workerPool';

/** Builds chunks in-process, cheaply (4 segments), instead of in workers. */
const fakePool = {
  buildChunk: (req: ChunkRequest): Promise<ChunkData> => Promise.resolve(buildChunk({ ...req, segments: 4, withProps: false })),
} as unknown as WorkerPool;

async function settle(manager: ChunkManager, x: number, z: number): Promise<void> {
  for (let i = 0; i < 400; i++) {
    manager.update(x, z);
    await new Promise((r) => setTimeout(r, 0));
    if (manager.stats().pending === 0 && manager.stats().loaded > 0) return;
  }
  throw new Error('did not settle');
}

describe('ChunkManager', () => {
  it('loads every chunk around the player at the right LOD', async () => {
    const m = new ChunkManager(fakePool);
    await settle(m, 50_500, 50_500);
    const center = { cx: 50, cz: 50 };
    for (const c of m.chunks.values()) expect(c.lod).toBe(lodForDistance(chunkDistance(center, c)));
    expect(m.chunks.size).toBeGreaterThan(300);
  });

  it('leaves no fine-LOD chunks behind after a long jump', async () => {
    const m = new ChunkManager(fakePool);
    await settle(m, 49.5 * CHUNK_SIZE, 53.5 * CHUNK_SIZE);
    await settle(m, 37.5 * CHUNK_SIZE, 50.5 * CHUNK_SIZE); // 12 chunks west
    const center = { cx: 37, cz: 50 };
    const wanted = new Map(desiredChunks(center, VIEW_RADIUS).map((w) => [chunkKey(w.cx, w.cz), w.lod]));
    const coarsest = LOD_LEVELS.length - 1;
    for (const c of m.chunks.values()) {
      expect(chunkDistance(center, c)).toBeLessThanOrEqual(UNLOAD_RADIUS);
      // Wanted chunks have their ring's LOD; leftovers may only be coarse.
      expect(c.lod, `chunk ${c.key}`).toBe(wanted.get(c.key) ?? coarsest);
    }
    expect(m.stats().lodCounts.slice(0, coarsest)).toEqual(LOD_LEVELS.slice(0, coarsest).map((_, i) => [...wanted.values()].filter((l) => l === i).length));
  });
});
