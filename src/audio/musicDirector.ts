import { AUDIO, SEA_LEVEL, WORLD_SEED } from '../config/world';
import { spawnLayout } from '../regions/spawn/layout';
import { biomeAt, climateAt } from '../world/biomes';
import { mulberry32 } from '../world/noise';
import { heightAt } from '../world/terrain';
import type { MusicZone, Track } from './playlist';

/**
 * The music director (pure, tested): which zone the player is in, a tracker
 * that only follows a zone once it has held for a while, and a scheduler that
 * decides when to start, crossfade and pause pieces. It only gives commands;
 * MusicPlayer turns them into sound.
 */

const M = AUDIO.music;

export interface ZoneInput {
  x: number;
  z: number;
  /** Ground height under the player, m. */
  groundY: number;
  /** 0 = day … 1 = full night (lightingAt().night). */
  night: number;
  /** 0..1 (runtime.weather.precipitation). */
  precipitation: number;
}

/** The zone for one moment, by priority: rain, night, start, mountain, coast, forest, meadow. */
export function zoneFor({ x, z, groundY, night, precipitation }: ZoneInput): MusicZone {
  if (precipitation > M.rain) return 'rain';
  if (night > M.night) return 'night';
  const { plaza } = spawnLayout();
  if (Math.hypot(x - plaza.x, z - plaza.z) < M.startRadius) return 'start';
  const climate = climateAt(x, z, groundY);
  const biome = biomeAt(climate, groundY, 0);
  if (biome === 'alpine' || biome === 'snow' || groundY > M.mountainHeight) return 'mountain';
  if (groundY < M.coastHeight && nearSea(x, z)) return 'coast';
  if (biome === 'forest') return 'forest';
  return 'meadow';
}

function nearSea(x: number, z: number): boolean {
  const r = M.coastReach;
  return heightAt(x + r, z) < SEA_LEVEL || heightAt(x - r, z) < SEA_LEVEL || heightAt(x, z + r) < SEA_LEVEL || heightAt(x, z - r) < SEA_LEVEL;
}

const slowZone = (zone: string) => zone === 'night' || zone === 'rain';

/** Follows the raw zone only once it has held for AUDIO.music.hold seconds (night and rain: holdSlow). */
export class ZoneTracker {
  private stable: MusicZone | null = null;
  private candidate: MusicZone | null = null;
  private held = 0;

  get zone(): MusicZone | null {
    return this.stable;
  }

  update(dt: number, raw: MusicZone): MusicZone {
    if (this.stable === null || raw === this.stable) {
      this.stable = raw;
      this.candidate = null;
      this.held = 0;
      return raw;
    }
    if (raw !== this.candidate) {
      this.candidate = raw;
      this.held = 0;
    }
    this.held += dt;
    const hold = slowZone(raw) || slowZone(this.stable) ? M.holdSlow : M.hold;
    if (this.held >= hold) {
      this.stable = raw;
      this.candidate = null;
      this.held = 0;
    }
    return this.stable;
  }
}

export type MusicCommand = { play: Track } | { fadeOut: true } | null;
export type SchedulerState = 'idle' | 'playing' | 'fadingOut' | 'gap';

/**
 * When pieces start and stop. Feed it the stable zone every frame with
 * `update`; tell it when a piece has ended with `trackEnded`.
 * - Picks a piece for the zone (or the top plot layer), never the same twice
 *   in a row; deterministic for a given seed.
 * - 20–60 s of silence between pieces.
 * - On a zone change the piece may play on for up to `maxWait`, then crossfades
 *   into the new zone's music (or fades out if the zone has none).
 * - A plot layer (`pushLayer`) crossfades in at once and wins over the zones
 *   until it is popped.
 */
export class MusicScheduler {
  private readonly random: () => number;
  private readonly tracks: readonly Track[];
  private stateName: SchedulerState = 'idle';
  private timer: number = M.firstGap;
  private current: Track | null = null;
  private currentZone: string | null = null;
  private last: string | null = null;
  private waited = 0;
  private lastTarget: string | null = null;
  private readonly layers: string[] = [];

  constructor(tracks: readonly Track[], seed = WORLD_SEED + 3_000) {
    this.tracks = tracks;
    this.random = mulberry32(seed);
  }

  get state(): SchedulerState {
    return this.stateName;
  }

  /** The piece playing (or fading out), if any. */
  get track(): Track | null {
    return this.current;
  }

  /** What the music follows: the top plot layer, else the zone. */
  target(zone: string): string {
    return this.layers[this.layers.length - 1] ?? zone;
  }

  pushLayer(name: string): void {
    this.layers.push(name);
  }

  popLayer(name?: string): void {
    if (name === undefined) this.layers.pop();
    else {
      const i = this.layers.lastIndexOf(name);
      if (i >= 0) this.layers.splice(i, 1);
    }
  }

  /** Pieces that can play for a zone or layer (those with a recording). */
  candidates(target: string): Track[] {
    return this.tracks.filter((t) => t.file !== null && t.zones.includes(target));
  }

  /** The piece has ended (or failed to load): start the pause. */
  trackEnded(id: string): void {
    if (this.current?.id !== id) return;
    this.current = null;
    this.currentZone = null;
    this.startGap(M.gapMin + this.random() * (M.gapMax - M.gapMin));
  }

  update(dt: number, zone: string): MusicCommand {
    const target = this.target(zone);
    const changed = this.lastTarget !== null && target !== this.lastTarget;
    const layerChange = changed && (this.layers.includes(target) || this.layers.includes(this.lastTarget!));
    this.lastTarget = target;

    switch (this.stateName) {
      case 'idle':
      case 'gap':
        if (changed) this.timer = Math.min(this.timer, layerChange ? 0 : M.zoneGap);
        this.timer -= dt;
        if (this.timer > 0) return null;
        return this.start(target);

      case 'playing': {
        if (target === this.currentZone || (!layerChange && this.current?.zones.includes(target))) {
          // Still fits (the piece belongs to the new zone too): play on.
          this.currentZone = target;
          this.waited = 0;
          return null;
        }
        this.waited += dt;
        // A plot layer comes in at once; a new zone lets the piece play on for a while.
        if (!layerChange && this.waited < M.maxWait) return null;
        this.waited = 0;
        const next = this.pick(target);
        if (next) return this.play(next, target);
        this.stateName = 'fadingOut';
        this.timer = M.crossfade;
        return { fadeOut: true };
      }

      case 'fadingOut':
        this.timer -= dt;
        if (this.timer > 0) return null;
        this.current = null;
        this.currentZone = null;
        this.startGap(M.zoneGap);
        return null;
    }
  }

  private start(target: string): MusicCommand {
    const next = this.pick(target);
    if (!next) {
      // Nothing to play here: stay silent and look again a little later.
      this.stateName = 'idle';
      this.timer = M.zoneGap;
      return null;
    }
    return this.play(next, target);
  }

  private play(track: Track, target: string): MusicCommand {
    this.current = track;
    this.currentZone = target;
    this.last = track.id;
    this.stateName = 'playing';
    this.waited = 0;
    return { play: track };
  }

  private startGap(seconds: number): void {
    this.stateName = 'gap';
    this.timer = seconds;
  }

  private pick(target: string): Track | null {
    const all = this.candidates(target);
    const options = all.length > 1 ? all.filter((t) => t.id !== this.last) : all;
    if (options.length === 0) return null;
    return options[Math.floor(this.random() * options.length)] ?? options[0]!;
  }
}
