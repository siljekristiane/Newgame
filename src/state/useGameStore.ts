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
  fps: number;
  loadedChunks: number;
  pendingChunks: number;
  lodCounts: number[];
}

interface GameState {
  hud: HudSnapshot;
  travelMode: boolean;
  minimap: ImageData | null;
  setHud: (hud: HudSnapshot) => void;
  toggleTravelMode: () => void;
  setMinimap: (image: ImageData) => void;
  teleport: (x: number, z: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  hud: {
    x: SPAWN.x,
    z: SPAWN.z,
    y: 0,
    heading: 0,
    speed: 0,
    cx: 0,
    cz: 0,
    fps: 0,
    loadedChunks: 0,
    pendingChunks: 0,
    lodCounts: [],
  },
  travelMode: false,
  minimap: null,
  setHud: (hud) => set({ hud }),
  toggleTravelMode: () => set((s) => ({ travelMode: !s.travelMode })),
  setMinimap: (minimap) => set({ minimap }),
  teleport: (x, z) => {
    // The game loop notices the jump and rebases the origin on its next frame.
    player.x = clampToWorld(x);
    player.z = clampToWorld(z);
  },
}));
