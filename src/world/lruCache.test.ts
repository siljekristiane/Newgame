import { describe, expect, it } from 'vitest';
import { LruCache } from './lruCache';

describe('LruCache', () => {
  it('evicts the least recently stored entries beyond capacity', () => {
    const evicted: number[] = [];
    const c = new LruCache<number>(2, (v) => evicted.push(v));
    c.put('a', 1);
    c.put('b', 2);
    c.put('c', 3);
    expect(evicted).toEqual([1]);
    expect(c.has('a')).toBe(false);
    expect(c.size).toBe(2);
  });

  it('hands an entry back on take, without evicting it', () => {
    const evicted: number[] = [];
    const c = new LruCache<number>(2, (v) => evicted.push(v));
    c.put('a', 1);
    expect(c.take('a')).toBe(1);
    expect(c.take('a')).toBeUndefined();
    expect(evicted).toEqual([]);
  });

  it('replacing a key evicts the old value; clear evicts everything', () => {
    const evicted: number[] = [];
    const c = new LruCache<number>(3, (v) => evicted.push(v));
    c.put('a', 1);
    c.put('a', 2);
    expect(evicted).toEqual([1]);
    c.put('b', 3);
    c.clear();
    expect(evicted).toEqual([1, 2, 3]);
    expect(c.size).toBe(0);
  });
});
