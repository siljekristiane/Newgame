import { SPAWN } from '../config/world';
import { heightAt } from '../world/terrain';

/**
 * Per-frame mutable state. It changes 60 times a second, so it lives outside
 * React: systems read and write it inside useFrame, and the HUD gets a
 * throttled snapshot through the store (see useGameStore).
 *
 * Coordinate spaces:
 * - world:  meters, 0..WORLD_SIZE, stored as JS numbers (float64, exact enough for 500 km).
 * - render: world minus `origin`. Everything handed to Three.js is in render
 *   space, so the GPU (float32) only ever sees numbers within a few km of 0.
 */
export const player = {
  x: SPAWN.x,
  z: SPAWN.z,
  y: Math.max(0, heightAt(SPAWN.x, SPAWN.z)),
  heading: 0,
  speed: 0,
};

/** The floating origin: world position of render-space (0, 0, 0). */
export const origin = { x: SPAWN.x, z: SPAWN.z, version: 0 };

export const cameraRig = {
  yaw: 0, // radians, 0 = looking north (-Z)
  pitch: 0.35, // radians above the horizon
  distance: 22, // meters behind the player
};

export const input = {
  keys: new Set<string>(),
};

export function rebaseOrigin(x: number, z: number): void {
  origin.x = x;
  origin.z = z;
  origin.version++;
}
