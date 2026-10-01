import { describe, expect, it } from 'vitest';
import { AUDIO, WEATHER } from '../config/world';
import { gust, rainSound, synthRainLoop, windSound } from './ambience';

describe('ambience', () => {
  it('blows louder and brighter in a storm and higher up', () => {
    const calm = windSound(0, 0, 0.5);
    const storm = windSound(WEATHER.windStorm, 0, 0.5);
    const peak = windSound(WEATHER.windStorm * 0.3, 1_000, 0.5);
    expect(storm.gain).toBeGreaterThan(calm.gain * 3);
    expect(storm.cutoff).toBeGreaterThan(calm.cutoff);
    expect(peak.gain).toBeGreaterThan(windSound(WEATHER.windStorm * 0.3, 0, 0.5).gain);
    expect(storm.gain).toBeLessThanOrEqual(1);
  });

  it('gusts smoothly between 0 and 1', () => {
    for (let t = 0; t < 120; t += 0.37) {
      const g = gust(t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(Math.abs(gust(t + 1 / 60) - g)).toBeLessThan(0.02);
    }
  });

  it('rains when wet, hisses softly when it snows, is silent when dry', () => {
    expect(rainSound(0, 0)).toEqual({ rain: 0, snow: 0 });
    expect(rainSound(1, 0).rain).toBeCloseTo(AUDIO.rain.gain);
    const snowing = rainSound(1, 1);
    expect(snowing.rain).toBe(0);
    expect(snowing.snow).toBeGreaterThan(0);
  });

  it('makes a seamless rain loop', () => {
    const sr = 22_050;
    const loop = synthRainLoop(sr, 1);
    expect(loop.length).toBe(sr);
    expect(Math.max(...loop.map(Math.abs))).toBeCloseTo(0.8, 2);
    // The seam is no louder than the texture itself.
    expect(Math.abs(loop[0]! - loop[loop.length - 1]!)).toBeLessThan(0.8);
  });
});
