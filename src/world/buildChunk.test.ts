import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNKS_PER_SIDE, WORLD_SIZE } from '../config/world';
import { buildChunk } from './buildChunk';
import { buildVegetation } from './vegetation';
import { heightAt } from './terrain';

describe('terrain', () => {
  it('is deterministic', () => {
    expect(heightAt(23_456.5, 61_000.25)).toBe(heightAt(23_456.5, 61_000.25));
    expect(buildVegetation(50, 50, 64, 32, false)).toEqual(buildVegetation(50, 50, 64, 32, false));
  });

  it('ends in ocean at the world edge', () => {
    expect(heightAt(10, WORLD_SIZE / 2)).toBeLessThan(0);
    expect(heightAt(WORLD_SIZE / 2, WORLD_SIZE - 10)).toBeLessThan(0);
  });

  it('builds chunks with local (float32-safe) coordinates', () => {
    const data = buildChunk({ cx: CHUNKS_PER_SIDE - 20, cz: CHUNKS_PER_SIDE - 20, segments: 8, morphSegments: 0, withProps: false });
    const xs = Array.from(data.positions.filter((_, i) => i % 3 === 0));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(CHUNK_SIZE);
    // 9×9 grid + 32 skirt vertices
    expect(data.positions.length / 3).toBe(81 + 32);
    expect(data.props.length).toBe(0);
  });

  it('shares exact edge heights with the neighbouring chunk (no seams at equal LOD)', () => {
    const a = buildChunk({ cx: 50, cz: 50, segments: 16, morphSegments: 8, withProps: false });
    const b = buildChunk({ cx: 51, cz: 50, segments: 16, morphSegments: 8, withProps: false });
    const side = 17;
    for (let j = 0; j < side; j++) {
      expect(a.positions[(j * side + 16) * 3 + 1]).toBe(b.positions[j * side * 3 + 1]);
    }
  });
});
