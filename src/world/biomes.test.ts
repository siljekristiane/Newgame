import { describe, expect, it } from 'vitest';
import { CLIMATE, WORLD_SIZE } from '../config/world';
import { biomeAt, climateAt, surfaceAt, surfaceColor } from './biomes';

const sum = (s: ReturnType<typeof surfaceAt>) => s.grass + s.dirt + s.rock + s.sand + s.snow;

describe('climate', () => {
  it('is colder higher up (lapse rate) and further north', () => {
    const low = climateAt(50_000, 50_000, 0);
    const high = climateAt(50_000, 50_000, 1_000);
    expect(low.temperature - high.temperature).toBeCloseTo(1_000 * CLIMATE.lapseRate, 6);
    expect(climateAt(50_000, WORLD_SIZE * 0.1, 0).temperature).toBeLessThan(climateAt(50_000, WORLD_SIZE * 0.9, 0).temperature + CLIMATE.temperatureVariation);
  });

  it('keeps moisture in 0..1 and is deterministic', () => {
    for (let i = 0; i < 200; i++) {
      const c = climateAt(i * 497, i * 311, i);
      expect(c.moisture).toBeGreaterThanOrEqual(0);
      expect(c.moisture).toBeLessThanOrEqual(1);
      expect(climateAt(i * 497, i * 311, i)).toEqual(c);
    }
  });
});

describe('surface materials', () => {
  it('always sum to 1', () => {
    for (let i = 0; i < 500; i++) {
      const s = surfaceAt(i * 173.3, i * 91.7, (i % 50) * 30 - 20, (i % 11) / 10);
      expect(sum(s)).toBeCloseTo(1, 6);
      for (const k of ['grass', 'dirt', 'rock', 'sand', 'snow'] as const) expect(s[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it('put rock on cliffs, sand on beaches and the sea floor, snow where it is freezing', () => {
    expect(surfaceAt(50_000, 50_000, 200, 0.6).rock).toBeGreaterThan(0.9);
    expect(surfaceAt(50_000, 50_000, 1, 0.02).sand).toBeGreaterThan(0.8);
    expect(surfaceAt(50_000, 50_000, -30, 0.02).sand).toBe(1);
    // 3 000 m up is well below freezing anywhere in this world.
    expect(surfaceAt(50_000, 20_000, 3_000, 0.05).snow).toBeGreaterThan(0.9);
    expect(surfaceAt(50_000, 50_000, 150, 0.02).grass).toBeGreaterThan(0.3);
  });

  it('classifies biomes', () => {
    expect(biomeAt({ temperature: 10, moisture: 0.5 }, -5, 0)).toBe('ocean');
    expect(biomeAt({ temperature: 10, moisture: 0.5 }, 2, 0.05)).toBe('beach');
    expect(biomeAt({ temperature: -3, moisture: 0.5 }, 900, 0.1)).toBe('snow');
    expect(biomeAt({ temperature: 10, moisture: 0.8 }, 100, 0.1)).toBe('forest');
    expect(biomeAt({ temperature: 10, moisture: 0.2 }, 100, 0.1)).toBe('dryland');
    expect(biomeAt({ temperature: 10, moisture: 0.5 }, 100, 0.1)).toBe('grassland');
  });

  it('produces valid colours', () => {
    const out = new Float32Array(3);
    surfaceColor(surfaceAt(40_000, 60_000, 120, 0.1), 40_000, 60_000, 120, out, 0);
    for (const c of out) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});
