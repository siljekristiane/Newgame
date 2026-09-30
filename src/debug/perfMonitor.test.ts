import { describe, expect, it } from 'vitest';
import { PerfMonitor } from './perfMonitor';

describe('PerfMonitor', () => {
  it('reports average fps and the slow tail', () => {
    const m = new PerfMonitor(10_000);
    let t = 0;
    for (let i = 0; i < 95; i++) m.push(10, (t += 10));
    for (let i = 0; i < 5; i++) m.push(50, (t += 50));
    const s = m.stats();
    expect(s.frameMs).toBeCloseTo(12, 5);
    expect(s.fps).toBeCloseTo(1000 / 12, 3);
    expect(s.frameMsP95).toBe(50);
  });

  it('only keeps the last window of time, even at low frame rates', () => {
    const m = new PerfMonitor(2000);
    let t = 0;
    for (let i = 0; i < 4; i++) m.push(1000, (t += 1000)); // slow: 1 FPS
    for (let i = 0; i < 100; i++) m.push(10, (t += 10)); // then 1 s of 100 FPS
    // Window = the last 2 s (from t = 3000 to 5000): the slow frames at t = 1000 and
    // 2000 are gone, the ones at 3000 and 4000 remain alongside the 100 fast ones.
    expect(m.stats().frameMs).toBeCloseTo((2 * 1000 + 100 * 10) / 102, 6);
  });
});
