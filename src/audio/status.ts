import type { StepSurface } from './footsteps';

/** What the sound systems are doing right now (read by the test hook and F3). */
export const soundStatus = {
  wind: 0,
  rain: 0,
  snow: 0,
  steps: 0,
  lastStep: null as StepSurface | null,
};
