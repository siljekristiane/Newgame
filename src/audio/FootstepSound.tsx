import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AUDIO, WORLD_SEED } from '../config/world';
import { motion, player } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { mulberry32 } from '../world/noise';
import { audioEngine } from './audioEngine';
import { STEP_SURFACES, stepCadence, surfaceUnderfoot, synthFootstep, type StepSurface } from './footsteps';
import { soundStatus } from './status';

/**
 * The player's footsteps: a foot lands at the cadence for the current speed
 * (only on the ground), with a sound for what is underfoot; a jump ends with a
 * heavier landing. A few synthesised variants per surface, played at slightly
 * different pitch and level, so no two steps sound the same.
 */
export function FootstepSound() {
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const buffers = useRef<Map<StepSurface, AudioBuffer[]> | null>(null);
  const phase = useRef(0.6); // the first step comes soon after starting to move
  const wasInAir = useRef(false);
  const random = useRef(mulberry32(WORLD_SEED + 2_400));

  useEffect(() => {
    if (!unlocked) return;
    const ctx = audioEngine.context;
    if (!ctx) return;
    const map = new Map<StepSurface, AudioBuffer[]>();
    for (const s of STEP_SURFACES) {
      const list: AudioBuffer[] = [];
      for (let v = 0; v < AUDIO.steps.variants; v++) {
        const b = audioEngine.buffer(synthFootstep(s, v, ctx.sampleRate));
        if (b) list.push(b);
      }
      map.set(s, list);
    }
    buffers.current = map;
    return () => {
      buffers.current = null;
    };
  }, [unlocked]);

  useFrame((_, dt) => {
    const map = buffers.current;
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('effects');
    if (!map || !ctx || !bus) return;
    const inAir = motion.air > 0;
    if (wasInAir.current && !inAir) playStep(map, ctx, bus, random.current, AUDIO.steps.landingGain, 0.85);
    wasInAir.current = inAir;
    if (inAir) return;

    const cadence = stepCadence(player.speed);
    if (cadence === 0) {
      phase.current = 0.6;
      return;
    }
    phase.current += cadence * Math.min(dt, 0.1);
    if (phase.current >= 1) {
      phase.current = Math.min(phase.current - 1, 0.5);
      playStep(map, ctx, bus, random.current, AUDIO.steps.gain, 1);
    }
  });

  return null;
}

/** Plays one step for the surface under the player, with a little random pitch and level. */
function playStep(map: Map<StepSurface, AudioBuffer[]>, ctx: AudioContext, bus: GainNode, r: () => number, level: number, pitch: number): void {
  const surface = surfaceUnderfoot(player.x, player.z, player.y - motion.air);
  const list = map.get(surface);
  if (!list || list.length === 0) return;
  const src = ctx.createBufferSource();
  src.buffer = list[Math.floor(r() * list.length)]!;
  src.playbackRate.value = pitch * (0.92 + r() * 0.16);
  const g = ctx.createGain();
  g.gain.value = level * (0.8 + r() * 0.4);
  src.connect(g).connect(bus);
  src.onended = () => g.disconnect();
  src.start();
  soundStatus.steps++;
  soundStatus.lastStep = surface;
}
