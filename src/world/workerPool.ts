import { buildChunk, buildMinimap, type ChunkData, type ChunkRequest } from './buildChunk';
import type { WorkerRequest } from './terrain.worker';

type Pending = { msg: WorkerRequest; resolve: (value: unknown) => void; reject: (err: unknown) => void };

/**
 * A small pool of terrain workers. Chunk generation never blocks the main
 * thread, so the frame rate holds while the world streams in.
 *
 * If workers can't start (blocked by a sandbox or CSP), the pool falls back to
 * building on the main thread, one job per task, so the game still runs.
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private next = 0;
  private fallback = false;

  constructor(size = defaultPoolSize()) {
    try {
      for (let i = 0; i < size; i++) this.workers.push(this.spawn());
    } catch (err) {
      this.useFallback(err);
    }
  }

  get size(): number {
    return this.fallback ? 1 : this.workers.length;
  }

  buildChunk(req: ChunkRequest): Promise<ChunkData> {
    return this.post({ type: 'chunk', id: 0, ...req }) as Promise<ChunkData>;
  }

  buildMinimap(resolution: number): Promise<Uint8ClampedArray> {
    return this.post({ type: 'minimap', id: 0, resolution }) as Promise<Uint8ClampedArray>;
  }

  dispose(): void {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.pending.forEach((p) => p.reject(new Error('Worker pool disposed')));
    this.pending.clear();
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; data?: ChunkData; image?: Uint8ClampedArray }>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      p.resolve(e.data.data ?? e.data.image);
    };
    worker.onerror = (e) => this.useFallback(e.message || 'worker failed to load');
    return worker;
  }

  private useFallback(reason: unknown): void {
    if (this.fallback) return;
    console.warn('[terrain] Web Workers unavailable, building chunks on the main thread:', reason);
    this.fallback = true;
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    // Re-run whatever the workers had not answered yet.
    const stranded = Array.from(this.pending.values());
    this.pending.clear();
    stranded.forEach((p) => this.runInline(p));
  }

  private runInline(p: Pending): void {
    setTimeout(() => {
      const { msg } = p;
      p.resolve(msg.type === 'chunk' ? buildChunk(msg) : buildMinimap(msg.resolution));
    }, 0);
  }

  private post(msg: WorkerRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const pending = { msg, resolve, reject };
      if (this.fallback) return this.runInline(pending);
      const id = this.nextId++;
      msg.id = id;
      this.pending.set(id, pending);
      this.workers[this.next++ % this.workers.length]!.postMessage(msg);
    });
  }
}

function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(4, cores - 1));
}
