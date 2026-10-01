import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AUDIO } from '../config/world';
import { clock, player, weather } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { groundHeightAt } from '../world/ground';
import { lightingAt } from '../world/timeOfDay';
import { audioEngine } from './audioEngine';
import { MusicScheduler, ZoneTracker, zoneFor } from './musicDirector';
import { TRACKS, type Track } from './playlist';
import { soundStatus } from './status';

interface Deck {
  element: HTMLAudioElement;
  gain: GainNode;
  track: Track | null;
}

/** The one scheduler, so the test hook (and later the plot) can push layers. */
export const musicScheduler = new MusicScheduler(TRACKS);

/** Longest real-time step the director takes (a hidden tab must not skip the hysteresis). */
const MAX_STEP = 1;

/**
 * Plays the music the director asks for. The zone is worked out a couple of
 * times a second and followed once it holds (ZoneTracker); the scheduler
 * decides when pieces start, crossfade and pause. Two decks (an <audio>
 * element through a gain into the music bus) let one piece fade out while the
 * next fades in. Music runs on wall-clock time, not game time.
 */
export function MusicPlayer() {
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const decks = useRef<Deck[] | null>(null);
  const active = useRef(0);
  const tracker = useRef(new ZoneTracker());
  const last = useRef<number | null>(null);
  const sinceSample = useRef(Infinity);
  const raw = useRef<ReturnType<typeof zoneFor> | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('music');
    if (!ctx || !bus) return;
    const made: Deck[] = [0, 1].map(() => {
      const element = new Audio();
      element.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(element).connect(gain);
      gain.connect(bus);
      const deck: Deck = { element, gain, track: null };
      // A piece that ends or fails to load starts the pause.
      const done = () => {
        if (deck.track) musicScheduler.trackEnded(deck.track.id);
        deck.track = null;
      };
      element.addEventListener('ended', done);
      element.addEventListener('error', done);
      return deck;
    });
    decks.current = made;
    return () => {
      for (const d of made) {
        d.element.pause();
        d.element.removeAttribute('src');
        d.gain.disconnect();
      }
      decks.current = null;
    };
  }, [unlocked]);

  useFrame(() => {
    const now = performance.now() / 1000;
    const dt = last.current === null ? 0 : Math.min(MAX_STEP, now - last.current);
    last.current = now;

    sinceSample.current += dt;
    if (raw.current === null || sinceSample.current >= AUDIO.music.sampleInterval) {
      sinceSample.current = 0;
      raw.current = zoneFor({
        x: player.x,
        z: player.z,
        groundY: groundHeightAt(player.x, player.z),
        night: lightingAt(clock.hours).night,
        precipitation: weather.precipitation,
      });
    }
    const zone = tracker.current.update(dt, raw.current);
    soundStatus.zoneRaw = raw.current;
    soundStatus.zone = zone;
    soundStatus.target = musicScheduler.target(zone);

    const ds = decks.current;
    const ctx = audioEngine.context;
    if (!ds || !ctx) return; // no music before sound is unlocked
    const cmd = musicScheduler.update(dt, zone);
    soundStatus.track = musicScheduler.track?.id ?? null;
    if (!cmd) return;

    const fade = AUDIO.music.crossfade / 3;
    const old = ds[active.current]!;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade);
    const stopping = old.track;
    old.track = null; // its end no longer counts
    window.setTimeout(() => {
      if (!old.track && stopping) old.element.pause();
    }, AUDIO.music.crossfade * 1000);
    if (!('play' in cmd)) return;

    active.current = 1 - active.current;
    const deck = ds[active.current]!;
    deck.track = cmd.play;
    deck.element.src = `${import.meta.env.BASE_URL}${cmd.play.file}`;
    deck.element.currentTime = 0;
    deck.gain.gain.cancelScheduledValues(ctx.currentTime);
    deck.gain.gain.setValueAtTime(0, ctx.currentTime);
    deck.gain.gain.setTargetAtTime(1, ctx.currentTime, fade);
    deck.element.play().catch(() => {
      if (deck.track === cmd.play) musicScheduler.trackEnded(cmd.play.id);
      deck.track = null;
    });
  });

  return null;
}
