/// <reference lib="webworker" />
import { buildChunk, buildMinimap, type ChunkRequest } from './buildChunk';
import { buildTerrainTextures } from './terrainTextures';
import { buildSeabedDepth, buildWaterNormals, type SeabedRequest } from './water';

export type WorkerRequest =
  | ({ type: 'chunk'; id: number } & ChunkRequest)
  | { type: 'minimap'; id: number; resolution: number }
  | { type: 'textures'; id: number; size: number }
  | ({ type: 'seabed'; id: number } & SeabedRequest)
  | { type: 'waterNormals'; id: number; size: number };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'chunk') {
    const data = buildChunk(msg);
    self.postMessage({ id: msg.id, data }, [
      data.positions.buffer,
      data.normals.buffer,
      data.morphHeights.buffer,
      data.morphNormals.buffer,
      data.morphColors.buffer,
      data.weights.buffer,
      data.morphWeights.buffer,
      data.colors.buffer,
      data.indices.buffer,
      data.props.buffer,
    ] as Transferable[]);
  } else if (msg.type === 'textures') {
    const textures = buildTerrainTextures(msg.size);
    self.postMessage({ id: msg.id, textures }, [textures.albedo.buffer, textures.normal.buffer] as Transferable[]);
  } else if (msg.type === 'seabed') {
    const image = buildSeabedDepth(msg);
    self.postMessage({ id: msg.id, image }, [image.buffer] as Transferable[]);
  } else if (msg.type === 'waterNormals') {
    const image = buildWaterNormals(msg.size);
    self.postMessage({ id: msg.id, image }, [image.buffer] as Transferable[]);
  } else {
    const image = buildMinimap(msg.resolution);
    self.postMessage({ id: msg.id, image }, [image.buffer] as Transferable[]);
  }
};
