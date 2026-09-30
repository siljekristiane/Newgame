import { CLIMATE, SEA_LEVEL, WORLD_SEED, WORLD_SIZE } from '../config/world';
import { hexToRgb, terrainPalette } from '../design/tokens';
import { createNoise2D } from './noise';
import { fbm } from './terrain';

/**
 * Climate → biome → surface materials. Pure functions of position, height and
 * slope, so workers, the minimap and (later) vegetation placement all agree.
 */

const temperatureNoise = createNoise2D(WORLD_SEED + 10);
const moistureNoise = createNoise2D(WORLD_SEED + 11);
const patchNoise = createNoise2D(WORLD_SEED + 12);

export interface Climate {
  /** °C */
  temperature: number;
  /** 0 = arid, 1 = wet */
  moisture: number;
}

export function climateAt(x: number, z: number, height: number): Climate {
  const latitude = z / WORLD_SIZE - 0.5; // -0.5 north … +0.5 south
  const temperature =
    CLIMATE.seaLevelTemperature +
    latitude * CLIMATE.northSouthGradient +
    fbm(temperatureNoise, x / CLIMATE.temperatureScale, z / CLIMATE.temperatureScale, 3) * CLIMATE.temperatureVariation -
    Math.max(0, height) * CLIMATE.lapseRate;
  // Lowlands near the sea are a little wetter.
  const lowland = 1 - smooth(0, 120, height);
  const moisture = clamp01(0.5 + fbm(moistureNoise, x / CLIMATE.moistureScale, z / CLIMATE.moistureScale, 4) * 0.8 + lowland * 0.1);
  return { temperature, moisture };
}

export type Biome = 'ocean' | 'beach' | 'grassland' | 'dryland' | 'forest' | 'alpine' | 'snow';

export function biomeAt(climate: Climate, height: number, slope: number): Biome {
  if (height < SEA_LEVEL) return 'ocean';
  if (height < CLIMATE.beachHeight && slope < 0.2) return 'beach';
  if (climate.temperature < CLIMATE.snowTemperature) return 'snow';
  if (climate.temperature < 3 || slope > CLIMATE.rockSlope + 0.15) return 'alpine';
  if (climate.moisture > 0.62) return 'forest';
  if (climate.moisture < 0.38) return 'dryland';
  return 'grassland';
}

/** Blend weights of the five surface materials (they sum to 1), plus how lush the grass is. */
export interface Surface {
  grass: number;
  dirt: number;
  rock: number;
  sand: number;
  snow: number;
  /** 0 = dry, yellowed grass … 1 = dark, wet forest floor */
  lush: number;
}

/** `slope` is 1 - normal.y: 0 flat, ~0.3 at 45°, 1 vertical. */
export function surfaceAt(x: number, z: number, height: number, slope: number): Surface {
  const { temperature, moisture } = climateAt(x, z, height);
  const patches = patchNoise(x / 90, z / 90) * 0.5 + 0.5; // bare patches in dry ground

  let rock = smooth(CLIMATE.rockSlope - 0.08, CLIMATE.rockSlope + 0.1, slope);
  rock = Math.max(rock, smooth(4, -2, temperature) * 0.55); // above the tree line, stone shows through
  let snow = smooth(CLIMATE.snowTemperature + 1.5, CLIMATE.snowTemperature - 1.5, temperature);
  snow *= 1 - smooth(0.4, 0.6, slope); // snow slides off cliffs
  let sand = height < SEA_LEVEL ? 1 : smooth(CLIMATE.beachHeight, CLIMATE.beachHeight * 0.3, height) * (1 - smooth(0.12, 0.25, slope));
  let dirt = (1 - moisture) * smooth(0.45, 0.8, patches) * 0.7 + smooth(0.18, 0.3, slope) * 0.35;

  // Layered from the top: snow covers everything, sand what is left, then rock
  // and dirt; grass gets the remainder. Each layer takes its share of what remains.
  let rest = 1;
  snow = clamp01(snow);
  rest -= snow;
  sand = clamp01(sand) * rest;
  rest -= sand;
  rock = clamp01(rock) * rest;
  rest -= rock;
  dirt = clamp01(dirt) * rest;
  rest -= dirt;
  const grass = Math.max(0, rest);
  return { grass, dirt, rock, sand, snow, lush: moisture };
}

const C = {
  grassLush: hexToRgb(terrainPalette.grassLush),
  grassDry: hexToRgb(terrainPalette.grassDry),
  forestFloor: hexToRgb(terrainPalette.forestFloor),
  dirt: hexToRgb(terrainPalette.dirt),
  rock: hexToRgb(terrainPalette.rock),
  rockDark: hexToRgb(terrainPalette.rockDark),
  sand: hexToRgb(terrainPalette.sand),
  seabed: hexToRgb(terrainPalette.seabed),
  snow: hexToRgb(terrainPalette.snow),
};

/**
 * sRGB albedo of a surface: the material colours blended by weight, with a
 * little low-frequency variation so large areas are not one flat colour.
 * Step 2c replaces this with textures blended by the same weights.
 */
export function surfaceColor(s: Surface, x: number, z: number, height: number, out: Float32Array, offset: number): void {
  const vary = patchNoise(x / 37, z / 37) * 0.5 + patchNoise(x / 11, z / 11) * 0.25; // -0.75..0.75
  const lushT = smooth(0.3, 0.8, s.lush);
  const forest = smooth(0.6, 0.75, s.lush);
  const rockT = smooth(-0.4, 0.4, vary);
  const sandC = height < SEA_LEVEL - 1 ? C.seabed : C.sand;
  for (let k = 0; k < 3; k++) {
    const grass = mix(mix(C.grassDry[k]!, C.grassLush[k]!, lushT), C.forestFloor[k]!, forest);
    const rock = mix(C.rockDark[k]!, C.rock[k]!, rockT);
    const c = s.grass * grass + s.dirt * C.dirt[k]! + s.rock * rock + s.sand * sandC[k]! + s.snow * C.snow[k]!;
    out[offset + k] = clamp01(c * (1 + vary * 0.08));
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
