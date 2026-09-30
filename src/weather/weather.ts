import { WEATHER, WORLD_SEED } from '../config/world';
import { hash2 } from '../world/noise';

/**
 * Weather as a pure function of elapsed game time (tested): cloud cover
 * drifts between clear and overcast over hours, rain sets in when it is
 * heavily overcast, and the wind turns slowly and blows harder in bad weather.
 * A forced mode (F3) pins the cover; wind still varies.
 */

export type WeatherMode = 'auto' | 'clear' | 'cloudy' | 'rain';

export interface Weather {
  /** 0 = clear sky … 1 = overcast. */
  cloudCover: number;
  /** 0 = dry … 1 = heavy rain (or snow where it is below freezing). */
  precipitation: number;
  /** Wind in m/s, world X and Z. */
  windX: number;
  windZ: number;
}

/** Smooth 1D value noise, 0..1. */
function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash2(i, 0, seed) * (1 - u) + hash2(i + 1, 0, seed) * u;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const FORCED: Record<Exclude<WeatherMode, 'auto'>, number> = { clear: 0.08, cloudy: 0.62, rain: 0.95 };

export function weatherAt(elapsedHours: number, mode: WeatherMode = 'auto'): Weather {
  const s = WORLD_SEED + 1_300;
  const slow = noise1(elapsedHours / WEATHER.changeHours, s);
  const fast = noise1(elapsedHours / (WEATHER.changeHours / 4), s + 1);
  // Squared: fair weather is more common than overcast, and rain rarer still.
  const auto = Math.min(1, Math.max(0, slow * slow * 1.15 + (fast - 0.5) * 0.25));
  const cloudCover = mode === 'auto' ? auto : FORCED[mode];
  const precipitation = smooth(WEATHER.rainCover, 1, cloudCover);
  const direction = noise1(elapsedHours / 20, s + 2) * Math.PI * 4;
  const speed = WEATHER.windCalm + (WEATHER.windStorm - WEATHER.windCalm) * cloudCover * (0.6 + 0.4 * noise1(elapsedHours / 2, s + 3));
  return { cloudCover, precipitation, windX: Math.cos(direction) * speed, windZ: Math.sin(direction) * speed };
}
