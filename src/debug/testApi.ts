import type { DebugSnapshot, HudSnapshot } from '../state/useGameStore';
import type { WeatherMode } from '../weather/weather';
import type { QualityLevel } from '../config/world';
import type { AudioVolumes } from '../audio/mixer';

/**
 * A small window API for automated browser tests and measurements
 * (see e2e/). It only reads state or moves the player to a fixed view.
 */
export interface DuskwoodTestApi {
  views: string[];
  setView: (id: string) => boolean;
  /** Geomorphing on/off (to measure what it saves). */
  setGeomorph: (on: boolean) => void;
  /** In-game clock (hours 0..24); `paused` stops it. */
  setTime: (hours: number, paused?: boolean) => void;
  /** Sun shadows on/off. */
  setShadows: (on: boolean) => void;
  /** Terrain shadows (mountains shading valleys) on/off. */
  setTerrainShadows: (on: boolean) => void;
  /** Trees, bushes and boulders on/off. */
  setVegetation: (on: boolean) => void;
  /** Pins the weather ('auto' = follow the weather model). */
  setWeather: (mode: WeatherMode) => void;
  /** Applies a quality preset (not remembered). */
  setQuality: (level: QualityLevel) => void;
  /** Terrain detail textures on/off. */
  setTerrainTextures: (on: boolean) => void;
  /** The five giant trees: id, name, kind and world position. */
  giants: () => Array<{ id: string; name: string; kind: string; x: number; z: number }>;
  /** Moves the player to world meters (x, z), like a minimap click. */
  teleport: (x: number, z: number) => void;
  /** True once every chunk wanted around the player is loaded. */
  isSettled: () => boolean;
  debug: () => DebugSnapshot;
  hud: () => HudSnapshot;
  /**
   * Casts a ray straight down at the player against the rendered terrain
   * meshes: `meshY` is the ground the player is drawn on, `playerY` where the
   * game thinks the ground is, `smoothY` the old heightAt() value. Null if no
   * terrain is loaded under the player.
   */
  groundCheck: () => { playerY: number; meshY: number; smoothY: number } | null;
  /** Pushes a music plot layer on top of the zones (null pops it again). */
  setMusicLayer: (name: string | null) => void;
  /** Ends the current pause between pieces, so music starts at once. */
  musicSkipGap: () => void;
  /** Sound: unlocked after the first click/key, context state, mute and volumes; zone and track once music is in. */
  audio: () => {
    unlocked: boolean;
    state: string;
    muted: boolean;
    volumes: AudioVolumes;
    /** Music zone the player is in now, the one the music follows (after the hold), the plot layer or zone it plays for, and the piece id. */
    zoneRaw: string | null;
    zone: string | null;
    target: string | null;
    track: string | null;
    musicTime: number;
    /** The avatar's voice: idle, humming or talking, and how many times it has sounded. */
    voice: string;
    voiceCount: number;
    /** Ambience levels (gain) and footsteps played so far, with the last surface. */
    wind: number;
    rain: number;
    snow: number;
    steps: number;
    lastStep: string | null;
  };
}

declare global {
  interface Window {
    __duskwood?: DuskwoodTestApi;
  }
}
