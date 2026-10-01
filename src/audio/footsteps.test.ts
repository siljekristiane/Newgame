import { describe, expect, it } from 'vitest';
import { AUDIO, PLAYER, SEA_LEVEL } from '../config/world';
import { spawnLayout } from '../regions/spawn/layout';
import { groundHeightAt } from '../world/ground';
import { zeroCrossingRate } from './dsp';
import { STEP_SURFACES, stepCadence, surfaceUnderfoot, synthFootstep } from './footsteps';

describe('footsteps', () => {
  it('step faster when running, and not at all standing still or fast-travelling', () => {
    expect(stepCadence(0)).toBe(0);
    expect(stepCadence(PLAYER.walkSpeed)).toBeGreaterThan(1.5);
    expect(stepCadence(PLAYER.runSpeed)).toBeGreaterThan(stepCadence(PLAYER.walkSpeed));
    expect(stepCadence(PLAYER.travelSpeed)).toBe(0);
    expect(stepCadence(AUDIO.steps.maxSpeed + 1)).toBe(0);
  });

  it('know what is underfoot: paving, gravel paths, open ground and water', () => {
    const { plaza, paths } = spawnLayout();
    expect(surfaceUnderfoot(plaza.x, plaza.z, groundHeightAt(plaza.x, plaza.z))).toBe('paving');
    const p = paths[0]![80]!;
    expect(surfaceUnderfoot(p.x, p.z, groundHeightAt(p.x, p.z))).toBe('gravel');
    expect(surfaceUnderfoot(50_000, 70_000, SEA_LEVEL)).toBe('water');
    const meadow = surfaceUnderfoot(plaza.x + 60, plaza.z + 90, groundHeightAt(plaza.x + 60, plaza.z + 90));
    expect(['grass', 'dirt']).toContain(meadow);
  });

  it('synthesise distinct, safe step sounds per surface', () => {
    const sr = 44_100;
    for (const s of STEP_SURFACES) {
      const a = synthFootstep(s, 0, sr);
      const b = synthFootstep(s, 1, sr);
      expect(a.length).toBeGreaterThan(sr * 0.05);
      expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(0.9001);
      expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(0.2);
      expect(a).not.toEqual(b); // variants differ
    }
    // Hard, crunchy ground is brighter than soft ground.
    const zcr = (s: (typeof STEP_SURFACES)[number]) => zeroCrossingRate(synthFootstep(s, 0, sr));
    expect(zcr('gravel')).toBeGreaterThan(zcr('sand'));
    expect(zcr('paving')).toBeGreaterThan(zcr('dirt'));
  });
});
