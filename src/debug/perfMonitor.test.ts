import { describe, expect, it } from 'vitest';
import { PerfMonitor } from './perfMonitor';

describe('PerfMonitor', () => {
  it('reports average fps and the slow tail', () => {
    const m = new PerfMonitor(100);
    for (let i = 0; i < 95; i++) m.push(10);
    for (let i = 0; i < 5; i++) m.push(50);
    const s = m.stats();
    expect(s.frameMs).toBeCloseTo(12, 5);
    expect(s.fps).toBeCloseTo(1000 / 12, 3);
    expect(s.frameMsP95).toBe(50);
  });

  it('only keeps the latest window', () => {
    const m = new PerfMonitor(4);
    [100, 100, 100, 100, 5, 5, 5, 5].forEach((t) => m.push(t));
    expect(m.stats().frameMs).toBe(5);
  });
});
