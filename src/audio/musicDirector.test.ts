import { describe, expect, it } from 'vitest';
import { AUDIO, SPAWN } from '../config/world';
import { groundHeightAt } from '../world/ground';
import { MusicScheduler, ZoneTracker, zoneFor, type MusicCommand } from './musicDirector';
import { TRACKS, type Track } from './playlist';

const M = AUDIO.music;

const at = (x: number, z: number, night = 0, precipitation = 0) => zoneFor({ x, z, groundY: groundHeightAt(x, z), night, precipitation });

describe('zoneFor', () => {
  it('finds the start, the mountain, the coast and open land', () => {
    expect(at(SPAWN.x, SPAWN.z)).toBe('start');
    expect(at(34_500, 49_500)).toBe('mountain'); // the snowy peak
    expect(at(51_000, 46_760)).toBe('coast'); // the shore view
    expect(['forest', 'meadow']).toContain(at(47_000, 47_000)); // the valley
  });

  it('puts rain before night, and night before every place', () => {
    expect(at(SPAWN.x, SPAWN.z, 1, 0)).toBe('night');
    expect(at(34_500, 49_500, 1, 0.9)).toBe('rain');
    expect(at(SPAWN.x, SPAWN.z, 0.3, 0.3)).toBe('start');
  });
});

describe('ZoneTracker', () => {
  it('takes the first zone at once and ignores a short crossing', () => {
    const t = new ZoneTracker();
    expect(t.update(0.1, 'start')).toBe('start');
    for (let i = 0; i < 50; i++) t.update(0.1, 'forest'); // 5 s
    expect(t.zone).toBe('start');
    t.update(0.1, 'start'); // back again: the count starts over
    for (let i = 0; i < 70; i++) t.update(0.1, 'forest');
    expect(t.zone).toBe('start');
  });

  it('follows a zone that holds, slower for night and rain', () => {
    const t = new ZoneTracker();
    t.update(0.1, 'start');
    let s = 0;
    while (t.update(0.1, 'forest') !== 'forest') s += 0.1;
    expect(Math.abs(s - M.hold)).toBeLessThan(0.25);
    s = 0;
    while (t.update(0.1, 'night') !== 'night') s += 0.1;
    expect(Math.abs(s - M.holdSlow)).toBeLessThan(0.25);
  });
});

const track = (id: string, zones: string[], file: string | null = `audio/music/${id}.ogg`): Track => ({ id, composer: 'x', work: id, zones, file, credit: 'test' });

const LIST = [
  track('a1', ['start']),
  track('a2', ['start']),
  track('a3', ['start']),
  track('f1', ['forest']),
  track('f2', ['forest']),
  track('both', ['start', 'meadow']),
  track('plot', ['battle']),
  track('nofile', ['coast'], null),
];

/** Runs the scheduler for `seconds` in steps of `dt`, collecting commands. */
function run(s: MusicScheduler, seconds: number, zone: string, dt = 0.5): MusicCommand[] {
  const out: MusicCommand[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const c = s.update(dt, zone);
    if (c) out.push(c);
  }
  return out;
}

const playId = (c: MusicCommand | undefined) => (c && 'play' in c ? c.play.id : null);

describe('MusicScheduler', () => {
  it('starts a piece for the zone after a short wait', () => {
    const s = new MusicScheduler(LIST, 1);
    const cmds = run(s, M.firstGap + 1, 'forest');
    expect(cmds).toHaveLength(1);
    expect(['f1', 'f2']).toContain(playId(cmds[0]));
    expect(s.state).toBe('playing');
  });

  it('never plays the same piece twice in a row, and pauses 20–60 s between pieces', () => {
    const s = new MusicScheduler(LIST, 7);
    let prev: string | null = null;
    run(s, M.firstGap + 1, 'start');
    for (let i = 0; i < 30; i++) {
      const id = s.track!.id;
      expect(id).not.toBe(prev);
      prev = id;
      s.trackEnded(id);
      expect(s.state).toBe('gap');
      let silence = 0;
      while (s.update(0.5, 'start') === null) silence += 0.5;
      expect(silence).toBeGreaterThanOrEqual(M.gapMin - 0.5);
      expect(silence).toBeLessThanOrEqual(M.gapMax);
    }
  });

  it('is deterministic for a seed', () => {
    const ids = (seed: number) => {
      const s = new MusicScheduler(LIST, seed);
      const out: string[] = [];
      run(s, M.firstGap + 1, 'start');
      for (let i = 0; i < 10; i++) {
        out.push(s.track!.id);
        s.trackEnded(s.track!.id);
        run(s, M.gapMax + 1, 'start');
      }
      return out.join();
    };
    expect(ids(3)).toBe(ids(3));
  });

  it('lets the piece play on after a zone change, then crossfades after at most maxWait', () => {
    const s = new MusicScheduler(LIST, 2);
    run(s, M.firstGap + 1, 'start');
    const first = s.track!.id;
    expect(first).not.toBe('both');
    expect(run(s, M.maxWait - 1, 'forest')).toHaveLength(0);
    const cmds = run(s, 2, 'forest');
    expect(['f1', 'f2']).toContain(playId(cmds[0]));
  });

  it('keeps a piece that also belongs to the new zone', () => {
    const s = new MusicScheduler([track('both', ['start', 'meadow']), track('m2', ['meadow'])], 2);
    run(s, M.firstGap + 1, 'start');
    expect(s.track!.id).toBe('both');
    expect(run(s, M.maxWait * 2, 'meadow')).toHaveLength(0);
  });

  it('fades out when the new zone has no music, and stays silent there', () => {
    const s = new MusicScheduler(LIST, 2);
    run(s, M.firstGap + 1, 'start');
    const cmds = run(s, M.maxWait + M.crossfade + 120, 'coast');
    expect(cmds).toEqual([{ fadeOut: true }]);
    expect(s.track).toBeNull();
  });

  it('is silent while no piece has a recording (as before phase D)', () => {
    const s = new MusicScheduler(TRACKS.map((t) => ({ ...t, file: null })), 2);
    for (const zone of ['start', 'forest', 'night', 'rain']) expect(run(s, 300, zone)).toHaveLength(0);
  });

  it('brings a plot layer in at once and returns to the zone when it is popped', () => {
    const s = new MusicScheduler(LIST, 2);
    run(s, M.firstGap + 1, 'forest');
    s.pushLayer('battle');
    expect(playId(s.update(0.5, 'forest') ?? undefined)).toBe('plot');
    s.trackEnded('plot');
    expect(run(s, 30, 'forest').map(playId).filter(Boolean)).not.toContain('f1'); // still the layer: only 'plot' may play
    s.popLayer('battle');
    const back = run(s, M.zoneGap + M.maxWait + 2, 'forest').map(playId);
    expect(back.some((id) => id === 'f1' || id === 'f2')).toBe(true);
  });
});
