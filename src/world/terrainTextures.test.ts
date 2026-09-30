import { describe, expect, it } from 'vitest';
import { buildTerrainTextures, TERRAIN_LAYERS } from './terrainTextures';

const SIZE = 64; // small for speed; the generator is resolution-independent
const tex = buildTerrainTextures(SIZE);
const px = (data: Uint8Array, layer: number, x: number, y: number, c: number) => data[(layer * SIZE * SIZE + y * SIZE + x) * 4 + c]!;

describe('terrain detail textures', () => {
  it('has one layer per surface material', () => {
    expect(tex.layers).toBe(TERRAIN_LAYERS.length);
    expect(tex.albedo.length).toBe(SIZE * SIZE * 4 * TERRAIN_LAYERS.length);
  });

  it('keeps the mean detail factor at 1.0, so biome colours are unchanged', () => {
    for (let l = 0; l < tex.layers; l++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) sum += px(tex.albedo, l, x, y, c);
        expect(sum / (SIZE * SIZE) / 127.5).toBeCloseTo(1, 1);
      }
    }
  });

  it('tiles seamlessly (opposite edges continue each other)', () => {
    for (let l = 0; l < tex.layers; l++) {
      let edge = 0;
      let inner = 0;
      for (let y = 0; y < SIZE; y++) {
        edge += Math.abs(px(tex.albedo, l, SIZE - 1, y, 3) - px(tex.albedo, l, 0, y, 3));
        inner += Math.abs(px(tex.albedo, l, SIZE / 2, y, 3) - px(tex.albedo, l, SIZE / 2 + 1, y, 3));
      }
      // The jump across the wrap is no bigger than between any two neighbours.
      expect(edge).toBeLessThanOrEqual(inner * 1.6 + SIZE);
    }
  });

  it('stores unit normals that point up', () => {
    for (let l = 0; l < tex.layers; l++) {
      for (let i = 0; i < 200; i++) {
        const x = (i * 7) % SIZE;
        const y = (i * 13) % SIZE;
        const n = [0, 1, 2].map((c) => px(tex.normal, l, x, y, c) / 127.5 - 1);
        expect(Math.hypot(...n)).toBeCloseTo(1, 1);
        expect(n[2]!).toBeGreaterThan(0.2);
      }
    }
  });

  it('is deterministic', () => {
    expect(buildTerrainTextures(16).albedo).toEqual(buildTerrainTextures(16).albedo);
  });
});
