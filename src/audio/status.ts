import type { StepSurface } from './footsteps';
import type { MusicZone } from './playlist';

/** What the sound systems are doing right now (read by the test hook and F3). */
export const soundStatus = {
  wind: 0,
  rain: 0,
  snow: 0,
  steps: 0,
  lastStep: null as StepSurface | null,
  /** Music: the zone right now, the zone the music follows (after the hold), the layer or zone it plays for, and the piece. */
  zoneRaw: null as MusicZone | null,
  zone: null as MusicZone | null,
  target: null as string | null,
  track: null as string | null,
};
