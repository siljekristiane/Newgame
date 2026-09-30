import { PLAYER } from '../config/world';

/**
 * The player's movement as a pure step function (tested in movement.test.ts):
 * smooth acceleration toward the wanted velocity, a turn toward the direction
 * of travel at a limited rate, slower going uphill, and a jump with gravity.
 */

export interface MoveState {
  /** Horizontal velocity, m/s (world X and Z). */
  vx: number;
  vz: number;
  /** Height above the ground (0 = standing) and vertical speed while in the air. */
  air: number;
  vy: number;
  /** Facing, radians (0 = +Z, like atan2(dx, dz)). */
  heading: number;
}

export interface MoveInput {
  /** Wanted direction (unit or zero) in world X/Z. */
  dirX: number;
  dirZ: number;
  speed: number;
  jump: boolean;
  /** Ground slope along the wanted direction: rise per meter. */
  slope: number;
}

export function createMoveState(): MoveState {
  return { vx: 0, vz: 0, air: 0, vy: 0, heading: 0 };
}

/** Wraps an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function stepMovement(s: MoveState, input: MoveInput, dt: number): void {
  // Uphill is slower (down to 40 % at 45°), downhill a little faster.
  const hill = input.slope > 0 ? Math.max(0.4, 1 - input.slope * 0.6) : Math.min(1.15, 1 - input.slope * 0.15);
  const target = input.speed * hill;
  const wantX = input.dirX * target;
  const wantZ = input.dirZ * target;
  // Exponential approach: quick to start, a short glide to stop. Less grip in the air.
  const moving = input.dirX !== 0 || input.dirZ !== 0;
  const rate = (moving ? PLAYER.acceleration : PLAYER.deceleration) * (s.air > 0 ? 0.25 : 1);
  const k = 1 - Math.exp(-rate * dt);
  s.vx += (wantX - s.vx) * k;
  s.vz += (wantZ - s.vz) * k;
  if (!moving && Math.hypot(s.vx, s.vz) < 0.05) s.vx = s.vz = 0;

  if (moving) {
    const want = Math.atan2(input.dirX, input.dirZ);
    const diff = wrapAngle(want - s.heading);
    const maxTurn = PLAYER.turnRate * dt;
    s.heading = wrapAngle(s.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }

  if (input.jump && s.air === 0) s.vy = PLAYER.jumpSpeed;
  if (s.air > 0 || s.vy > 0) {
    s.vy -= PLAYER.gravity * dt;
    s.air += s.vy * dt;
    if (s.air <= 0) {
      s.air = 0;
      s.vy = 0;
    }
  }
}
