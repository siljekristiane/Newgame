import { useEffect } from 'react';
import { useGameStore } from '../state/useGameStore';
import { audioEngine } from './audioEngine';

/**
 * Connects the audio engine to the game: unlocks sound on the first click or
 * key press, follows the volume settings, and pauses sound with a hidden tab.
 * Sound systems (ambience, footsteps, music, voice) mount alongside it.
 */
export function AudioSystem() {
  useEffect(() => {
    const unlock = () => {
      audioEngine.unlock();
      if (audioEngine.unlocked) useGameStore.getState().setAudioUnlocked(true);
    };
    const visibility = () => audioEngine.setVisible(document.visibilityState === 'visible');
    audioEngine.apply(useGameStore.getState().audio);
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      if (s.audio !== prev.audio) audioEngine.apply(s.audio);
    });
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return null;
}
