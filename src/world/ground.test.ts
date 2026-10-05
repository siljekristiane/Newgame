import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, LOD_LEVELS } from '../config/world';
import { buildChunk, PROP_STRIDE } from './buildChunk';
import { gridHeightAt, groundHeightAt } from './ground';
import { heightAt } from './terrain';

/** Height of the actual built mesh at (x, z): find the triangle under the point in buildChunk's arrays. */
function meshHeight(cx: number, cz: number, segments: number, x: number, z: number): number {
  const { positions } = buildChunk({ cx, cz, segments, morphSegments: 0, withProps: false });
  const side = segments + 1;
  const step = CHUNK_SIZE / segments;
  const lx = x - cx * CHUNK_SIZE;
  const lz = z - cz * CHUNK_SIZE;
  const i = Math.min(segments - 1, Math.floor(lx / step));
  const j = Math.min(segments - 1, Math.floor(lz / step));
  const y = (gi: number, gj: number) => positions[(gj * side + gi) * 3 + 1]!;
  const fx = lx / step - i;
  const fz = lz / step - j;
  // Same two triangles as the index buffer: a-c-b and b-c-d.
  const [a, b, c, d] = [y(i, j), y(i + 1, j), y(i, j + 1), y(i + 1, j + 1)];
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('ground height', () => {
  it('matches the rendered mesh at every LOD (float32 rounding only)', () => {
    for (const { segments } of LOD_LEVELS) {
      for (let n = 0; n < 40; n++) {
        const cx = 30 + Math.floor(rnd() * 40);
        const cz = 30 + Math.floor(rnd() * 40);
        const x = cx * CHUNK_SIZE + rnd() * CHUNK_SIZE;
        const z = cz * CHUNK_SIZE + rnd() * CHUNK_SIZE;
        expect(Math.abs(gridHeightAt(x, z, segments) - meshHeight(cx, cz, segments, x, z))).toBeLessThan(0.001);
      }
    }
  }, 60_000); // 160 chunk builds, horizons included

  it('equals heightAt exactly on grid points, and is what the player uses', () => {
    const step = CHUNK_SIZE / LOD_LEVELS[0].segments;
    expect(groundHeightAt(50_000 + 3 * step, 50_000 + 7 * step)).toBeCloseTo(heightAt(50_000 + 3 * step, 50_000 + 7 * step), 9);
  });

  it('props stand on the mesh of the LOD they were built for', () => {
    for (const lod of [0, 1]) {
      const { segments } = LOD_LEVELS[lod]!;
      const data = buildChunk({ cx: 45, cz: 52, segments, morphSegments: 0, withProps: true });
      expect(data.props.length).toBeGreaterThan(0);
      for (let k = 0; k < data.props.length; k += PROP_STRIDE) {
        const x = 45 * CHUNK_SIZE + data.props[k]!;
        const z = 52 * CHUNK_SIZE + data.props[k + 2]!;
        expect(Math.abs(data.props[k + 1]! - meshHeight(45, 52, segments, x, z))).toBeLessThan(0.001);
      }
    }
  }, 30_000); // builds two full chunks with plants
});
