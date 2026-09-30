/**
 * Frame-time statistics over the last `windowMs` of wall-clock time.
 * Time-based (not "last N frames") so the numbers mean the same at 5 FPS as
 * at 144 FPS. Average FPS hides stutter, so the 95th-percentile frame time is
 * tracked too.
 */
export class PerfMonitor {
  private frames: Array<{ at: number; ms: number }> = [];

  constructor(private windowMs = 2000) {}

  push(frameMs: number, now = performance.now()): void {
    this.frames.push({ at: now, ms: frameMs });
    const cutoff = now - this.windowMs;
    while (this.frames.length > 1 && this.frames[0]!.at < cutoff) this.frames.shift();
  }

  stats(): { fps: number; frameMs: number; frameMsP95: number } {
    if (this.frames.length === 0) return { fps: 0, frameMs: 0, frameMsP95: 0 };
    const sample = this.frames.map((f) => f.ms).sort((a, b) => a - b);
    const avg = sample.reduce((s, v) => s + v, 0) / sample.length;
    const p95 = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.95))]!;
    return { fps: avg > 0 ? 1000 / avg : 0, frameMs: avg, frameMsP95: p95 };
  }
}
