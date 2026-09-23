import { useEffect } from 'react';
import { cameraRig, input } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

/**
 * Keyboard + mouse. Keys use `event.code` (physical position), so WASD works
 * on Norwegian, AZERTY and other layouts too.
 */
export function useControls(target: HTMLElement | null): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyF' && !e.repeat) useGameStore.getState().toggleTravelMode();
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      input.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => input.keys.delete(e.code);
    const blur = () => input.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      target.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      cameraRig.yaw -= (e.clientX - lastX) * 0.005;
      cameraRig.pitch = clamp(cameraRig.pitch + (e.clientY - lastY) * 0.004, 0.05, 1.4);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRig.distance = clamp(cameraRig.distance * Math.exp(e.deltaY * 0.001), 6, 2_000);
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('wheel', onWheel);
    };
  }, [target]);
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
