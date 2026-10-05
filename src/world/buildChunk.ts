import { CANOPY, CHUNK_SIZE, LOD_LEVELS, MINIMAP_RESOLUTION, NORMAL_SAMPLE_STEP, SEA_LEVEL, WORLD_SIZE } from '../config/world';
import { hexToRgb, world } from '../design/tokens';
import { surfaceAt, surfaceColor } from './biomes';
import { applyCanopy, canopyAt, canopyStrength, type Canopy } from './canopy';
import { horizonGrid, horizonGridSize, sampleHorizon } from './horizon';
import { heightAt } from './terrain';
import { buildVegetation, PLANT_STRIDE } from './vegetation';

/**
 * Pure mesh-data builders. They run inside the terrain worker, but are plain
 * functions so they can be unit-tested and reused (e.g. on a server later).
 */

export interface ChunkRequest {
  cx: number;
  cz: number;
  segments: number;
  /**
   * Grid of the next coarser LOD (segments / 2), or 0 for the coarsest. Each
   * vertex also gets its height on that coarser mesh, so the shader can morph
   * toward it before the switch (geomorphing: no popping, no cracks).
   */
  morphSegments: number;
  withProps: boolean;
}

export interface ChunkData {
  /** Vertex positions relative to the chunk's north-west corner (small numbers = float32-safe). */
  positions: Float32Array;
  /** Smooth normals from heightAt() at a fixed sample step, so every LOD shades alike. */
  normals: Float32Array;
  /**
   * Per vertex, the same attributes as seen on the next coarser LOD's mesh
   * (= own values for the coarsest). Shape, shading and colour all morph, so
   * the swap itself is invisible.
   */
  morphHeights: Float32Array;
  morphNormals: Float32Array;
  morphColors: Float32Array;
  /** Surface material weights per vertex: grass, dirt, rock, sand (snow = 1 - their sum). */
  weights: Float32Array;
  morphWeights: Float32Array;
  colors: Float32Array;
  /** Terrain-shadow horizon angles (bytes, 0 = flat … 255 = 90°): directions 0–3 and 4–7 (world/horizon.ts). */
  horizonA: Uint8Array;
  horizonB: Uint8Array;
  indices: Uint16Array | Uint32Array;
  /** Trees, bushes and boulders, PROP_STRIDE floats each (see PLANT_STRIDE in world/vegetation.ts). */
  props: Float32Array;
  minHeight: number;
  maxHeight: number;
}

export const PROP_STRIDE = PLANT_STRIDE;

