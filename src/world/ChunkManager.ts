import * as THREE from 'three';
import { CHUNK_CACHE_SIZE, CHUNK_SIZE, LOD_LEVELS, MAX_INFLIGHT_BUILDS, MAX_MESH_UPLOADS_PER_FRAME, UNLOAD_RADIUS, UPLOAD_BUDGET_MS, VIEW_RADIUS } from '../config/world';
import type { ChunkData } from './buildChunk';
import { chunkDistance, chunkKey, desiredChunks, lodForDistance, worldToChunk, type ChunkCoord } from './chunkMath';
import { LruCache } from './lruCache';
import type { WorkerPool } from './workerPool';

export interface LoadedChunk {
  key: string;
  cx: number;
  cz: number;
  lod: number;
  geometry: THREE.BufferGeometry;
  /** PROP_STRIDE floats per prop, see ChunkData.props. Empty for far LODs. */
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
 * - Chunks that leave (or change LOD) go to a small LRU cache first, so walking
 *   back and forth over a chunk border reuses them instead of rebuilding;
 *   geometry is freed on the GPU when it falls out of the cache.
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
  private lastUpload = 0;
  private cache = new LruCache<LoadedChunk>(CHUNK_CACHE_SIZE, (c) => c.geometry.dispose());

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

  stats(): { loaded: number; pending: number; lodCounts: number[]; cached: number } {
    const lodCounts = LOD_LEVELS.map(() => 0);
    this.chunks.forEach((c) => lodCounts[c.lod]!++);
    return { loaded: this.chunks.size, pending: this.queue.length + this.inflight.size + this.ready.length, lodCounts, cached: this.cache.size };
  }

  dispose(): void {
    this.disposed = true;
    this.chunks.forEach((c) => c.geometry.dispose());
    this.chunks.clear();
    this.cache.clear();
    this.emit();
  }

  private plan(): void {
    const center = this.center!;
    let changed = false;

    const wanted = desiredChunks(center, VIEW_RADIUS);
    const wantedKeys = new Set(wanted.map((w) => chunkKey(w.cx, w.cz)));
    const coarsest = LOD_LEVELS.length - 1;
    for (const [key, chunk] of this.chunks) {
      // Chunks outside the wanted circle are only kept while coarse and close
      // (so the edge doesn't flicker). A finer one, left there by a long jump,
      // would never be re-planned, so drop it.
      const unwanted = !wantedKeys.has(key);
      if (chunkDistance(center, chunk) > UNLOAD_RADIUS || (unwanted && chunk.lod !== coarsest)) {
        this.retire(chunk);
        this.chunks.delete(key);
        changed = true;
      }
    }

    this.queue = [];
    for (const want of wanted) {
      const key = chunkKey(want.cx, want.cz);
      const have = this.chunks.get(key);
      if (have?.lod === want.lod || this.inflight.get(key) === want.lod) continue;
      // Built recently at this LOD? Use it again right away.
      const cached = this.cache.take(cacheKey(key, want.lod));
      if (cached) {
        if (have) this.retire(have);
        this.inflight.delete(key); // a build for another LOD is now stale
        this.chunks.set(key, cached);
        changed = true;
        continue;
      }
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
        .buildChunk({
          cx: req.cx,
          cz: req.cz,
          segments: level.segments,
          morphSegments: LOD_LEVELS[req.lod + 1]?.segments ?? 0,
          withProps: level.props,
        })
        .then((data) => {
          // A newer request for this chunk (another LOD) supersedes this one.
          if (this.inflight.get(req.key) !== req.lod) return;
          this.inflight.delete(req.key);
          if (!this.disposed) this.ready.push({ req, data });
        })
        .catch(() => this.inflight.delete(req.key))
        // Refill the workers as soon as one is free, not once per frame: on a
        // slow machine (or software rendering) building must not wait for frames.
        .finally(() => {
          if (!this.disposed) this.dispatch();
        });
    }
  }

  private upload(): void {
    if (this.ready.length === 0 || !this.center) return;
    let changed = false;
    // A time budget, not just a count, so slow devices still catch up. When a
    // frame already takes long, a few more ms of uploads are not noticeable.
    const now = performance.now();
    const frameMs = this.lastUpload > 0 ? now - this.lastUpload : 16;
    this.lastUpload = now;
    const deadline = now + Math.max(UPLOAD_BUDGET_MS, Math.min(frameMs * 0.25, 100));
    for (let n = 0; this.ready.length > 0 && (n < MAX_MESH_UPLOADS_PER_FRAME || performance.now() < deadline); n++) {
      const { req, data } = this.ready.shift()!;
      // The player may have moved on while this was building: drop stale results.
      const distance = chunkDistance(this.center, req);
      if (distance > VIEW_RADIUS || req.lod !== lodForDistance(distance)) continue;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setAttribute('morphHeight', new THREE.BufferAttribute(data.morphHeights, 1));
      geometry.setAttribute('morphNormal', new THREE.BufferAttribute(data.morphNormals, 3));
      geometry.setAttribute('morphColor', new THREE.BufferAttribute(data.morphColors, 3));
      geometry.setAttribute('surfaceWeights', new THREE.BufferAttribute(data.weights, 4));
      geometry.setAttribute('morphWeights', new THREE.BufferAttribute(data.morphWeights, 4));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(0, data.minHeight - CHUNK_SIZE, 0),
        new THREE.Vector3(CHUNK_SIZE, data.maxHeight, CHUNK_SIZE),
      );
      geometry.computeBoundingSphere();

      const old = this.chunks.get(req.key);
      if (old) this.retire(old);
      this.chunks.set(req.key, { key: req.key, cx: req.cx, cz: req.cz, lod: req.lod, geometry, props: data.props });
      changed = true;
    }
    if (changed) this.emit();
  }

  /** A chunk leaves the scene: keep it in the cache (which frees the oldest). */
  private retire(chunk: LoadedChunk): void {
    this.cache.put(cacheKey(chunk.key, chunk.lod), chunk);
  }

  private emit(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}

const cacheKey = (key: string, lod: number) => `${key}@${lod}`;
