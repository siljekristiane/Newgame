import { describe, expect, it } from 'vitest';
import { WEATHER } from '../config/world';
import { snowFraction, weatherAt } from './weather';

describe('weather', () => {
  it('is deterministic and changes smoothly', () => {
    expect(weatherAt(37.5)).toEqual(weatherAt(37.5));
    for (let h = 0; h < 200; h += 0.25) {
      const a = weatherAt(h);
      const b = weatherAt(h + 1 / 60); // one game minute later
      expect(Math.abs(a.cloudCover - b.cloudCover)).toBeLessThan(0.02);
    }
  });

  it('has clear and overcast spells, and rain only when overcast', () => {
    const covers = Array.from({ length: 2000 }, (_, i) => weatherAt(i * 0.5));
    expect(Math.min(...covers.map((w) => w.cloudCover))).toBeLessThan(0.15);
    expect(Math.max(...covers.map((w) => w.cloudCover))).toBeGreaterThan(0.85);
    for (const w of covers) {
      if (w.cloudCover < WEATHER.rainCover) expect(w.precipitation).toBe(0);
    }
    expect(covers.some((w) => w.precipitation > 0.5)).toBe(true);
  });

  it('can be forced, and the wind blows harder in bad weather', () => {
    expect(weatherAt(10, 'clear').precipitation).toBe(0);
    expect(weatherAt(10, 'rain').precipitation).toBeGreaterThan(0.5);
    const calm = weatherAt(10, 'clear');
    const storm = weatherAt(10, 'rain');
    expect(Math.hypot(storm.windX, storm.windZ)).toBeGreaterThan(Math.hypot(calm.windX, calm.windZ));
  });

  it('turns rain into snow around freezing', () => {
    expect(snowFraction(5)).toBe(0);
    expect(snowFraction(0)).toBeCloseTo(0.5);
    expect(snowFraction(-5)).toBe(1);
  });
});
