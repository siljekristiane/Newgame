import { CHUNK_SIZE, MINIMAP_RESOLUTION, SEA_LEVEL, WORLD_SIZE, WORLD_SEED } from '../config/world';
import { hexToRgb, world } from '../design/tokens';
import { hash2 } from './noise';
import { colorAt, heightAt } from './terrain';

/**
 * Pure mesh-data builders. They run inside the terrain worker, but are plain
 * functions so they can be unit-tested and reused (e.g. on a server later).
 */

export interface ChunkRequest {
  cx: number;
  cz: number;
  segments: number;
  withProps: boolean;
}

export interface ChunkData {
  /** Vertex positions relative to the chunk's north-west corner (small numbers = float32-safe). */
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** Placeholder props, 5 floats each: localX, y, localZ, size, kind (0 = cube, 1 = sphere). */
  props: Float32Array;
  minHeight: number;
  maxHeight: number;
}

export const PROPS_PER_CHUNK = 36;

export function buildChunk({ cx, cz, segments, withProps }: ChunkRequest): ChunkData {
  const side = segments + 1;
  const gridCount = side * side;
  const perimeter = segments * 4;
  const vertexCount = gridCount + perimeter;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const step = CHUNK_SIZE / segments;
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const lx = i * step;
      const lz = j * step;
      const h = heightAt(originX + lx, originZ + lz);
      const v = j * side + i;
      positions[v * 3] = lx;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = lz;
      colorAt(h, originX + lx, originZ + lz, colors, v * 3);
      toLinear(colors, v * 3);
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  // Skirts: a ring of vertices hanging below the edge hides the cracks where a
  // chunk meets a neighbour at a different LOD.
  const skirtDepth = step * 1.5;
  const ring = perimeterIndices(segments);
  for (let k = 0; k < ring.length; k++) {
    const src = ring[k]!;
    const dst = gridCount + k;
    positions[dst * 3] = positions[src * 3]!;
    positions[dst * 3 + 1] = positions[src * 3 + 1]! - skirtDepth;
    positions[dst * 3 + 2] = positions[src * 3 + 2]!;
    colors[dst * 3] = colors[src * 3]!;
    colors[dst * 3 + 1] = colors[src * 3 + 1]!;
    colors[dst * 3 + 2] = colors[src * 3 + 2]!;
  }

  const triangleCount = segments * segments * 2 + perimeter * 2;
  const indices = vertexCount > 65535 ? new Uint32Array(triangleCount * 3) : new Uint16Array(triangleCount * 3);
  let t = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Counter-clockwise seen from above (+Y), so faces point up.
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % ring.length]!;
    const sa = gridCount + k;
    const sb = gridCount + ((k + 1) % ring.length);
    // The terrain material is double-sided, so skirts show from any side.
    indices[t++] = a; indices[t++] = b; indices[t++] = sa;
    indices[t++] = b; indices[t++] = sb; indices[t++] = sa;
  }

  return {
    positions,
    colors,
    indices: indices.subarray(0, t),
    props: withProps ? buildProps(cx, cz) : new Float32Array(0),
    minHeight,
    maxHeight,
  };
}

/** Palette colours are sRGB; Three.js expects vertex colours in linear space. */
function toLinear(c: Float32Array, o: number): void {
  for (let k = o; k < o + 3; k++) {
    const v = c[k]!;
    c[k] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
}

/** Grid indices around the edge, in order: north, east, south, west. */
function perimeterIndices(segments: number): number[] {
  const side = segments + 1;
  const out: number[] = [];
  for (let i = 0; i < segments; i++) out.push(i);
  for (let j = 0; j < segments; j++) out.push(j * side + segments);
  for (let i = segments; i > 0; i--) out.push(segments * side + i);
  for (let j = segments; j > 0; j--) out.push(j * side);
  return out;
}

/** Deterministic placeholder objects: same chunk, same props, every time. */
export function buildProps(cx: number, cz: number): Float32Array {
  const out = new Float32Array(PROPS_PER_CHUNK * 5);
  let n = 0;
  for (let k = 0; k < PROPS_PER_CHUNK; k++) {
    const lx = hash2(cx * 97 + k, cz, WORLD_SEED) * CHUNK_SIZE;
    const lz = hash2(cx, cz * 89 + k, WORLD_SEED + 7) * CHUNK_SIZE;
    const h = heightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
    if (h < SEA_LEVEL + 4 || h > 700) continue;
    const kind = hash2(cx + k, cz - k, WORLD_SEED + 13) < 0.35 ? 0 : 1;
    const size = 2 + hash2(cx - k, cz + k, WORLD_SEED + 21) * (kind === 0 ? 5 : 6);
    out.set([lx, h, lz, size, kind], n * 5);
    n++;
  }
  return out.subarray(0, n * 5);
}

/** RGBA image of the whole world, for the minimap. */
export function buildMinimap(resolution = MINIMAP_RESOLUTION): Uint8ClampedArray {
  const img = new Uint8ClampedArray(resolution * resolution * 4);
  const rgb = new Float32Array(3);
  const water = hexToRgb(world.water);
  const cell = WORLD_SIZE / resolution;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const x = (i + 0.5) * cell;
      const z = (j + 0.5) * cell;
      const h = heightAt(x, z);
      const o = (j * resolution + i) * 4;
      if (h < SEA_LEVEL) {
        const deep = Math.min(1, -h / 150) * 0.25;
        img[o] = water[0] * 255 * (1 - deep);
        img[o + 1] = water[1] * 255 * (1 - deep);
        img[o + 2] = water[2] * 255 * (1 - deep);
      } else {
        colorAt(h, x, z, rgb, 0);
        img[o] = rgb[0]! * 255;
        img[o + 1] = rgb[1]! * 255;
        img[o + 2] = rgb[2]! * 255;
      }
      img[o + 3] = 255;
    }
  }
  return img;
}
