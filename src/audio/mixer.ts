import { AUDIO } from '../config/world';

/**
 * Mixer maths (pure, tested): the channels, how a slider becomes a gain, and
 * the player's sound settings kept in this browser.
 */

export const AUDIO_CHANNELS = ['master', 'music', 'ambience', 'effects', 'voice'] as const;
export type AudioChannel = (typeof AUDIO_CHANNELS)[number];
export type AudioVolumes = Record<AudioChannel, number>;

export interface AudioSettings {
  volumes: AudioVolumes;
  muted: boolean;
}

export function defaultAudioSettings(): AudioSettings {
  return { volumes: { ...AUDIO.volumes }, muted: false };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Slider 0..1 → gain. Squared: loudness is roughly logarithmic, so this feels even. */
export function volumeToGain(volume: number): number {
  const v = clamp01(volume);
  return v * v;
}

/** The gain a channel's bus should have (master mutes everything). */
export function channelGain(channel: AudioChannel, settings: AudioSettings): number {
  if (channel === 'master') return settings.muted ? 0 : volumeToGain(settings.volumes.master);
  return volumeToGain(settings.volumes[channel]);
}

const KEY = 'duskwood.audio';

/** Reads saved settings; anything missing or broken falls back to the defaults. */
export function parseAudioSettings(raw: string | null): AudioSettings {
  const out = defaultAudioSettings();
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Partial<{ volumes: Partial<Record<string, unknown>>; muted: unknown }>;
    for (const ch of AUDIO_CHANNELS) {
      const v = data.volumes?.[ch];
      if (typeof v === 'number') out.volumes[ch] = clamp01(v);
    }
    if (typeof data.muted === 'boolean') out.muted = data.muted;
  } catch {
    // Unreadable: keep the defaults.
  }
  return out;
}

export function loadAudioSettings(): AudioSettings {
  try {
    return parseAudioSettings(window.localStorage.getItem(KEY));
  } catch {
    return defaultAudioSettings();
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the settings last for this visit only.
  }
}
