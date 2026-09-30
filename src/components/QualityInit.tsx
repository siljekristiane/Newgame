import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { detectQuality, loadQuality, rendererName } from '../settings/quality';
import { useGameStore } from '../state/useGameStore';

/**
 * Picks the quality preset once at start: the player's saved choice, or one
 * detected from the GPU name (software rendering starts low). Mounted first in
 * the scene so a test that sets the quality afterwards wins.
 */
export function QualityInit() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (useGameStore.getState().quality !== null) return;
    const level = loadQuality() ?? detectQuality(rendererName(gl.getContext()));
    useGameStore.getState().setQuality(level, false);
  }, [gl]);
  return null;
}
