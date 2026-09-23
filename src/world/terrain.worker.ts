/// <reference lib="webworker" />
import { buildChunk, buildMinimap, type ChunkRequest } from './buildChunk';

export type WorkerRequest =
  | ({ type: 'chunk'; id: number } & ChunkRequest)
  | { type: 'minimap'; id: number; resolution: number };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'chunk') {
    const data = buildChunk(msg);
    self.postMessage({ id: msg.id, data }, [
      data.positions.buffer,
      data.colors.buffer,
      data.indices.buffer,
      data.props.buffer,
    ] as Transferable[]);
  } else {
    const image = buildMinimap(msg.resolution);
    self.postMessage({ id: msg.id, image }, [image.buffer] as Transferable[]);
  }
};
