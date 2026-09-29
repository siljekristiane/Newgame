import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, WORLD_SIZE } from '../config/world';
import { heightAt } from '../world/terrain';
import { VIEWS, viewIdFromHash } from './views';

describe('camera views', () => {
  it('have unique ids and sit inside the world, on land', () => {
    expect(new Set(VIEWS.map((v) => v.id)).size).toBe(VIEWS.length);
    for (const v of VIEWS) {
      expect(v.x).toBeGreaterThan(0);
      expect(v.z).toBeLessThan(WORLD_SIZE);
      if (v.id !== 'edge') expect(heightAt(v.x, v.z)).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it('parses only #v-<id> hashes', () => {
    expect(viewIdFromHash('#v-coast')).toBe('coast');
    expect(viewIdFromHash('#coast')).toBeNull();
    expect(viewIdFromHash('#v-coast=1')).toBeNull();
  });
});
