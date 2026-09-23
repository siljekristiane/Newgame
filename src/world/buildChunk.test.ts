import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../config/world';
import { buildChunk, buildProps } from './buildChunk';
import { heightAt } from './terrain';

describe('terrain', () => {
  it('is deterministic', () => {
    expect(heightAt(123_456.5, 321_000.25)).toBe(heightAt(123_456.5, 321_000.25));
    expect(buildProps(250, 250)).toEqual(buildProps(250, 250));
  });

  it('ends in ocean at the world edge', () => {
    expect(heightAt(10, 250_000)).toBeLessThan(0);
    expect(heightAt(250_000, 499_990)).toBeLessThan(0);
  });

  it('builds chunks with local (float32-safe) coordinates', () => {
    const data = buildChunk({ cx: 400, cz: 400, segments: 8, withProps: false });
    const xs = Array.from(data.positions.filter((_, i) => i % 3 === 0));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(CHUNK_SIZE);
    // 9×9 grid + 32 skirt vertices
    expect(data.positions.length / 3).toBe(81 + 32);
    expect(data.props.length).toBe(0);
  });

  it('shares exact edge heights with the neighbouring chunk (no seams at equal LOD)', () => {
    const a = buildChunk({ cx: 250, cz: 250, segments: 16, withProps: false });
    const b = buildChunk({ cx: 251, cz: 250, segments: 16, withProps: false });
    const side = 17;
    for (let j = 0; j < side; j++) {
      expect(a.positions[(j * side + 16) * 3 + 1]).toBe(b.positions[j * side * 3 + 1]);
    }
  });
});
