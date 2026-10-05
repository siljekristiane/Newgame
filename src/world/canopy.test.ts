import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL } from '../config/world';
import { buildChunk } from './buildChunk';
import { applyCanopy, canopyAt, canopyStrength } from './canopy';
import { heightAt } from './terrain';

/** The chunk with the most canopy among a sample around the middle of the world. */
function forestChunk(): { cx: number; cz: number } {
  let best = { cx: 50, cz: 50, cover: -1 };
  for (let cx = 30; cx < 70; cx += 4) {
    for (let cz = 30; cz < 70; cz += 4) {
      const x = (cx + 0.5) * CHUNK_SIZE;
      const z = (cz + 0.5) * CHUNK_SIZE;
      const { cover } = canopyAt(x, z, heightAt(x, z), 0.05);
      if (cover > best.cover) best = { cx, cz, cover };
    }
  }
  return best;
}

const luminance = (c: Float32Array, o: number) => 0.2126 * c[o]! + 0.7152 * c[o + 1]! + 0.0722 * c[o + 2]!;

describe('canopy', () => {
  it('covers forests and nothing at sea', () => {
    const { cx, cz } = forestChunk();
    const x = (cx + 0.5) * CHUNK_SIZE;
    const z = (cz + 0.5) * CHUNK_SIZE;
    expect(canopyAt(x, z, heightAt(x, z), 0.05).cover).toBeGreaterThan(0.5);
    expect(canopyAt(x, z, SEA_LEVEL - 5, 0).cover).toBe(0);
  });

  it('is off on LOD 0 (real trees there) and grows on the coarser LODs', () => {
    expect(canopyStrength(64)).toBe(0);
    expect(canopyStrength(32)).toBeGreaterThan(0);
    expect(canopyStrength(16)).toBeGreaterThan(canopyStrength(32));
    expect(canopyStrength(8)).toBeGreaterThanOrEqual(canopyStrength(16));
  });

  it('darkens a forest chunk on a coarse LOD, not on LOD 0', () => {
    const { cx, cz } = forestChunk();
    const lod0 = buildChunk({ cx, cz, segments: 64, morphSegments: 32, withProps: false });
    const lod2 = buildChunk({ cx, cz, segments: 16, morphSegments: 8, withProps: false });
    // Same grid points: every 4th vertex of LOD 0 is a LOD 2 vertex.
    let lighter = 0;
    let total = 0;
    for (let j = 0; j <= 16; j++) {
      for (let i = 0; i <= 16; i++) {
        const a = luminance(lod0.colors, (j * 4 * 65 + i * 4) * 3);
        const b = luminance(lod2.colors, (j * 17 + i) * 3);
        if (b <= a + 1e-6) lighter++;
        total++;
      }
    }
    expect(lighter / total).toBeGreaterThan(0.95);
    // ...and LOD 0's morph target already carries LOD 1's canopy, so the swap does not flash.
    const lod1 = buildChunk({ cx, cz, segments: 32, morphSegments: 16, withProps: false });
    for (let j = 0; j <= 32; j += 2) {
      for (let i = 0; i <= 32; i += 2) {
        for (let k = 0; k < 3; k++) {
          expect(lod0.morphColors[(j * 2 * 65 + i * 2) * 3 + k]).toBeCloseTo(lod1.colors[(j * 33 + i) * 3 + k]!, 5);
        }
      }
    }
  });

  it('leaves the colour alone without cover or strength', () => {
    const rgb = new Float32Array([0.5, 0.4, 0.3]);
    applyCanopy(rgb, 0, { cover: 0, conifer: 1, snow: 0, old: 0 }, 1, 0, 0);
    applyCanopy(rgb, 0, { cover: 1, conifer: 1, snow: 0, old: 0 }, 0, 0, 0);
    expect([...rgb]).toEqual([0.5, 0.4, 0.3].map((v) => Math.fround(v)));
  });
});
