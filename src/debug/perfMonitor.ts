/**
 * Rolling frame-time statistics over the last `windowSize` frames.
 * Average FPS hides stutter, so the 95th-percentile frame time is tracked too.
 */
export class PerfMonitor {
  private times: Float32Array;
  private index = 0;
  private filled = 0;

  constructor(private windowSize = 120) {
    this.times = new Float32Array(windowSize);
  }

  push(frameMs: number): void {
    this.times[this.index] = frameMs;
    this.index = (this.index + 1) % this.windowSize;
    this.filled = Math.min(this.filled + 1, this.windowSize);
  }

  stats(): { fps: number; frameMs: number; frameMsP95: number } {
    if (this.filled === 0) return { fps: 0, frameMs: 0, frameMsP95: 0 };
    const sample = Array.from(this.times.subarray(0, this.filled)).sort((a, b) => a - b);
    const avg = sample.reduce((s, v) => s + v, 0) / sample.length;
    const p95 = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.95))]!;
    return { fps: avg > 0 ? 1000 / avg : 0, frameMs: avg, frameMsP95: p95 };
  }
}
