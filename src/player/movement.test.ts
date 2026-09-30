import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config/world';
import { createMoveState, stepMovement, wrapAngle, type MoveInput } from './movement';

const run = (input: MoveInput, seconds: number, s = createMoveState()) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepMovement(s, input, 1 / 60);
  return s;
};

const north: MoveInput = { dirX: 0, dirZ: -1, speed: PLAYER.walkSpeed, jump: false, slope: 0 };

describe('player movement', () => {
  it('accelerates smoothly to the wanted speed', () => {
    const early = run(north, 0.05);
    expect(Math.hypot(early.vx, early.vz)).toBeGreaterThan(0);
    expect(Math.hypot(early.vx, early.vz)).toBeLessThan(PLAYER.walkSpeed * 0.9);
    const later = run(north, 1);
    expect(later.vz).toBeCloseTo(-PLAYER.walkSpeed, 1);
  });

  it('glides briefly to a stop and then stands still', () => {
    const s = run(north, 1);
    run({ ...north, dirZ: 0 }, 0.1, s);
    expect(Math.abs(s.vz)).toBeGreaterThan(0.1);
    run({ ...north, dirZ: 0 }, 2, s);
    expect(s.vz).toBe(0);
  });

  it('turns toward the direction of travel the short way, at a limited rate', () => {
    const s = createMoveState();
    s.heading = Math.PI * 0.9;
    stepMovement(s, { ...north, dirZ: 0, dirX: 0.0001 }, 0); // no time: no turn
    expect(s.heading).toBeCloseTo(Math.PI * 0.9);
    run({ ...north, dirX: 0, dirZ: -1 }, 0.1, s); // north is heading π: the short way is +0.1π
    expect(Math.abs(wrapAngle(s.heading - Math.PI))).toBeLessThan(Math.PI * 0.1);
    run(north, 1, s);
    expect(Math.abs(wrapAngle(s.heading - Math.PI))).toBeLessThan(0.01);
  });

  it('is slower uphill', () => {
    const flat = run(north, 1);
    const up = run({ ...north, slope: 0.5 }, 1);
    expect(Math.abs(up.vz)).toBeLessThan(Math.abs(flat.vz) * 0.8);
  });

  it('jumps and lands', () => {
    const s = run({ ...north, jump: true }, 1 / 60);
    expect(s.vy).toBeGreaterThan(0);
    run(north, 0.2, s);
    expect(s.air).toBeGreaterThan(0.3);
    run(north, 2, s);
    expect(s.air).toBe(0);
    expect(s.vy).toBe(0);
  });
});
