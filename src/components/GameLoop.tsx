import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MINIMAP_RESOLUTION, PLAYER, REBASE_DISTANCE, SEA_LEVEL, TIME } from '../config/world';
import { cameraRig, clock, input, motion, origin, player, rebaseOrigin } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { clampToWorld, worldToChunk } from '../world/chunkMath';
import type { ChunkManager } from '../world/ChunkManager';
import { groundHeightAt } from '../world/ground';
import { stepMovement } from '../player/movement';
import { wrapHours } from '../world/timeOfDay';
import type { WorkerPool } from '../world/workerPool';

const HUD_INTERVAL = 0.2; // seconds

/**
 * The one place game state advances each frame, in this order:
 * input → player movement → floating-origin rebase → chunk streaming → HUD.
 * Runs at priority -1, before the render components read the new state.
 */
export function GameLoop({ manager, pool }: { manager: ChunkManager; pool: WorkerPool }) {
  const hudTimer = useRef(0);

  useEffect(() => {
    pool.buildMinimap(MINIMAP_RESOLUTION).then((pixels) => {
      useGameStore.getState().setMinimap(new ImageData(new Uint8ClampedArray(pixels), MINIMAP_RESOLUTION, MINIMAP_RESOLUTION));
    });
  }, [pool]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1); // a paused tab must not teleport the player
    const k = input.keys;

    // Camera turning from the keyboard.
    if (k.has('KeyQ') || k.has('ArrowLeft')) cameraRig.yaw += 1.8 * dt;
    if (k.has('KeyE') || k.has('ArrowRight')) cameraRig.yaw -= 1.8 * dt;

    // Movement relative to where the camera looks.
    let fwd = 0;
    let side = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD')) side += 1;
    if (k.has('KeyA')) side -= 1;

    const travel = useGameStore.getState().travelMode;
    const speed = travel ? PLAYER.travelSpeed : k.has('ShiftLeft') || k.has('ShiftRight') ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(fwd, side);
    let dirX = 0;
    let dirZ = 0;
    if (len > 0) {
      const s = Math.sin(cameraRig.yaw);
      const c = Math.cos(cameraRig.yaw);
      // forward = (-sin, -cos), right = (cos, -sin)
      dirX = (-s * fwd + c * side) / len;
      dirZ = (-c * fwd - s * side) / len;
    }
    // Slope ahead, on the ground the player is drawn on (or the flat sea).
    const here = Math.max(SEA_LEVEL, groundHeightAt(player.x, player.z));
    const slope = len > 0 ? Math.max(SEA_LEVEL, groundHeightAt(player.x + dirX, player.z + dirZ)) - here : 0;
    stepMovement(motion, { dirX, dirZ, speed, jump: k.has('Space'), slope }, dt);
    player.x = clampToWorld(player.x + motion.vx * dt);
    player.z = clampToWorld(player.z + motion.vz * dt);
    player.heading = motion.heading;
    player.speed = Math.hypot(motion.vx, motion.vz);
    // Stand on the ground (or the water surface), plus the height of a jump.
    player.y = Math.max(SEA_LEVEL, groundHeightAt(player.x, player.z)) + motion.air;

    // Floating origin: keep render-space coordinates small.
    if (Math.abs(player.x - origin.x) > REBASE_DISTANCE || Math.abs(player.z - origin.z) > REBASE_DISTANCE) {
      rebaseOrigin(Math.round(player.x), Math.round(player.z));
    }

    manager.update(player.x, player.z);

    if (!clock.paused) clock.hours = wrapHours(clock.hours + dt / TIME.secondsPerHour);

    hudTimer.current += rawDelta;
    if (hudTimer.current >= HUD_INTERVAL) {
      const { cx, cz } = worldToChunk(player.x, player.z);
      useGameStore.getState().setHud({
        x: player.x,
        z: player.z,
        y: player.y,
        heading: player.heading,
        speed: player.speed,
        cx,
        cz,
        hours: clock.hours,
      });
      hudTimer.current = 0;
    }
  }, -1);

  return null;
}
