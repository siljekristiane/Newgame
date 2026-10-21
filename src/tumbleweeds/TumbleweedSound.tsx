import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AUDIO, WORLD_SEED } from '../config/world';
import { audioEngine } from '../audio/audioEngine';
import { cameraRig, player } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { mulberry32 } from '../world/noise';
import { crackleLevel, synthCrackle, synthRustleLoop } from './sound';
import { tumbleweedState } from './state';

/** Seconds for the rustle level to follow the rolling. */
const SMOOTH = 0.25;
/** At most this many crackles start in one frame (a pile-up is one sound anyway). */
const MAX_PER_FRAME = 3;

/**
 * The tumbleweeds' sound: a dry rustle loop whose level follows how much is
 * rolling near the player (tumbleweedState.rustle), and a crackle for each
 * bounce or kick, louder when hard and near, panned to where it happened.
 */
export function TumbleweedSound() {
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const nodes = useRef<{ rustle: GainNode; crackles: AudioBuffer[] } | null>(null);
  const random = useRef(mulberry32(WORLD_SEED + 9_700));

  useEffect(() => {
    if (!unlocked) return;
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('effects');
    const loop = ctx && audioEngine.buffer(synthRustleLoop(ctx.sampleRate));
    if (!ctx || !bus || !loop) return;
    const crackles: AudioBuffer[] = [];
    for (let v = 0; v < AUDIO.tumbleweeds.variants; v++) {
      const b = audioEngine.buffer(synthCrackle(v, ctx.sampleRate));
      if (b) crackles.push(b);
    }
    const src = ctx.createBufferSource();
    src.buffer = loop;
    src.loop = true;
    const rustle = ctx.createGain();
    rustle.gain.value = 0;
    src.connect(rustle).connect(bus);
    src.start();
    nodes.current = { rustle, crackles };
    return () => {
      src.stop();
      src.disconnect();
      rustle.disconnect();
      nodes.current = null;
    };
  }, [unlocked]);

  useFrame(() => {
    const n = nodes.current;
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('effects');
    const impacts = tumbleweedState.impacts;
    if (!n || !ctx || !bus) {
      impacts.length = 0;
      return;
    }
    n.rustle.gain.setTargetAtTime(AUDIO.tumbleweeds.rustleGain * tumbleweedState.rustle, ctx.currentTime, SMOOTH);
    let started = 0;
    for (const hit of impacts) {
      if (started >= MAX_PER_FRAME || n.crackles.length === 0) break;
      const dx = hit.x - player.x;
      const dz = hit.z - player.z;
      const level = crackleLevel(hit.strength, Math.hypot(dx, dz));
      if (level < 0.01) continue;
      const r = random.current;
      const src = ctx.createBufferSource();
      src.buffer = n.crackles[Math.floor(r() * n.crackles.length)]!;
      src.playbackRate.value = 0.85 + r() * 0.3;
      const g = ctx.createGain();
      g.gain.value = level;
      // Pan by the side it is on as seen from the camera (yaw 0 looks north, -Z).
      const pan = ctx.createStereoPanner();
      const right = dx * Math.cos(cameraRig.yaw) - dz * Math.sin(cameraRig.yaw);
      pan.pan.value = Math.max(-0.8, Math.min(0.8, right / (Math.hypot(dx, dz) + 3)));
      src.connect(g).connect(pan).connect(bus);
      src.onended = () => pan.disconnect();
      src.start();
      started++;
    }
    impacts.length = 0;
  });

  return null;
}
