import { TIME } from '../config/world';
import { atmosphere, hexToRgb } from '../design/tokens';

/**
 * Sun, sky and light as a pure function of the in-game hour (0..24).
 * No three.js here: colours are linear-free sRGB triples 0..1, so the
 * renderer decides colour management. Tested in timeOfDay.test.ts.
 */

export type Rgb = [number, number, number];

export interface Lighting {
  /** Unit vector toward the sun (Y up, X east, Z south). */
  sunDirection: [number, number, number];
  /** Sun elevation in radians (negative below the horizon). */
  sunElevation: number;
  sunColor: Rgb;
  sunIntensity: number;
  /** Unit vector toward the moon (opposite the sun) and its light. */
  moonDirection: [number, number, number];
  moonIntensity: number;
  zenithColor: Rgb;
  horizonColor: Rgb;
  groundColor: Rgb;
  /** Colour of the light from the sky dome (softer than the zenith itself). */
  skyLightColor: Rgb;
  /** Hemisphere (sky) light intensity. */
  ambientIntensity: number;
  /** 0 = day, 1 = full night: stars and moonlight fade in with it. */
  night: number;
  exposure: number;
}

const C = Object.fromEntries(Object.entries(atmosphere).map(([k, v]) => [k, hexToRgb(v)])) as Record<keyof typeof atmosphere, Rgb>;

export function wrapHours(h: number): number {
  return ((h % 24) + 24) % 24;
}

export function lightingAt(hours: number): Lighting {
  const h = wrapHours(hours);
  // Angle around the sky: 0 at 6:00 (east), π/2 at noon (south), π at 18:00 (west).
  const a = ((h - 6) / 12) * Math.PI;
  const maxElev = (TIME.maxSunElevation * Math.PI) / 180;
  const elevation = Math.asin(Math.sin(a) * Math.sin(maxElev));
  const horizontal = Math.cos(elevation);
  // Azimuth swings from east through south to west.
  const east = Math.cos(a);
  const south = Math.sin(a) * Math.cos(maxElev);
  const hl = Math.hypot(east, south) || 1;
  const sunDirection: [number, number, number] = [(east / hl) * horizontal, Math.sin(elevation), (south / hl) * horizontal];
  const moonDirection: [number, number, number] = [-sunDirection[0], Math.max(0.15, -sunDirection[1]), -sunDirection[2]];

  const e = elevation;
  const day = smooth(-0.02, 0.25, e); // 0 at sunset … 1 when the sun is well up
  const golden = smooth(0.35, 0.05, e) * smooth(-0.1, 0.02, e); // strongest just above the horizon
  const night = smooth(-0.02, -0.25, e);

  const zenithColor = mix3(mix3(C.zenithNight, C.zenithTwilight, 1 - night), C.zenithDay, day);
  let horizonColor = mix3(mix3(C.horizonNight, C.horizonTwilight, 1 - night), C.horizonDay, day);
  horizonColor = mix3(horizonColor, C.horizonGolden, golden * 0.8);
  const sunColor = mix3(C.sunLow, C.sunHigh, smooth(0.05, 0.6, e));
  const sunIntensity = TIME.sunIntensity * smooth(-0.03, 0.12, e);
  const moonIntensity = TIME.moonIntensity * night;
  // Twilight: the sun is just below or above the horizon but the sky is still bright.
  const twilight = smooth(-0.3, -0.03, e) * smooth(0.3, 0.02, e);
  const ambientIntensity = 0.25 + 0.9 * day + 0.15 * golden + 0.6 * twilight;
  // Skylight averages the whole dome, so it is paler than the zenith.
  const skyLightColor = mix3(zenithColor, horizonColor, 0.55);
  const groundColor = mix3([0.02, 0.02, 0.03], C.groundBounce, 0.3 + 0.7 * day);
  const exposure = mix(TIME.exposureNight, TIME.exposureDay, day);

  return {
    sunDirection,
    sunElevation: elevation,
    sunColor,
    sunIntensity,
    moonDirection: normalize(moonDirection),
    moonIntensity,
    zenithColor,
    horizonColor,
    groundColor,
    skyLightColor,
    ambientIntensity,
    night,
    exposure,
  };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
