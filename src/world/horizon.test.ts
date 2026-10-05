import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, TERRAIN_SHADOW } from '../config/world';
import { buildChunk } from './buildChunk';
import { horizonAt, horizonGrid, horizonGridSize, sampleHorizon } from './horizon';
import { heightAt } from './terrain';

const D = TERRAIN_SHADOW.directions;
const PEAK = { x: 34_500, z: 49_500 }; // the highest snowy peak

describe('horizon', () => {
  it('is low on a peak and high at the foot of a mountain, facing it', () => {
    // Climb to the true top near the named peak.
    let px = PEAK.x;
    let pz = PEAK.z;
    for (let r = 400; r >= 5; r /= 2) {
      for (let n = 0; n < 20; n++) {
        let best: [number, number] = [px, pz];
        for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] as const) {
          if (heightAt(px + dx, pz + dz) > heightAt(best[0], best[1])) best = [px + dx, pz + dz];
        }
        [px, pz] = best;
      }
    }
    const top = new Uint8Array(D);
    horizonAt(px, pz, top);
    expect(Math.max(...top)).toBeLessThan(40); // little rises above the top
    // 2 km west of the peak, the direction toward it (east, k = 0) is steep.
    const foot = new Uint8Array(D);
    const x = PEAK.x - 2_000;
    horizonAt(x, PEAK.z, foot);
    const rise = Math.atan((heightAt(PEAK.x, PEAK.z) - heightAt(x, PEAK.z)) / 2_000);
    expect(foot[0]! / 255).toBeGreaterThanOrEqual((rise / (Math.PI / 2)) * 0.9);
    expect(foot[0]!).toBeGreaterThan(foot[D / 2]!); // looking away is lower
  });

  it('samples the lattice exactly at its points, and a coarser lattice is a subset', () => {
    const g = 16;
    const fine = horizonGrid(40 * CHUNK_SIZE, 50 * CHUNK_SIZE, CHUNK_SIZE, g);
    const coarse = horizonGrid(40 * CHUNK_SIZE, 50 * CHUNK_SIZE, CHUNK_SIZE, 8);
    const a = new Uint8Array(4);
    const b = new Uint8Array(4);
    for (let j = 0; j <= 8; j++) {
      for (let i = 0; i <= 8; i++) {
        sampleHorizon(fine, CHUNK_SIZE, g, i * 125, j * 125, a, b, 0);
        const o = (j * 9 + i) * D;
        expect([...a, ...b]).toEqual([...coarse.subarray(o, o + D)]);
      }
    }
  });

  it('neighbouring chunks agree along their shared edge', () => {
    const segments = 64;
    const west = buildChunk({ cx: 40, cz: 50, segments, morphSegments: 32, withProps: false });
    const east = buildChunk({ cx: 41, cz: 50, segments, morphSegments: 32, withProps: false });
    const side = segments + 1;
    for (let j = 0; j < side; j++) {
      const w = j * side + segments;
      const e = j * side;
      expect([...west.horizonA.subarray(w * 4, w * 4 + 4)]).toEqual([...east.horizonA.subarray(e * 4, e * 4 + 4)]);
      expect([...west.horizonB.subarray(w * 4, w * 4 + 4)]).toEqual([...east.horizonB.subarray(e * 4, e * 4 + 4)]);
    }
  });

  it('uses the full lattice near the player and coarser ones further out', () => {
    expect(horizonGridSize(64)).toBe(16);
    expect(horizonGridSize(32)).toBe(8);
    expect(horizonGridSize(16)).toBe(4);
    expect(horizonGridSize(8)).toBe(2);
  });
});
