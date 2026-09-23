import { describe, expect, it } from 'vitest';
import { CHUNKS_PER_SIDE, LOD_LEVELS, VIEW_RADIUS, WORLD_SIZE } from '../config/world';
import { desiredChunks, lodForDistance, worldToChunk } from './chunkMath';

describe('chunk math', () => {
  it('maps world meters to 1 km chunks and clamps at the world edge', () => {
    expect(worldToChunk(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(worldToChunk(1_999.9, 250_000)).toEqual({ cx: 1, cz: 250 });
    expect(worldToChunk(WORLD_SIZE, WORLD_SIZE)).toEqual({ cx: CHUNKS_PER_SIDE - 1, cz: CHUNKS_PER_SIDE - 1 });
    expect(worldToChunk(-5, -5)).toEqual({ cx: 0, cz: 0 });
  });

  it('picks finer LODs close to the player', () => {
    expect(lodForDistance(0)).toBe(0);
    expect(lodForDistance(LOD_LEVELS[0].maxDistance + 1)).toBe(1);
    expect(lodForDistance(VIEW_RADIUS)).toBe(LOD_LEVELS.length - 1);
    expect(lodForDistance(VIEW_RADIUS + 1)).toBe(-1);
  });

  it('lists desired chunks nearest first, inside the world only', () => {
    const middle = desiredChunks({ cx: 250, cz: 250 }, VIEW_RADIUS);
    expect(middle[0]).toMatchObject({ cx: 250, cz: 250, distance: 0, lod: 0 });
    for (let i = 1; i < middle.length; i++) expect(middle[i]!.distance).toBeGreaterThanOrEqual(middle[i - 1]!.distance);
    expect(middle.length).toBeLessThan((2 * VIEW_RADIUS + 1) ** 2); // circle, not square

    const corner = desiredChunks({ cx: 0, cz: 0 }, VIEW_RADIUS);
    expect(corner.every((c) => c.cx >= 0 && c.cz >= 0)).toBe(true);
    expect(corner.length).toBeLessThan(middle.length / 3);
  });
});
