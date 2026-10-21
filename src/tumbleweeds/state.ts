import type { TumbleImpact, Tumbleweed } from './sim';

/**
 * What the tumbleweeds are doing this frame, for the sound and the test hook
 * (written by Tumbleweeds.tsx, read by TumbleweedSound.tsx and DebugProbe).
 */
export const tumbleweedState = {
  /** Live weeds (also the inactive ones in the pool). */
  weeds: [] as Tumbleweed[],
  active: 0,
  /** 0..1: how much rolling there is close to the player. */
  rustle: 0,
  /** Bounces and kicks since the sound last read them. */
  impacts: [] as TumbleImpact[],
  /** Kicks by the player since the start (tests). */
  kicks: 0,
};
