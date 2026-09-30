import type { DebugSnapshot, HudSnapshot } from '../state/useGameStore';
import type { WeatherMode } from '../weather/weather';
import type { QualityLevel } from '../config/world';

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
  /** Trees, bushes and boulders on/off. */
  setVegetation: (on: boolean) => void;
  /** Pins the weather ('auto' = follow the weather model). */
  setWeather: (mode: WeatherMode) => void;
  /** Applies a quality preset (not remembered). */
  setQuality: (level: QualityLevel) => void;
  /** Terrain detail textures on/off. */
  setTerrainTextures: (on: boolean) => void;
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
}

declare global {
  interface Window {
    __duskwood?: DuskwoodTestApi;
  }
}
