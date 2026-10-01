import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AUDIO } from '../config/world';
import { motion, player } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { audioEngine } from './audioEngine';
import { soundStatus } from './status';
import { babble, HUM_MELODIES, melodyNotes, renderVoice } from './voice';
import { voiceInput } from './voiceInput';

const V = AUDIO.voice;

interface Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
  kind: 'hum' | 'talk';
}

/**
 * The avatar's voice. It hums a public-domain melody after standing still for
 * a while (never while music plays, and not too often) and stops when it walks
 * on; T makes it say something (wordless babble). Sound is rendered offline
 * the first time it is needed and kept; it plays on the voice bus and ducks
 * the music while it lasts.
 */
export function VoiceSound() {
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const playing = useRef<Playing | null>(null);
  const hums = useRef(new Map<string, AudioBuffer>());
  const still = useRef(0);
  const sinceHum = useRef(Infinity);
  const humIndex = useRef(0);
  const talkSeed = useRef(0);
  const talkSeen = useRef(voiceInput.talk);

  useEffect(() => {
    if (!unlocked) return;
    const cache = hums.current;
    return () => {
      playing.current?.source.stop();
      playing.current = null;
      cache.clear();
    };
  }, [unlocked]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('voice');
    sinceHum.current += dt;
    const moving = player.speed > V.stillSpeed || motion.air > 0;
    still.current = moving ? 0 : still.current + dt;

    const stop = (fade: number) => {
      const p = playing.current;
      if (!p || !ctx) return;
      playing.current = null;
      p.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      p.source.stop(ctx.currentTime + fade);
      audioEngine.setDucked(false);
      soundStatus.voice = 'idle';
    };

    const play = (buffer: AudioBuffer, kind: 'hum' | 'talk', level: number) => {
      if (!ctx || !bus) return;
      stop(0.05);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(bus);
      const p: Playing = { source, gain, kind };
      source.onended = () => {
        if (playing.current !== p) return;
        playing.current = null;
        audioEngine.setDucked(false);
        soundStatus.voice = 'idle';
      };
      source.start();
      playing.current = p;
      audioEngine.setDucked(true);
      soundStatus.voice = kind;
      soundStatus.voiceCount++;
    };

    // T: say something now (cuts a hum short).
    if (voiceInput.talk !== talkSeen.current) {
      talkSeen.current = voiceInput.talk;
      if (ctx) {
        const seed = talkSeed.current++;
        const buffer = audioEngine.buffer(renderVoice(babble(seed, seed % 3 === 2 ? 'eager' : 'calm'), ctx.sampleRate, 0.8, seed));
        if (buffer) play(buffer, 'talk', V.talkGain);
      }
      return;
    }

    // Walking on ends a hum.
    if (playing.current?.kind === 'hum' && moving) {
      stop(V.fadeOut);
      return;
    }

    // Standing still for a while, no music, nothing said lately: hum.
    const musicPlaying = soundStatus.track !== null;
    if (!playing.current && ctx && still.current >= V.idleDelay && sinceHum.current >= V.minInterval && !musicPlaying) {
      const melody = HUM_MELODIES[humIndex.current++ % HUM_MELODIES.length]!;
      let buffer = hums.current.get(melody.id);
      if (!buffer) {
        buffer = audioEngine.buffer(renderVoice(melodyNotes(melody), ctx.sampleRate, 0.8)) ?? undefined;
        if (buffer) hums.current.set(melody.id, buffer);
      }
      if (buffer) {
        play(buffer, 'hum', V.humGain);
        sinceHum.current = 0;
      }
    }
  });

  return null;
}
