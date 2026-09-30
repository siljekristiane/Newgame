import { WORLD_SEED } from '../../config/world';
import { tfbm, tworley } from '../../world/terrainTextures';

/**
 * Tileable detail textures for the spawn area's paths and plaza (pure).
 * `albedo` is RGBA (RGB = colour factor around 1.0 as factor × 127.5),
 * `normal` is RGB = xyz × 0.5 + 0.5 with roughness in A.
 */
export interface DetailTexture {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
}

const S = WORLD_SEED + 800;

function build(size: number, height: (u: number, v: number) => number, strength: number, roughness: number): DetailTexture {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x / size, y / size);
  let mean = 0;
  for (const v of h) mean += v;
  mean /= h.length;
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const k = Math.min(2, Math.max(0, 0.55 + (at(x, y) / mean) * 0.45));
      albedo.set([k * 127.5, k * 127.5, k * 127.5, 255], o);
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      normal.set([(nx / len) * 127.5 + 127.5, (ny / len) * 127.5 + 127.5, (1 / len) * 127.5 + 127.5, roughness * 255], o);
    }
  }
  return { size, albedo, normal };
}

/** Packed gravel: small stones in a fine grain, worn a little smoother in the middle. */
export function gravelTexture(size = 128): DetailTexture {
  return build(
    size,
    (u, v) => {
      const stones = 1 - tworley(u, v, 24, S);
      return 0.5 * stones * stones + 0.35 * (tfbm(u, v, 32, 2, S + 1) * 0.5 + 0.5) + 0.15 * (tfbm(u, v, 4, 2, S + 2) * 0.5 + 0.5);
    },
    3,
    0.9,
  );
}

/** Cobbles: rounded stones in darker joints. */
export function pavingTexture(size = 256): DetailTexture {
  return build(
    size,
    (u, v) => {
      // Distance to the nearest cobble centre: rounded tops, dark gaps between.
      const d = tworley(u, v, 8, S + 10);
      const stone = 1 - Math.min(1, Math.max(0, (d - 0.3) / 0.22));
      return 0.15 + stone * (0.7 + 0.15 * tfbm(u, v, 16, 3, S + 11));
    },
    6,
    0.75,
  );
}
