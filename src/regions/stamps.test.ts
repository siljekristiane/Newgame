import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, SPAWN_AREA } from '../config/world';
import { naturalHeightAt } from '../world/naturalTerrain';
import { heightAt } from '../world/terrain';
import { spawnLayout } from './spawn/layout';
import { clearing, nearestPath } from './stamps';

describe('spawn area layout', () => {
  const { plaza, paths } = spawnLayout();

  it('has winding paths out from the plaza that stay on land', () => {
    expect(paths.length).toBe(SPAWN_AREA.pathHeadings.length);
    for (const path of paths) {
      expect(path.length * SPAWN_AREA.pathSpacing).toBeGreaterThan(400);
      const first = path[0]!;
      expect(Math.hypot(first.x - plaza.x, first.z - plaza.z)).toBeCloseTo(plaza.radius, 0);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(SPAWN_AREA.pathSpacing * 1.01);
        expect(Math.abs(b.y - a.y)).toBeLessThan(1.5); // walkable: < ~20° along the path
        expect(b.y).toBeGreaterThan(SEA_LEVEL);
      }
    }
  });

  it('is deterministic', () => {
    expect(spawnLayout()).toBe(spawnLayout());
  });
});

describe('terrain stamps', () => {
  const { plaza, paths } = spawnLayout();

  it('flattens the plaza to its level', () => {
    for (const [dx, dz] of [[0, 0], [10, -5], [-15, 8]] as const) {
      expect(heightAt(plaza.x + dx, plaza.z + dz)).toBeCloseTo(plaza.y, 6);
    }
  });

  it('puts the path surface at the path level', () => {
    const p = paths[1]![40]!;
    expect(heightAt(p.x, p.z)).toBeCloseTo(p.y, 6);
    expect(nearestPath(p.x, p.z).distance).toBeLessThan(0.01);
  });

  it('leaves the rest of the world untouched', () => {
    expect(heightAt(30_000, 30_000)).toBe(naturalHeightAt(30_000, 30_000));
    expect(heightAt(plaza.x + 2_500, plaza.z + 2_500)).toBe(naturalHeightAt(plaza.x + 2_500, plaza.z + 2_500));
  });

  it('keeps plants off paths and the plaza', () => {
    const p = paths[0]![60]!;
    expect(clearing(p.x, p.z)).toBe(1);
    expect(clearing(plaza.x, plaza.z)).toBe(1);
    expect(clearing(30_000, 30_000)).toBe(0);
  });
});
