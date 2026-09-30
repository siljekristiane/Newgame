import { describe, expect, it } from 'vitest';
import { QUALITY } from '../config/world';
import { detectQuality, isQualityLevel } from './quality';

describe('quality presets', () => {
  it('starts low on software rendering, medium on integrated GPUs, high otherwise', () => {
    expect(detectQuality('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('low');
    expect(detectQuality('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('low');
    expect(detectQuality('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)')).toBe('medium');
    expect(detectQuality('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)')).toBe('high');
    expect(detectQuality('Apple M2')).toBe('high');
  });

  it('only accepts known levels, and higher levels never switch features off', () => {
    expect(isQualityLevel('medium')).toBe(true);
    expect(isQualityLevel('ultra')).toBe(false);
    expect(isQualityLevel(null)).toBe(false);
    const order = ['low', 'medium', 'high'] as const;
    for (let i = 1; i < order.length; i++) {
      const lo = QUALITY[order[i - 1]!];
      const hi = QUALITY[order[i]!];
      expect(hi.dprMax).toBeGreaterThanOrEqual(lo.dprMax);
      for (const k of ['shadows', 'textures', 'vegetation', 'grass'] as const) expect(Number(hi[k])).toBeGreaterThanOrEqual(Number(lo[k]));
    }
  });
});
