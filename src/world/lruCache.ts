/**
 * A small least-recently-used cache. `take` removes the entry (the caller owns
 * it again); when the cache is over capacity, the oldest entries are handed to
 * `onEvict` (e.g. to free GPU memory).
 */
export class LruCache<V> {
  private map = new Map<string, V>();

  constructor(
    private readonly capacity: number,
    private readonly onEvict: (value: V) => void,
  ) {}

  get size(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Removes and returns the entry, or undefined. */
  take(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) this.map.delete(key);
    return value;
  }

  put(key: string, value: V): void {
    const old = this.map.get(key);
    if (old !== undefined) {
      this.map.delete(key);
      if (old !== value) this.onEvict(old);
    }
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const [oldestKey, oldest] = this.map.entries().next().value as [string, V];
      this.map.delete(oldestKey);
      this.onEvict(oldest);
    }
  }

  clear(): void {
    this.map.forEach((v) => this.onEvict(v));
    this.map.clear();
  }
}
