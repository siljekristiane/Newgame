import { AVATAR, SPAWN, TIME } from '../config/world';
import { groundHeightAt } from '../world/ground';
import { createMoveState } from '../player/movement';
import { weatherAt, type Weather } from '../weather/weather';

/**
 * Per-frame mutable state. It changes 60 times a second, so it lives outside
 * React: systems read and write it inside useFrame, and the HUD gets a
 * throttled snapshot through the store (see useGameStore).
 *
 * Coordinate spaces:
 * - world:  meters, 0..WORLD_SIZE, stored as JS numbers (float64, far more precise than a 100 km world needs).
 * - render: world minus `origin`. Everything handed to Three.js is in render
 *   space, so the GPU (float32) only ever sees numbers within a few km of 0.
 */
export const player = {
  x: SPAWN.x,
  z: SPAWN.z,
  y: Math.max(0, groundHeightAt(SPAWN.x, SPAWN.z)),
  heading: 0,
  speed: 0,
};

/** Velocity, jump and facing, advanced by player/movement.ts. */
export const motion = createMoveState();

/** The floating origin: world position of render-space (0, 0, 0). */
export const origin = { x: SPAWN.x, z: SPAWN.z, version: 0 };

export const cameraRig = {
  yaw: 0, // radians, 0 = looking north (-Z)
  pitch: 0.35, // radians above the horizon
  distance: AVATAR.camera.defaultDistance as number, // meters from the focus point (scroll zooms)
};

/** In-game clock: hours 0..24, plus game hours elapsed in total (weather). Advanced by GameLoop unless paused. */
export const clock = {
  hours: TIME.startHour as number,
  elapsed: 0,
  paused: false,
};

/** Current weather (weather/weather.ts), updated by GameLoop. */
export const weather: Weather = weatherAt(0);

/** Wind-blown offset of the cloud layer, meters (wraps; see Atmosphere). */
export const cloudDrift = { x: 0, z: 0 };

export const input = {
  keys: new Set<string>(),
};

export function rebaseOrigin(x: number, z: number): void {
  origin.x = x;
  origin.z = z;
  origin.version++;
}
