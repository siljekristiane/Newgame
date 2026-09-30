/**
 * Duskwood Academy design tokens used by the 3D world.
 * Source: the Duskwood Academy design system (World palette).
 */
export const world = {
  skyZenith: '#7a5a6e',
  skyGlow: '#d9a07e',
  pineShadow: '#2c3f2b',
  pine: '#3f5e38',
  meadow: '#5f7a2e',
  canopy: '#8ea83a',
  sand: '#e3c78c',
  sandShade: '#c9a86a',
  water: '#a8cfc8',
  crystal: '#a57ad8',
  crystalDeep: '#7a4fb8',
  lamp: '#f5d83a',
  wood: '#6e4526',
  stone: '#b3a37e',
  ivory: '#efe3b8',
} as const;

export type WorldColor = keyof typeof world;

/**
 * Sky and light colours through the day (art direction C). timeOfDay.ts blends
 * them by sun elevation: day, golden hour, twilight, night.
 */
export const atmosphere = {
  zenithDay: '#4f86c6',
  zenithTwilight: '#3a4a78',
  zenithNight: '#070b16',
  horizonDay: '#b8cbd9',
  horizonGolden: '#e2a878',
  horizonTwilight: '#6c5a78',
  horizonNight: '#111726',
  sunHigh: '#fff3e2',
  sunLow: '#ffae6a',
  moon: '#a8bde0',
  groundBounce: '#5b5a45',
} as const;

/** Water body colours (art direction C): the shade under the surface, by depth. */
export const waterPalette = {
  shallow: '#3d8c86',
  deep: '#0d2c3c',
  foam: '#eef4f2',
} as const;

/**
 * Natural surface materials for the near-realistic terrain (art direction C).
 * Muted albedos; biomes blend them by weight (see world/biomes.ts).
 */
export const terrainPalette = {
  grassLush: '#4d6a2b',
  grassDry: '#8a8350',
  forestFloor: '#3f4f26',
  dirt: '#6d5a43',
  rock: '#7a756c',
  rockDark: '#57534d',
  sand: '#c8b88e',
  seabed: '#8a7f63',
  snow: '#e9edf0',
} as const;

/** '#rrggbb' → [r, g, b] in 0..1, for vertex colours. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
