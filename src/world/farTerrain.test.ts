import { describe, expect, it } from 'vitest';
import { FAR_TERRAIN, WORLD_SIZE } from '../config/world';
import { buildFarTile, wantedFarTiles } from './farTerrain';
import { heightAt } from './terrain';

describe('far terrain', () => {
  it('samples the same terrain on a coarse grid, in tile-local coordinates', () => {
    const t = buildFarTile(12, 12);
    const side = FAR_TERRAIN.segments + 1;
    expect(t.positions.length).toBe(side * side * 3);
    expect(t.positions[0]).toBe(0);
    expect(t.positions[(side * side - 1) * 3]).toBe(FAR_TERRAIN.tileSize);
    const step = FAR_TERRAIN.tileSize / FAR_TERRAIN.segments;
    expect(t.positions[(3 * side + 5) * 3 + 1]).toBeCloseTo(heightAt(12 * FAR_TERRAIN.tileSize + 5 * step, 12 * FAR_TERRAIN.tileSize + 3 * step), 3);
    for (let v = 0; v < side * side; v++) expect(t.normals[v * 3 + 1]!).toBeGreaterThan(0);
  });

  it('neighbouring tiles share their edge heights exactly', () => {
    const a = buildFarTile(10, 10);
    const b = buildFarTile(11, 10);
    const side = FAR_TERRAIN.segments + 1;
    for (let j = 0; j < side; j++) expect(a.positions[(j * side + side - 1) * 3 + 1]).toBe(b.positions[j * side * 3 + 1]);
  });

  it('wants a ring round the player, clipped to the world', () => {
    const per = WORLD_SIZE / FAR_TERRAIN.tileSize;
    const mid = wantedFarTiles(12, 12, per);
    const full = (2 * FAR_TERRAIN.rings + 1) ** 2 - (2 * FAR_TERRAIN.innerRings + 1) ** 2;
    expect(mid.length).toBe(full);
    expect(mid.some((t) => t.tx === 12 && t.tz === 12)).toBe(false);
    expect(wantedFarTiles(0, 0, per).length).toBeLessThan(full);
  });
});
