import { AUDIO } from '../config/world';
import { AUDIO_CHANNELS, channelGain, type AudioChannel, type AudioSettings } from './mixer';

/**
 * The game's one AudioContext and its mixer: master → music / ambience /
 * effects / voice. Sound systems connect to `bus(channel)`.
 *
 * Browsers only allow sound after the player has interacted with the page, so
 * the context is created on the first click or key press (`unlock`). It is
 * suspended while the tab is hidden. A music-only duck gain lets the voice
 * pull the music down while the avatar speaks.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buses = new Map<AudioChannel, GainNode>();
  private duck: GainNode | null = null;
  private settings: AudioSettings | null = null;
  private listeners = new Set<() => void>();

  get context(): AudioContext | null {
    return this.ctx;
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state !== 'closed';
  }

  /** 'none' before the first interaction, else the context's state. */
  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  /** Call from a user gesture. Safe to call again (resumes a suspended context). */
  unlock(): void {
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.build(this.ctx);
      this.emit();
    }
    if (this.ctx.state === 'suspended' && document.visibilityState === 'visible') void this.ctx.resume();
  }

  /** The bus a sound system plays into, or null before unlock. */
  bus(channel: Exclude<AudioChannel, 'master'>): GainNode | null {
    return this.buses.get(channel) ?? null;
  }

  apply(settings: AudioSettings): void {
    this.settings = settings;
    const ctx = this.ctx;
    if (!ctx) return;
    for (const ch of AUDIO_CHANNELS) this.buses.get(ch)?.gain.setTargetAtTime(channelGain(ch, settings), ctx.currentTime, AUDIO.volumeRamp / 3);
  }

  /** Pulls the music down (true) or lets it back up (false). */
  setDucked(ducked: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.duck) return;
    this.duck.gain.setTargetAtTime(ducked ? AUDIO.duckLevel : 1, ctx.currentTime, AUDIO.duckRamp / 3);
  }

  /** Suspends while the tab is hidden, resumes when it comes back. */
  setVisible(visible: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (visible && ctx.state === 'suspended') void ctx.resume();
    if (!visible && ctx.state === 'running') void ctx.suspend();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private build(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.buses.set('master', master);
    this.duck = ctx.createGain();
    this.duck.connect(master);
    for (const ch of AUDIO_CHANNELS) {
      if (ch === 'master') continue;
      const g = ctx.createGain();
      g.connect(ch === 'music' ? this.duck : master);
      this.buses.set(ch, g);
    }
    // Start silent and ease to the current settings.
    for (const g of this.buses.values()) g.gain.value = 0;
    if (this.settings) this.apply(this.settings);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

/** The one engine for the whole game. */
export const audioEngine = new AudioEngine();
