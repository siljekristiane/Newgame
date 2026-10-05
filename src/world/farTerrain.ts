import { CANOPY, FAR_TERRAIN } from '../config/world';
import { surfaceAt, surfaceColor } from './biomes';
import { applyCanopy, canopyAt, type Canopy } from './canopy';
import { toLinear } from './buildChunk';
import { heightAt } from './terrain';

/**
 * Coarse terrain tiles for the far ring (pure, built in a worker). Same
 * heightAt and surface colours as the chunks, on a 250 m grid; vertices are
 * relative to the tile's north-west corner.
 */
export interface FarTile {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  minHeight: number;
  maxHeight: number;
}

export function buildFarTile(tx: number, tz: number): FarTile {
  const { tileSize, segments } = FAR_TERRAIN;
  const side = segments + 1;
  const step = tileSize / segments;
  const x0 = tx * tileSize;
  const z0 = tz * tileSize;
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const canopy: Canopy = { cover: 0, conifer: 0 };
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = j * side + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const h = heightAt(x, z);
      positions.set([i * step, h, j * step], v * 3);
      // Normals over the grid spacing: the far ring only needs the broad shape.
      const nx = heightAt(x - step, z) - heightAt(x + step, z);
      const nz = heightAt(x, z - step) - heightAt(x, z + step);
      const len = Math.hypot(nx, 2 * step, nz);
      normals.set([nx / len, (2 * step) / len, nz / len], v * 3);
      surfaceColor(surfaceAt(x, z, h, 1 - (2 * step) / len), x, z, h, colors, v * 3);
      applyCanopy(colors, v * 3, canopyAt(x, z, h, 1 - (2 * step) / len, canopy), CANOPY.strength[CANOPY.strength.length - 1]!, x, z);
      toLinear(colors, v * 3);
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
    }
  }
  const indices = new Uint16Array(segments * segments * 6);
  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { positions, normals, colors, indices, minHeight, maxHeight };
}

/** Far tiles wanted around a player tile: the square ring between innerRings and rings. */
export function wantedFarTiles(ptx: number, ptz: number, tilesPerSide: number): Array<{ tx: number; tz: number }> {
  const out: Array<{ tx: number; tz: number }> = [];
  const { rings, innerRings } = FAR_TERRAIN;
  for (let dz = -rings; dz <= rings; dz++) {
    for (let dx = -rings; dx <= rings; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= innerRings) continue;
      const tx = ptx + dx;
      const tz = ptz + dz;
      if (tx < 0 || tz < 0 || tx >= tilesPerSide || tz >= tilesPerSide) continue;
      out.push({ tx, tz });
    }
  }
  return out;
}