export function buildChunk({ cx, cz, segments, morphSegments, withProps }: ChunkRequest): ChunkData {
  if (morphSegments !== 0 && morphSegments * 2 !== segments) throw new Error('morphSegments must be segments / 2');
  const side = segments + 1;
  const gridCount = side * side;
  const perimeter = segments * 4;
  const vertexCount = gridCount + perimeter;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const morphHeights = new Float32Array(vertexCount);
  const morphNormals = new Float32Array(vertexCount * 3);
  const morphColors = new Float32Array(vertexCount * 3);
  const weights = new Float32Array(vertexCount * 4);
  const morphWeights = new Float32Array(vertexCount * 4);
  const colors = new Float32Array(vertexCount * 3);
  // Colours as the next coarser LOD shows them (more canopy), for the morph target.
  const coarseColors = new Float32Array(gridCount * 3);
  const fineCanopy = canopyStrength(segments);
  const coarseCanopy = canopyStrength(morphSegments || segments);
  const canopy: Canopy = { cover: 0, conifer: 0 };
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const horizonA = new Uint8Array(vertexCount * 4);
  const horizonB = new Uint8Array(vertexCount * 4);
  const hg = horizonGridSize(segments);
  const horizon = horizonGrid(originX, originZ, CHUNK_SIZE, hg);
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
      terrainNormal(originX + lx, originZ + lz, normals, v * 3);
      const surface = surfaceAt(originX + lx, originZ + lz, h, 1 - normals[v * 3 + 1]!);
      surfaceColor(surface, originX + lx, originZ + lz, h, colors, v * 3);
      // The morph target only reads even grid points, so a chunk without canopy of its own (LOD 0) skips the rest.
      const needCanopy = coarseCanopy > 0 && (fineCanopy > 0 || (i % 2 === 0 && j % 2 === 0));
      if (needCanopy) {
        canopyAt(originX + lx, originZ + lz, h, 1 - normals[v * 3 + 1]!, canopy);
        coarseColors.set(colors.subarray(v * 3, v * 3 + 3), v * 3);
        applyCanopy(coarseColors, v * 3, canopy, coarseCanopy, originX + lx, originZ + lz);
        applyCanopy(colors, v * 3, canopy, fineCanopy, originX + lx, originZ + lz);
      }
      sampleHorizon(horizon, CHUNK_SIZE, hg, lx, lz, horizonA, horizonB, v);
      weights[v * 4] = surface.grass;
      weights[v * 4 + 1] = surface.dirt;
      weights[v * 4 + 2] = surface.rock;
      weights[v * 4 + 3] = surface.sand;
      toLinear(colors, v * 3);
      if (needCanopy) toLinear(coarseColors, v * 3);
      else coarseColors.set(colors.subarray(v * 3, v * 3 + 3), v * 3);
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  // Morph targets: what a vertex looks like on the coarser grid (segments / 2).
  // Even grid points are shared; odd ones sit halfway along a coarse edge or on
  // the coarse quad's b-c diagonal (same split as the index buffer below), so
  // their target is the average of those two coarse vertices.
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = j * side + i;
      let a = v;
      let b = v;
      if (morphSegments) {
        const oddI = i % 2 === 1;
        const oddJ = j % 2 === 1;
        if (oddI && oddJ) [a, b] = [(j - 1) * side + i + 1, (j + 1) * side + i - 1];
        else if (oddI) [a, b] = [v - 1, v + 1];
        else if (oddJ) [a, b] = [v - side, v + side];
      }
      const m = (positions[a * 3 + 1]! + positions[b * 3 + 1]!) / 2;
      morphHeights[v] = m;
      if (m < minHeight) minHeight = m;
      if (m > maxHeight) maxHeight = m;
      for (let k = 0; k < 3; k++) morphColors[v * 3 + k] = (coarseColors[a * 3 + k]! + coarseColors[b * 3 + k]!) / 2;
      for (let k = 0; k < 4; k++) morphWeights[v * 4 + k] = (weights[a * 4 + k]! + weights[b * 4 + k]!) / 2;
      const nx = normals[a * 3]! + normals[b * 3]!;
      const ny = normals[a * 3 + 1]! + normals[b * 3 + 1]!;
      const nz = normals[a * 3 + 2]! + normals[b * 3 + 2]!;
      const len = Math.hypot(nx, ny, nz);
      morphNormals[v * 3] = nx / len;
      morphNormals[v * 3 + 1] = ny / len;
      morphNormals[v * 3 + 2] = nz / len;
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
    morphHeights[dst] = morphHeights[src]! - skirtDepth;
    morphNormals.set(morphNormals.subarray(src * 3, src * 3 + 3), dst * 3);
    morphColors.set(morphColors.subarray(src * 3, src * 3 + 3), dst * 3);
    weights.set(weights.subarray(src * 4, src * 4 + 4), dst * 4);
    horizonA.set(horizonA.subarray(src * 4, src * 4 + 4), dst * 4);
    horizonB.set(horizonB.subarray(src * 4, src * 4 + 4), dst * 4);
    morphWeights.set(morphWeights.subarray(src * 4, src * 4 + 4), dst * 4);
    // Same normal and colour as the edge above: a skirt that peeks through a
    // crack then looks like ground, not a dark line.
    normals[dst * 3] = normals[src * 3]!;
    normals[dst * 3 + 1] = normals[src * 3 + 1]!;
    normals[dst * 3 + 2] = normals[src * 3 + 2]!;
    colors[dst * 3] = colors[src * 3]!;
    colors[dst * 3 + 1] = colors[src * 3 + 1]!;
    colors[dst * 3 + 2] = colors[src * 3 + 2]!;
  }

  const triangleCount = segments * segments * 2 + perimeter * 4;
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
    // Both windings: the terrain is drawn front-side only (a double-sided
    // terrain leaks dark back faces along hill silhouettes), but a skirt must
    // show from whichever side the gap is seen.
    indices[t++] = a; indices[t++] = b; indices[t++] = sa;
    indices[t++] = b; indices[t++] = sb; indices[t++] = sa;
    indices[t++] = a; indices[t++] = sa; indices[t++] = b;
    indices[t++] = b; indices[t++] = sa; indices[t++] = sb;
  }

  return {
    positions,
    normals,
    morphHeights,
    morphNormals,
    morphColors,
    horizonA,
    horizonB,
    weights,
    morphWeights,
    colors,
    indices: indices.subarray(0, t),
    // The finest LOD shows every plant; coarser ones a thinned subset.
    props: withProps ? buildVegetation(cx, cz, segments, morphSegments, segments < LOD_LEVELS[0].segments) : new Float32Array(0),
    minHeight,
    maxHeight,
  };
}

/** Normal of heightAt() by central differences at NORMAL_SAMPLE_STEP. */
function terrainNormal(x: number, z: number, out: Float32Array, o: number): void {
  const e = NORMAL_SAMPLE_STEP;
  const nx = heightAt(x - e, z) - heightAt(x + e, z);
  const nz = heightAt(x, z - e) - heightAt(x, z + e);
  const ny = 2 * e;
  const len = Math.hypot(nx, ny, nz);
  out[o] = nx / len;
  out[o + 1] = ny / len;
  out[o + 2] = nz / len;
}

/** Palette colours are sRGB; Three.js expects vertex colours in linear space. */
export function toLinear(c: Float32Array, o: number): void {
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

/** RGBA image of the whole world, for the minimap: surface colours with hill shading from the north-west. */
export function buildMinimap(resolution = MINIMAP_RESOLUTION): Uint8ClampedArray {
  const img = new Uint8ClampedArray(resolution * resolution * 4);
  const rgb = new Float32Array(3);
  const n = new Float32Array(3);
  const canopy: Canopy = { cover: 0, conifer: 0 };
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
        terrainNormal(x, z, n, 0);
        surfaceColor(surfaceAt(x, z, h, 1 - n[1]!), x, z, h, rgb, 0);
        applyCanopy(rgb, 0, canopyAt(x, z, h, 1 - n[1]!, canopy), CANOPY.strength[CANOPY.strength.length - 1]!, x, z);
        const shade = Math.min(1.25, Math.max(0.55, 0.9 + (-n[0]! - n[2]!) * 1.4));
        img[o] = rgb[0]! * 255 * shade;
        img[o + 1] = rgb[1]! * 255 * shade;
        img[o + 2] = rgb[2]! * 255 * shade;
      }
      img[o + 3] = 255;
    }
  }
  return img;
}
