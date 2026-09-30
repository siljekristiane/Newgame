import { describe, expect, it } from 'vitest';
import { TIME } from '../config/world';
import { lightingAt, wrapHours } from './timeOfDay';

const deg = (r: number) => (r * 180) / Math.PI;

describe('time of day', () => {
  it('rises in the east, peaks in the south at noon, sets in the west', () => {
    const dawn = lightingAt(6);
    expect(deg(dawn.sunElevation)).toBeCloseTo(0, 5);
    expect(dawn.sunDirection[0]).toBeGreaterThan(0.9); // east = +X
    const noon = lightingAt(12);
    expect(deg(noon.sunElevation)).toBeCloseTo(TIME.maxSunElevation, 5);
    expect(noon.sunDirection[2]).toBeGreaterThan(0); // south = +Z
    expect(lightingAt(18).sunDirection[0]).toBeLessThan(-0.9); // west
    expect(lightingAt(0).sunElevation).toBeLessThan(0);
  });

  it('keeps directions unit length', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const l = lightingAt(h);
      expect(Math.hypot(...l.sunDirection)).toBeCloseTo(1, 6);
      expect(Math.hypot(...l.moonDirection)).toBeCloseTo(1, 6);
    }
  });

  it('is bright by day, dark and moonlit at night', () => {
    const noon = lightingAt(12);
    const midnight = lightingAt(0);
    expect(noon.sunIntensity).toBeCloseTo(TIME.sunIntensity, 5);
    expect(noon.night).toBe(0);
    expect(midnight.sunIntensity).toBe(0);
    expect(midnight.night).toBeCloseTo(1, 5);
    expect(midnight.moonIntensity).toBeGreaterThan(0);
    const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(lum(noon.zenithColor)).toBeGreaterThan(lum(midnight.zenithColor) * 4);
  });

  it('turns the horizon golden near sunset and the sun orange', () => {
    const evening = lightingAt(17.6);
    const noon = lightingAt(12);
    expect(evening.horizonColor[0] - evening.horizonColor[2]).toBeGreaterThan(noon.horizonColor[0] - noon.horizonColor[2]);
    expect(evening.sunColor[2]).toBeLessThan(noon.sunColor[2]);
  });

  it('wraps hours', () => {
    expect(wrapHours(25)).toBe(1);
    expect(wrapHours(-1)).toBe(23);
  });
});
