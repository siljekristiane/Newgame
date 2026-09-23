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

/** '#rrggbb' → [r, g, b] in 0..1, for vertex colours. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
