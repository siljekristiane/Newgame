import type { DebugSnapshot, HudSnapshot } from '../state/useGameStore';

/**
 * A small window API for automated browser tests and measurements
 * (see e2e/). It only reads state or moves the player to a fixed view.
 */
export interface DuskwoodTestApi {
  views: string[];
  setView: (id: string) => boolean;
  /** True once every chunk wanted around the player is loaded. */
  isSettled: () => boolean;
  debug: () => DebugSnapshot;
  hud: () => HudSnapshot;
}

declare global {
  interface Window {
    __duskwood?: DuskwoodTestApi;
  }
}
