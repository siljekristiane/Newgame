import { useEffect, useState } from 'react';
import { AUDIO_CHANNELS, type AudioChannel } from '../audio/mixer';
import { MUSIC_ZONES, TRACKS, trackTitle, ZONE_NAMES, type MusicZone } from '../audio/playlist';
import { soundStatus } from '../audio/status';
import { useGameStore } from '../state/useGameStore';

const LABELS: Record<AudioChannel, string> = {
  master: 'Hovedvolum',
  music: 'Musikk',
  ambience: 'Omgivelser',
  effects: 'Effekter',
  voice: 'Stemme',
};

/** Sound settings in the F3 panel: mute (also U) and a slider per channel. */
export function AudioControls() {
  const audio = useGameStore((s) => s.audio);
  const unlocked = useGameStore((s) => s.audioUnlocked);
  const setVolume = useGameStore((s) => s.setVolume);
  const toggleMute = useGameStore((s) => s.toggleMute);

  return (
    <div className="dw-audio" role="group" aria-label="Lyd">
      <label className="dw-toggle">
        <input type="checkbox" checked={audio.muted} onChange={toggleMute} /> Lyd av (U)
        {!unlocked && <span className="dw-caption"> · klikk i spillet for lyd</span>}
      </label>
      <MusicLine />
      {AUDIO_CHANNELS.map((ch) => (
        <label key={ch} className="dw-toggle dw-time">
          <span>{LABELS[ch]}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(audio.volumes[ch] * 100)}
            onChange={(e) => setVolume(ch, Number(e.target.value) / 100)}
            aria-label={LABELS[ch]}
          />
        </label>
      ))}
    </div>
  );
}

const isZone = (v: string | null): v is MusicZone => v !== null && (MUSIC_ZONES as readonly string[]).includes(v);

/** "Musikk: <zone> · <piece>", read from the sound status twice a second. */
function MusicLine() {
  const [line, setLine] = useState('');
  useEffect(() => {
    const read = () => {
      const { target, track } = soundStatus;
      const where = isZone(target) ? ZONE_NAMES[target] : (target ?? '–');
      const piece = TRACKS.find((t) => t.id === track);
      const anyFile = TRACKS.some((t) => t.file !== null);
      setLine(`Musikk: ${where} · ${piece ? trackTitle(piece) : anyFile ? 'pause' : 'venter på musikkfiler'}`);
    };
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, []);
  return <div className="dw-caption">{line}</div>;
}
