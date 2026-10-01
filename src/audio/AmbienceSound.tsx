import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { WORLD_SEED } from '../config/world';
import { player, weather } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { snowFraction } from '../weather/weather';
import { climateAt } from '../world/biomes';
import { audioEngine } from './audioEngine';
import { gust, rainSound, synthRainLoop, whiteNoise, windSound } from './ambience';
import { soundStatus } from './status';

interface Nodes {
  sources: AudioBufferSourceNode[];
  windFilter: BiquadFilterNode;
  wind: GainNode;
  whistle: GainNode;
  rain: GainNode;
  snow: GainNode;
}

/** Seconds for the ambience levels to follow the weather (smooth, never clicks). */
const SMOOTH = 0.4;

/**
 * Wind, rain and the soft hiss of falling snow, all synthesised: looping noise
 * through filters whose level and brightness follow `runtime.weather`, the
 * player's height and slow gusts. Built once sound is unlocked.
 */
export function AmbienceSound() {
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const nodes = useRef<Nodes | null>(null);
  const time = useRef(0);

  useEffect(() => {
    if (!unlocked) return;
    const ctx = audioEngine.context;
    const bus = audioEngine.bus('ambience');
    const noise = ctx && audioEngine.buffer(whiteNoise(ctx.sampleRate, 3, WORLD_SEED + 2_300));
    const rainLoop = ctx && audioEngine.buffer(synthRainLoop(ctx.sampleRate));
    if (!ctx || !bus || !noise || !rainLoop) return;

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

    const n: Nodes = { sources: [], windFilter: filter('lowpass', 400, 0.8), wind: gain(), whistle: gain(), rain: gain(), snow: gain() };
    const windSrc = loop(noise, 0);
    windSrc.connect(n.windFilter).connect(n.wind);
    const whistleSrc = loop(noise, 1.1);
    whistleSrc.connect(filter('bandpass', 780, 9)).connect(n.whistle);
    const rainSrc = loop(rainLoop, 0);
    rainSrc.connect(filter('lowpass', 8000, 0.7)).connect(n.rain);
    const snowSrc = loop(noise, 2.2);
    snowSrc.connect(filter('bandpass', 5200, 0.6)).connect(n.snow);
    n.sources.push(windSrc, whistleSrc, rainSrc, snowSrc);
    nodes.current = n;

    return () => {
      n.sources.forEach((s) => {
        s.stop();
        s.disconnect();
      });
      [n.wind, n.whistle, n.rain, n.snow].forEach((g) => g.disconnect());
      nodes.current = null;
    };
  }, [unlocked]);

  useFrame((_, dt) => {
    const n = nodes.current;
    const ctx = audioEngine.context;
    if (!n || !ctx) return;
    time.current += Math.min(dt, 0.1);
    const now = ctx.currentTime;
    const g = gust(time.current);
    const w = windSound(Math.hypot(weather.windX, weather.windZ), player.y, g);
    n.wind.gain.setTargetAtTime(w.gain, now, SMOOTH);
    n.windFilter.frequency.setTargetAtTime(w.cutoff, now, SMOOTH);
    // A faint whistle rides the strongest gusts.
    n.whistle.gain.setTargetAtTime(w.gain * Math.max(0, g - 0.6) * 0.5, now, SMOOTH);
    const r = rainSound(weather.precipitation, snowFraction(climateAt(player.x, player.z, player.y).temperature));
    n.rain.gain.setTargetAtTime(r.rain, now, SMOOTH);
    n.snow.gain.setTargetAtTime(r.snow, now, SMOOTH);
    soundStatus.wind = w.gain;
    soundStatus.rain = r.rain;
    soundStatus.snow = r.snow;
  });

  return null;
}
