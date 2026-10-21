import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AUDIO, WORLD_SEED } from '../config/world';
import { player, weather } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { audioEngine } from './audioEngine';
import { gust, whiteNoise } from './ambience';
import { landscapeLevels, landscapeMix, synthLeavesLoop, synthSandLoop, synthSurfLoop, type LandscapeLevels, type LandscapeMix } from './landscape';
import { soundStatus } from './status';

interface Nodes {
  sources: AudioBufferSourceNode[];
  forest: GainNode;
  mountain: GainNode;
  howlLow: BiquadFilterNode;
  howlHigh: BiquadFilterNode;
  desert: GainNode;
  coast: GainNode;
}

/** Seconds for the layer gains to follow the gusts (smooth, never clicks). */
const SMOOTH = 0.4;

/**
 * The wind's voice per landscape (steg 3), on the ambience channel next to the
 * plain wind: leaves rustling in forest, a howl over mountains and ridges, sand
 * hissing on dry land, surf on the coast. The mix is sampled round the player
 * twice a second and eased, so walking from one landscape to the next fades
 * one voice into the other. Everything is synthesised (landscape.ts).
 */
export function LandscapeSound() {
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const nodes = useRef<Nodes | null>(null);
  const state = useRef({
    time: 0,
    sampleIn: 0,
    target: { forest: 0, mountain: 0, desert: 0, coast: 0 } as LandscapeMix,
    mix: null as LandscapeMix | null,
    levels: { forest: 0, mountain: 0, desert: 0, coast: 0, howl: 400 } as LandscapeLevels,
  });

  useEffect(() => {
    if (!unlocked) return;
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('ambience');
    if (!ctx || !bus) return;
    const leaves = audioEngine.buffer(synthLeavesLoop(ctx.sampleRate));
    const sand = audioEngine.buffer(synthSandLoop(ctx.sampleRate));
    const surf = audioEngine.buffer(synthSurfLoop(ctx.sampleRate));
    const noise = audioEngine.buffer(whiteNoise(ctx.sampleRate, 3, WORLD_SEED + 2_730));
    if (!leaves || !sand || !surf || !noise) return;

    const loop = (buffer: AudioBuffer, offset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start(0, offset);
      return src;
    };
    const gain = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      return g;
    };
    const filter = (type: BiquadFilterType, freq: number, q: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };

    const n: Nodes = { sources: [], forest: gain(), mountain: gain(), howlLow: filter('bandpass', 400, 9), howlHigh: filter('bandpass', 600, 12), desert: gain(), coast: gain() };
    const leavesSrc = loop(leaves, 0);
    leavesSrc.connect(n.forest);
    // Two resonances a fifth apart, gliding with the gusts: the howl over a ridge.
    const howlSrc = loop(noise, 0.5);
    howlSrc.connect(n.howlLow).connect(n.mountain);
    howlSrc.connect(n.howlHigh).connect(n.mountain);
    const sandSrc = loop(sand, 0);
    sandSrc.connect(n.desert);
    const surfSrc = loop(surf, 0);
    surfSrc.connect(n.coast);
    n.sources.push(leavesSrc, howlSrc, sandSrc, surfSrc);
    nodes.current = n;

    return () => {
      n.sources.forEach((s) => {
        s.stop();
        s.disconnect();
      });
      [n.forest, n.mountain, n.desert, n.coast, n.howlLow, n.howlHigh].forEach((g) => g.disconnect());
      nodes.current = null;
    };
  }, [unlocked]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = state.current;
    s.time += dt;
    // Where am I? (A few terrain samples, twice a second; the mix then eases over `smooth`.)
    s.sampleIn -= dt;
    if (s.sampleIn <= 0) {
      s.sampleIn = AUDIO.landscape.sampleInterval;
      landscapeMix(player.x, player.z, s.target);
    }
    if (!s.mix) s.mix = { ...s.target };
    // Eased in real time (slow frames do not slow the fade), at most a second per frame.
    const k = 1 - Math.exp(-Math.min(rawDt, 1) / AUDIO.landscape.smooth);
    const mix = s.mix;
    mix.forest += (s.target.forest - mix.forest) * k;
    mix.mountain += (s.target.mountain - mix.mountain) * k;
    mix.desert += (s.target.desert - mix.desert) * k;
    mix.coast += (s.target.coast - mix.coast) * k;
    // Gusts of their own (offset from the plain wind's), so the layers breathe apart.
    const lv = landscapeLevels(mix, Math.hypot(weather.windX, weather.windZ), gust(s.time + 31), s.levels);
    soundStatus.landscape.forest = lv.forest;
    soundStatus.landscape.mountain = lv.mountain;
    soundStatus.landscape.desert = lv.desert;
    soundStatus.landscape.coast = lv.coast;
    soundStatus.landscapeMix.forest = mix.forest;
    soundStatus.landscapeMix.mountain = mix.mountain;
    soundStatus.landscapeMix.desert = mix.desert;
    soundStatus.landscapeMix.coast = mix.coast;

    const n = nodes.current;
    const ctx = audioEngine.context;
    if (!n || !ctx) return;
    const now = ctx.currentTime;
    n.forest.gain.setTargetAtTime(lv.forest, now, SMOOTH);
    n.mountain.gain.setTargetAtTime(lv.mountain * 3, now, SMOOTH); // narrow bands carry little energy
    n.howlLow.frequency.setTargetAtTime(lv.howl, now, SMOOTH * 2);
    n.howlHigh.frequency.setTargetAtTime(lv.howl * 1.5, now, SMOOTH * 2);
    n.desert.gain.setTargetAtTime(lv.desert, now, SMOOTH);
    n.coast.gain.setTargetAtTime(lv.coast, now, SMOOTH * 2);
  });

  return null;
}
