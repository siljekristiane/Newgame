import { naturalHeightAt } from './naturalTerrain';
import { stampHeight } from '../regions/stamps';

export { fbm } from './naturalTerrain';

/**
 * The terrain is a pure function of world position: heightAt(x, z) in meters.
 * Pure = it can run on the main thread (player grounding) and in workers
 * (chunk meshes, minimap) and always agree.
 *
 * It is the natural terrain with the hand-made regions stamped in (flat
 * plazas, paths that follow the ground): regions/stamps.ts.
 */
export function heightAt(x: number, z: number): number {
  return stampHeight(x, z, naturalHeightAt(x, z));
}
