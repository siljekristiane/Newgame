import { create } from 'zustand';
import { SPAWN, TIME } from '../config/world';
import { clampToWorld } from '../world/chunkMath';
import { clock, player } from './runtime';
import type { WeatherMode } from '../weather/weather';
import { QUALITY, type QualityLevel } from '../config/world';
import { saveQuality } from '../settings/quality';
import { loadAudioSettings, saveAudioSettings, type AudioChannel, type AudioSettings } from '../audio/mixer';

export interface HudSnapshot {
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  cx: number;
  cz: number;
  /** In-game time, hours 0..24. */
  hours: number;
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
  /** Chunks kept in the LRU cache after leaving the view. */
  cachedChunks: number;
  lodCounts: number[];
  /** ms from the last start/teleport until every wanted chunk was loaded; null while streaming. */
  settleMs: number | null;
  /** Terrain detail textures generated and switched on. */
  terrainTextures: boolean;
}

interface GameState {
  hud: HudSnapshot;
  debug: DebugSnapshot;
  showDebug: boolean;
  travelMode: boolean;
  /** Debug: terrain geomorphing between LODs. */
  geomorph: boolean;
  /** Terrain detail textures: `detailReady` once generated, `detailOn` is the F3 switch. */
  detailReady: boolean;
  detailOn: boolean;
  /** Sun shadows near the player (F3 switch). */
  shadows: boolean;
  /** Trees, bushes and boulders (F3 switch). */
  vegetation: boolean;
  /** The mouse is captured (pointer lock): it turns the camera until Esc. */
  pointerLocked: boolean;
  /** Weather: 'auto' follows the weather model; the others pin it (F3). */
  weatherMode: WeatherMode;
  /** Quality preset (null until detected from the GPU at start). */
  quality: QualityLevel | null;
  /** Grass tufts round the player (part of the quality presets). */
  grass: boolean;
  /** Channel volumes and mute (U); kept in this browser. */
  audio: AudioSettings;
  /** Sound can play (the player has clicked or pressed a key once). */
  audioUnlocked: boolean;
  timePaused: boolean;
  minimap: ImageData | null;
  /** Sharper world map for the big map (M), made after the minimap. */
  bigMap: ImageData | null;
  minimapOpen: boolean;
  /** The position panel (top left); P toggles it, H both panels. Not remembered between visits. */
  positionOpen: boolean;
  bigMapOpen: boolean;
  /** performance.now() of the last start or teleport, for the settle-time measurement. */
  lastJumpAt: number;
  setHud: (hud: HudSnapshot) => void;
  setDebug: (debug: DebugSnapshot) => void;
  toggleDebug: () => void;
  toggleTravelMode: () => void;
  setGeomorph: (on: boolean) => void;
  setDetailReady: (ready: boolean) => void;
  setDetailOn: (on: boolean) => void;
  setShadows: (on: boolean) => void;
  setVegetation: (on: boolean) => void;
  setPointerLocked: (locked: boolean) => void;
  setWeatherMode: (mode: WeatherMode) => void;
  /** Applies a preset: pixel ratio, shadows, textures, vegetation, grass. `remember` stores the choice in this browser. */
  setQuality: (level: QualityLevel, remember?: boolean) => void;
  setGrass: (on: boolean) => void;
  setVolume: (channel: AudioChannel, volume: number) => void;
  toggleMute: () => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  /** Sets the in-game clock (hours 0..24); `paused` stops it from advancing. */
  setTime: (hours: number, paused?: boolean) => void;
  setMinimap: (image: ImageData) => void;
  setBigMap: (image: ImageData) => void;
  toggleMinimap: () => void;
  togglePosition: () => void;
  /** Hides both the minimap and the position panel, or shows both if either is hidden. */
  toggleHudPanels: () => void;
  setBigMapOpen: (open: boolean) => void;
  teleport: (x: number, z: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  hud: { x: SPAWN.x, z: SPAWN.z, y: 0, heading: 0, speed: 0, cx: 0, cz: 0, hours: TIME.startHour },
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
    cachedChunks: 0,
    lodCounts: [],
    settleMs: null,
    terrainTextures: false,
  },
  showDebug: false,
  travelMode: false,
  geomorph: true,
  detailReady: false,
  detailOn: true,
  shadows: true,
  vegetation: true,
  pointerLocked: false,
  weatherMode: 'auto',
  quality: null,
  grass: true,
  audio: loadAudioSettings(),
  audioUnlocked: false,
  timePaused: false,
  minimap: null,
  bigMap: null,
  minimapOpen: true,
  positionOpen: true,
  bigMapOpen: false,
  lastJumpAt: 0,
  setHud: (hud) => set({ hud }),
  setDebug: (debug) => set({ debug }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  toggleTravelMode: () => set((s) => ({ travelMode: !s.travelMode })),
  setGeomorph: (geomorph) => set({ geomorph }),
  setDetailReady: (detailReady) => set({ detailReady }),
  setDetailOn: (detailOn) => set({ detailOn }),
  setShadows: (shadows) => set({ shadows }),
  setVegetation: (vegetation) => set({ vegetation }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setWeatherMode: (weatherMode) => set({ weatherMode }),
  setQuality: (level, remember = true) => {
    const q = QUALITY[level];
    if (remember) saveQuality(level);
    set({ quality: level, shadows: q.shadows, detailOn: q.textures, vegetation: q.vegetation, grass: q.grass });
  },
  setGrass: (grass) => set({ grass }),
  setVolume: (channel, volume) =>
    set((s) => {
      const audio = { ...s.audio, volumes: { ...s.audio.volumes, [channel]: Math.min(1, Math.max(0, volume)) } };
      saveAudioSettings(audio);
      return { audio };
    }),
  toggleMute: () =>
    set((s) => {
      const audio = { ...s.audio, muted: !s.audio.muted };
      saveAudioSettings(audio);
      return { audio };
    }),
  setAudioUnlocked: (audioUnlocked) => set({ audioUnlocked }),
  setTime: (hours, paused) => {
    clock.hours = ((hours % 24) + 24) % 24;
    if (paused !== undefined) clock.paused = paused;
    set((s) => ({ timePaused: clock.paused, hud: { ...s.hud, hours: clock.hours } }));
  },
  setMinimap: (minimap) => set({ minimap }),
  setBigMap: (bigMap) => set({ bigMap }),
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
  togglePosition: () => set((s) => ({ positionOpen: !s.positionOpen })),
  toggleHudPanels: () =>
    set((s) => {
      const show = !(s.minimapOpen && s.positionOpen);
      return { minimapOpen: show, positionOpen: show };
    }),
  setBigMapOpen: (bigMapOpen) => set({ bigMapOpen }),
  teleport: (x, z) => {
    // The game loop notices the jump and rebases the origin on its next frame.
    player.x = clampToWorld(x);
    player.z = clampToWorld(z);
    set({ lastJumpAt: performance.now() });
  },
}));
