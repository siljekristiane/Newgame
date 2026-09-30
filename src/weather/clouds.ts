import { WORLD_SEED } from '../config/world';
import { tfbm, tworley } from '../world/terrainTextures';

/**
 * Tileable cloud noise (pure, one byte per texel): billowy cells from
 * inverted Worley noise, broken up by fbm. The sky shader samples it at a
 * few scales and thresholds it by cloud cover.
 */
export function buildCloudNoise(size = 256): Uint8Array {
  const out = new Uint8Array(size * size);
  const s = WORLD_SEED + 1_400;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const billow = 1 - tworley(u, v, 6, s);
      const detail = 1 - tworley(u, v, 14, s + 1);
      const f = tfbm(u, v, 4, 5, s + 2) * 0.5 + 0.5;
      const n = billow * 0.45 + detail * 0.2 + f * 0.35;
      out[y * size + x] = Math.round(Math.min(1, Math.max(0, n)) * 255);
    }
  }
  return out;
}
