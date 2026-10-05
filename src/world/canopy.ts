import { CANOPY, LOD_LEVELS, VEGETATION, WORLD_SEED } from '../config/world';
import { hexToRgb, vegetationPalette } from '../design/tokens';
import { createNoise2D } from './noise';
import { plantDensity } from './vegetation';

/**
 * Forest seen from afar (pure, tested). Real trees are only drawn near the
 * player; further out the terrain itself takes the colour of the canopy where
 * trees grow, mottled into clumps and gaps, so distant forests read as
 * forests instead of bare hills.
 */

const clumpNoise = createNoise2D(WORLD_SEED + 13);
const CONIFER = hexToRgb(vegetationPalette.canopyConifer);
const BROADLEAF = hexToRgb(vegetationPalette.canopyBroadleaf);
const MAX_TREES = VEGETATION.openTrees + VEGETATION.forestTrees;
const density = [0, 0, 0, 0];

export interface Canopy {
  /** 0 = open ground … 1 = closed canopy. */
  cover: number;
  /** Share of conifers among the trees (0..1). */
  conifer: number;
}

/** Canopy cover at a point, from the same plant densities that place the real trees. */
export function canopyAt(x: number, z: number, height: number, slope: number, out: Canopy = { cover: 0, conifer: 0 }): Canopy {
  plantDensity(x, z, height, slope, density);
  const trees = density[0]! + density[1]!;
  const t = Math.min(1, Math.max(0, (trees / MAX_TREES - CANOPY.coverStart) / (CANOPY.coverFull - CANOPY.coverStart)));
  const clump = clumpNoise(x / CANOPY.clumpScale, z / CANOPY.clumpScale);
  out.cover = Math.min(1, Math.max(0, t * t * (3 - 2 * t) * (1 + clump * CANOPY.clumpCover)));
  out.conifer = trees > 0 ? density[0]! / trees : 0;
  return out;
}

/** How much the canopy colour shows on a chunk with this many grid segments (0 on LOD 0). */
export function canopyStrength(segments: number): number {
  const lod = LOD_LEVELS.findIndex((l) => l.segments === segments);
  return CANOPY.strength[lod < 0 ? CANOPY.strength.length - 1 : lod]!;
}

/** Turns an sRGB colour (in place) toward the canopy by cover × strength. */
export function applyCanopy(rgb: Float32Array, o: number, c: Canopy, strength: number, x: number, z: number): void {
  const k = c.cover * strength;
  if (k <= 0) return;
  const shade = 1 + clumpNoise(x / (CANOPY.clumpScale * 0.37), z / (CANOPY.clumpScale * 0.37)) * CANOPY.clumpShade;
  for (let i = 0; i < 3; i++) {
    const canopy = (CONIFER[i]! * c.conifer + BROADLEAF[i]! * (1 - c.conifer)) * shade;
    rgb[o + i] = rgb[o + i]! + (canopy - rgb[o + i]!) * k;
  }
}
