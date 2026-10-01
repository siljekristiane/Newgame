import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_ZONES, TRACKS } from './playlist';

const credits = readFileSync(new URL('../../CREDITS.md', import.meta.url), 'utf8');

describe('playlist', () => {
  it('has unique ids', () => {
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
  });

  it('every recording exists, is credited in the track and in CREDITS.md, and is free', () => {
    for (const t of TRACKS) {
      if (t.file === null) continue;
      expect(existsSync(new URL(`../../public/${t.file}`, import.meta.url)), t.file).toBe(true);
      expect(t.credit, t.id).toMatch(/CC0|Public domain|Public Domain/);
      const name = t.file.split('/').pop()!;
      expect(credits, name).toContain(`\`${name}\``);
    }
  });

  it('gives every zone at least two pieces, and names only known zones', () => {
    for (const zone of MUSIC_ZONES) {
      expect(TRACKS.filter((t) => t.file !== null && t.zones.includes(zone)).length, zone).toBeGreaterThanOrEqual(2);
    }
    for (const t of TRACKS) for (const z of t.zones) expect(MUSIC_ZONES as readonly string[], t.id).toContain(z);
  });
});
