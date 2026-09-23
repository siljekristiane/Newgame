import * as THREE from 'three';
import { CHUNK_SIZE, LOD_LEVELS, MAX_INFLIGHT_BUILDS, MAX_MESH_UPLOADS_PER_FRAME, UNLOAD_RADIUS, UPLOAD_BUDGET_MS, VIEW_RADIUS } from '../config/world';
import type { ChunkData } from './buildChunk';
import { chunkDistance, chunkKey, desiredChunks, worldToChunk, type ChunkCoord } from './chunkMath';
import type { WorkerPool } from './workerPool';

export interface LoadedChunk {
  key: string;
  cx: number;
  cz: number;
  lod: number;
  geometry: THREE.BufferGeometry;
  /** 5 floats per prop, see ChunkData.props. Empty for far LODs. */
  props: Float32Array;
}

interface Request {
  key: string;
  cx: number;
  cz: number;
  lod: number;
  distance: number;
}

/**
 * Decides which chunks exist, at which LOD, and streams them in.
 *
 * - Chunks are requested nearest-first, a few at a time (MAX_INFLIGHT_BUILDS).
 * - Workers build the vertex data; this class turns it into BufferGeometry,
 *   a few per frame (MAX_MESH_UPLOADS_PER_FRAME, or more within UPLOAD_BUDGET_MS)
 *   to avoid frame spikes.
 * - A chunk keeps its old mesh until the new LOD is ready, so there are no holes.
 * - Chunks past UNLOAD_RADIUS are disposed (geometry freed on the GPU).
 */
export class ChunkManager {
  readonly chunks = new Map<string, LoadedChunk>();
  private inflight = new Map<string, number>(); // key → requested lod
  private ready: Array<{ req: Request; data: ChunkData }> = [];
  private queue: Request[] = [];
  private center: ChunkCoord | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private disposed = false;

  constructor(private pool: WorkerPool) {}

  /** Call every frame with the player's world position. */
  update(x: number, z: number): void {
    const center = worldToChunk(x, z);
    if (!this.center || center.cx !== this.center.cx || center.cz !== this.center.cz) {
      this.center = center;
      this.plan();
    }
    this.dispatch();
    this.upload();
  }

  getVersion = (): number => this.version;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  stats(): { loaded: number; pending: number; lodCounts: number[] } {
    const lodCounts = LOD_LEVELS.map(() => 0);
    this.chunks.forEach((c) => lodCounts[c.lod]!++);
    return { loaded: this.chunks.size, pending: this.queue.length + this.inflight.size + this.ready.length, lodCounts };
  }

  dispose(): void {
    this.disposed = true;
    this.chunks.forEach((c) => c.geometry.dispose());
    this.chunks.clear();
    this.emit();
  }

  private plan(): void {
    const center = this.center!;
    let changed = false;

    for (const [key, chunk] of this.chunks) {
      if (chunkDistance(center, chunk) > UNLOAD_RADIUS) {
        chunk.geometry.dispose();
        this.chunks.delete(key);
        changed = true;
      }
    }

    this.queue = [];
    for (const want of desiredChunks(center, VIEW_RADIUS)) {
      const key = chunkKey(want.cx, want.cz);
      const have = this.chunks.get(key);
      if (have?.lod === want.lod || this.inflight.get(key) === want.lod) continue;
      this.queue.push({ key, ...want });
    }
    if (changed) this.emit();
  }

  private dispatch(): void {
    while (this.queue.length > 0 && this.inflight.size < MAX_INFLIGHT_BUILDS) {
      const req = this.queue.shift()!;
      const level = LOD_LEVELS[req.lod]!;
      this.inflight.set(req.key, req.lod);
      this.pool
        .buildChunk({ cx: req.cx, cz: req.cz, segments: level.segments, withProps: level.props })
        .then((data) => {
          // A newer request for this chunk (another LOD) supersedes this one.
          if (this.inflight.get(req.key) !== req.lod) return;
          this.inflight.delete(req.key);
          if (!this.disposed) this.ready.push({ req, data });
        })
        .catch(() => this.inflight.delete(req.key));
    }
  }

  private upload(): void {
    if (this.ready.length === 0 || !this.center) return;
    let changed = false;
    // A time budget, not just a count, so slow devices still catch up.
    const deadline = performance.now() + UPLOAD_BUDGET_MS;
    for (let n = 0; this.ready.length > 0 && (n < MAX_MESH_UPLOADS_PER_FRAME || performance.now() < deadline); n++) {
      const { req, data } = this.ready.shift()!;
      // The player may have moved on while this was building: drop stale results.
      const distance = chunkDistance(this.center, req);
      if (distance > VIEW_RADIUS) continue;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(0, data.minHeight - CHUNK_SIZE, 0),
        new THREE.Vector3(CHUNK_SIZE, data.maxHeight, CHUNK_SIZE),
      );
      geometry.computeBoundingSphere();

      this.chunks.get(req.key)?.geometry.dispose();
      this.chunks.set(req.key, { key: req.key, cx: req.cx, cz: req.cz, lod: req.lod, geometry, props: data.props });
      changed = true;
    }
    if (changed) this.emit();
  }

  private emit(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}
