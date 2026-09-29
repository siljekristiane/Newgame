import { create } from 'zustand';
import { SPAWN } from '../config/world';
import { clampToWorld } from '../world/chunkMath';
import { player } from './runtime';

export interface HudSnapshot {
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  cx: number;
  cz: number;
}

/** Performance and streaming numbers for the F3 panel and the e2e measurements. */
export interface DebugSnapshot {
  fps: number;
  frameMs: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  /** JS heap in MB (Chrome only), else null. */
  heapMb: number | null;
  loadedChunks: number;
  pendingChunks: number;
  lodCounts: number[];
  /** ms from the last start/teleport until every wanted chunk was loaded; null while streaming. */
  settleMs: number | null;
}

interface GameState {
  hud: HudSnapshot;
  debug: DebugSnapshot;
  showDebug: boolean;
  travelMode: boolean;
  minimap: ImageData | null;
  /** performance.now() of the last start or teleport, for the settle-time measurement. */
  lastJumpAt: number;
  setHud: (hud: HudSnapshot) => void;
  setDebug: (debug: DebugSnapshot) => void;
  toggleDebug: () => void;
  toggleTravelMode: () => void;
  setMinimap: (image: ImageData) => void;
  teleport: (x: number, z: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  hud: { x: SPAWN.x, z: SPAWN.z, y: 0, heading: 0, speed: 0, cx: 0, cz: 0 },
  debug: {
    fps: 0,
    frameMs: 0,
    frameMsP95: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    heapMb: null,
    loadedChunks: 0,
    pendingChunks: 0,
    lodCounts: [],
    settleMs: null,
  },
  showDebug: true,
  travelMode: false,
  minimap: null,
  lastJumpAt: 0,
  setHud: (hud) => set({ hud }),
  setDebug: (debug) => set({ debug }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  toggleTravelMode: () => set((s) => ({ travelMode: !s.travelMode })),
  setMinimap: (minimap) => set({ minimap }),
  teleport: (x, z) => {
    // The game loop notices the jump and rebases the origin on its next frame.
    player.x = clampToWorld(x);
    player.z = clampToWorld(z);
    set({ lastJumpAt: performance.now() });
  },
}));
