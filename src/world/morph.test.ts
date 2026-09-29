import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, LOD_LEVELS } from '../config/world';
import { buildChunk, PROP_STRIDE } from './buildChunk';
import { gridHeightAt } from './ground';

/** Interpolate a chunk's triangles using the given per-vertex heights (same split as the index buffer). */
function surfaceAt(heights: (i: number, j: number) => number, segments: number, lx: number, lz: number): number {
  const step = CHUNK_SIZE / segments;
  const i = Math.min(segments - 1, Math.floor(lx / step));
  const j = Math.min(segments - 1, Math.floor(lz / step));
  const fx = lx / step - i;
  const fz = lz / step - j;
  const [a, b, c, d] = [heights(i, j), heights(i + 1, j), heights(i, j + 1), heights(i + 1, j + 1)];
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('geomorphing', () => {
  for (let lod = 0; lod < LOD_LEVELS.length - 1; lod++) {
    const segments = LOD_LEVELS[lod]!.segments;
    const coarse = LOD_LEVELS[lod + 1]!.segments;
    it(`fully morphed LOD ${lod} is exactly the LOD ${lod + 1} surface (no pop at the swap)`, () => {
      const cx = 41;
      const cz = 57;
      const data = buildChunk({ cx, cz, segments, morphSegments: coarse, withProps: false });
      const side = segments + 1;
      const morphed = (i: number, j: number) => data.morphHeights[j * side + i]!;
      for (let n = 0; n < 200; n++) {
        const lx = rnd() * CHUNK_SIZE;
        const lz = rnd() * CHUNK_SIZE;
        const expected = gridHeightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz, coarse);
        expect(Math.abs(surfaceAt(morphed, segments, lx, lz) - expected)).toBeLessThan(0.001);
      }
    });
  }

  it('colours and normals morph to the coarser mesh too (the swap does not flash)', () => {
    const cx = 44;
    const cz = 49;
    const fine = buildChunk({ cx, cz, segments: 32, morphSegments: 16, withProps: false });
    const coarse = buildChunk({ cx, cz, segments: 16, morphSegments: 8, withProps: false });
    for (let n = 0; n < 100; n++) {
      const lx = rnd() * CHUNK_SIZE;
      const lz = rnd() * CHUNK_SIZE;
      for (let k = 0; k < 3; k++) {
        const fineMorphed = surfaceAt((i, j) => fine.morphColors[(j * 33 + i) * 3 + k]!, 32, lx, lz);
        const coarseColor = surfaceAt((i, j) => coarse.colors[(j * 17 + i) * 3 + k]!, 16, lx, lz);
        expect(Math.abs(fineMorphed - coarseColor)).toBeLessThan(1e-5);
        const fineN = surfaceAt((i, j) => fine.morphNormals[(j * 33 + i) * 3 + k]!, 32, lx, lz);
        const coarseN = surfaceAt((i, j) => coarse.normals[(j * 17 + i) * 3 + k]!, 16, lx, lz);
        // Per-vertex normals are renormalised, so allow a little slack.
        expect(Math.abs(fineN - coarseN)).toBeLessThan(0.02);
      }
    }
  });

  it('the coarsest LOD does not morph', () => {
    const data = buildChunk({ cx: 40, cz: 40, segments: 8, morphSegments: 0, withProps: false });
    for (let v = 0; v < 81; v++) expect(data.morphHeights[v]).toBe(data.positions[v * 3 + 1]);
  });

  it('props carry their height on the coarser mesh', () => {
    const data = buildChunk({ cx: 45, cz: 52, segments: 64, morphSegments: 32, withProps: true });
    expect(data.props.length).toBeGreaterThan(0);
    for (let k = 0; k < data.props.length; k += PROP_STRIDE) {
      const x = 45 * CHUNK_SIZE + data.props[k]!;
      const z = 52 * CHUNK_SIZE + data.props[k + 2]!;
      expect(data.props[k + 5]).toBeCloseTo(gridHeightAt(x, z, 32), 3);
    }
  });
});

describe('normals', () => {
  it('are unit length and point up', () => {
    const { normals } = buildChunk({ cx: 34, cz: 50, segments: 16, morphSegments: 8, withProps: false });
    for (let v = 0; v < normals.length / 3; v++) {
      expect(Math.hypot(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!)).toBeCloseTo(1, 5);
      expect(normals[v * 3 + 1]!).toBeGreaterThan(0);
    }
  });

  it('are identical where chunks and LODs share a point (no shading seams or pops)', () => {
    const fine = buildChunk({ cx: 50, cz: 50, segments: 64, morphSegments: 32, withProps: false });
    const coarse = buildChunk({ cx: 50, cz: 50, segments: 8, morphSegments: 0, withProps: false });
    const east = buildChunk({ cx: 51, cz: 50, segments: 8, morphSegments: 0, withProps: false });
    // Coarse vertex (2, 3) is fine vertex (16, 24); coarse (8, 3) is the east neighbour's (0, 3).
    const n = (d: typeof fine, side: number, i: number, j: number) => Array.from(d.normals.subarray((j * side + i) * 3, (j * side + i) * 3 + 3));
    expect(n(fine, 65, 16, 24)).toEqual(n(coarse, 9, 2, 3));
    expect(n(coarse, 9, 8, 3)).toEqual(n(east, 9, 0, 3));
  });

  it('skirts copy the normal and colour of the edge above them', () => {
    const segments = 8;
    const d = buildChunk({ cx: 50, cz: 50, segments, morphSegments: 0, withProps: false });
    const grid = (segments + 1) ** 2;
    // The first skirt vertex hangs below grid vertex 0 (north-west corner).
    expect(Array.from(d.normals.subarray(grid * 3, grid * 3 + 3))).toEqual(Array.from(d.normals.subarray(0, 3)));
    expect(Array.from(d.colors.subarray(grid * 3, grid * 3 + 3))).toEqual(Array.from(d.colors.subarray(0, 3)));
    expect(d.morphHeights[grid]).toBeLessThan(d.morphHeights[0]!);
  });
});
