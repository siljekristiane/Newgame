import { GIANTS } from '../../config/world';

/**
 * The five giant trees (pure): where they stand and what kind each is. They
 * lie on one circle on the map (GIANTS.center, radius 30 km), 72° apart, so a
 * later quest can draw on the shape. Each kind suits the land it grows in.
 */

export const GIANT_KINDS = ['ancientOak', 'meadowLinden', 'deadTree', 'windPine', 'snowFir'] as const;
export type GiantKind = (typeof GIANT_KINDS)[number];

export interface GiantTree {
  id: string;
  /** Name shown in the game later. */
  name: string;
  kind: GiantKind;
  /** World meters. */
  x: number;
  z: number;
  /** Biome it was chosen for (checked by the tests). */
  biome: 'forest' | 'grassland' | 'dryland' | 'alpine' | 'snow';
}

/** In order around the circle, starting at GIANTS.startAngle. */
const SPECS: ReadonlyArray<Omit<GiantTree, 'x' | 'z'>> = [
  { id: 'eldste-eik', name: 'Den eldste eika', kind: 'ancientOak', biome: 'forest' },
  { id: 'englinda', name: 'Englinda', kind: 'meadowLinden', biome: 'grassland' },
  { id: 'torrtreet', name: 'Tørrtreet', kind: 'deadTree', biome: 'dryland' },
  { id: 'vindfurua', name: 'Vindfurua', kind: 'windPine', biome: 'alpine' },
  { id: 'frostvokteren', name: 'Frostvokteren', kind: 'snowFir', biome: 'snow' },
];

export const GIANT_TREES: readonly GiantTree[] = SPECS.map((spec, k) => {
  const angle = ((GIANTS.startAngle + k * 72) * Math.PI) / 180;
  return { ...spec, x: GIANTS.center.x + Math.cos(angle) * GIANTS.radius, z: GIANTS.center.z + Math.sin(angle) * GIANTS.radius };
});

/** Distance to the nearest giant tree, meters. */
export function nearestGiantDistance(x: number, z: number): number {
  let best = Infinity;
  for (const g of GIANT_TREES) best = Math.min(best, Math.hypot(x - g.x, z - g.z));
  return best;
}
