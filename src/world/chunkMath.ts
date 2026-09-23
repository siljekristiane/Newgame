import { CHUNK_SIZE, CHUNKS_PER_SIDE, LOD_LEVELS, WORLD_SIZE } from '../config/world';

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

export function worldToChunk(x: number, z: number): ChunkCoord {
  return {
    cx: clampChunk(Math.floor(x / CHUNK_SIZE)),
    cz: clampChunk(Math.floor(z / CHUNK_SIZE)),
  };
}

export const clampChunk = (c: number): number => Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, c));

export const isInsideWorld = (cx: number, cz: number): boolean =>
  cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE;

export const clampToWorld = (v: number): number => Math.min(WORLD_SIZE - 0.01, Math.max(0.01, v));

/** Chebyshev distance: the ring number around the center chunk. */
export const chunkDistance = (a: ChunkCoord, b: ChunkCoord): number =>
  Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));

/** LOD index for a ring distance, or -1 when the chunk should not be loaded. */
export function lodForDistance(distance: number): number {
  for (let i = 0; i < LOD_LEVELS.length; i++) {
    if (distance <= LOD_LEVELS[i]!.maxDistance) return i;
  }
  return -1;
}

/** Every chunk that should be loaded around `center`, nearest first. */
export function desiredChunks(center: ChunkCoord, radius: number): Array<ChunkCoord & { lod: number; distance: number }> {
  const out: Array<ChunkCoord & { lod: number; distance: number }> = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = center.cx + dx;
      const cz = center.cz + dz;
      if (!isInsideWorld(cx, cz)) continue;
      // Circular area: skip corners of the square, they are behind the fog anyway.
      if (dx * dx + dz * dz > (radius + 0.5) * (radius + 0.5)) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dz));
      out.push({ cx, cz, distance, lod: lodForDistance(distance) });
    }
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}
