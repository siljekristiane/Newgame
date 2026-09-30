import { describe, expect, it } from 'vitest';
import { AUDIO } from '../config/world';
import { channelGain, defaultAudioSettings, parseAudioSettings, volumeToGain } from './mixer';

describe('audio mixer', () => {
  it('maps sliders to gain on a squared curve, clamped to 0..1', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });

  it('mutes through the master bus only', () => {
    const s = { ...defaultAudioSettings(), muted: true };
    expect(channelGain('master', s)).toBe(0);
    expect(channelGain('music', s)).toBeCloseTo(AUDIO.volumes.music ** 2);
  });

  it('reads saved settings and falls back on anything broken', () => {
    expect(parseAudioSettings(null)).toEqual(defaultAudioSettings());
    expect(parseAudioSettings('not json')).toEqual(defaultAudioSettings());
    const s = parseAudioSettings(JSON.stringify({ muted: true, volumes: { music: 0.2, voice: 7, bogus: 1, effects: 'x' } }));
    expect(s.muted).toBe(true);
    expect(s.volumes.music).toBe(0.2);
    expect(s.volumes.voice).toBe(1);
    expect(s.volumes.effects).toBe(AUDIO.volumes.effects);
  });
});
