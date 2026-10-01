import { useEffect } from 'react';
import { PLAYER } from '../config/world';
import { cameraRig, input } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { voiceInput } from '../audio/voiceInput';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

/**
 * Keyboard + mouse. Keys use `event.code` (physical position), so WASD works
 * on Norwegian, AZERTY and other layouts too.
 *
 * A click on the game captures the mouse (pointer lock), as in most PC games:
 * then moving the mouse turns the camera, and Esc lets it go. Without the
 * lock (or where the browser refuses it), dragging turns the camera.
 */
export function useControls(target: HTMLElement | null): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const store = useGameStore.getState();
      if (e.code === 'KeyF' && !e.repeat) store.toggleTravelMode();
      if (e.code === 'KeyN' && !e.repeat) store.toggleMinimap();
      if (e.code === 'KeyP' && !e.repeat) store.togglePosition();
      if (e.code === 'KeyH' && !e.repeat) store.toggleHudPanels();
      if (e.code === 'KeyU' && !e.repeat) store.toggleMute();
      if (e.code === 'KeyT' && !e.repeat) voiceInput.talk++;
      if (e.code === 'KeyM' && !e.repeat) {
        const open = !store.bigMapOpen;
        store.setBigMapOpen(open);
        // The map needs the mouse pointer.
        if (open && document.pointerLockElement) document.exitPointerLock();
      }
      if (e.code === 'Escape' && store.bigMapOpen) store.setBigMapOpen(false);
      if (e.code === 'F3') {
        e.preventDefault(); // F3 is "find" in most browsers
        if (!e.repeat) useGameStore.getState().toggleDebug();
        return;
      }
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
    const locked = () => document.pointerLockElement === target;
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && !locked() && target.requestPointerLock) {
        // Newer browsers return a promise that rejects when the lock is refused.
        Promise.resolve(target.requestPointerLock()).catch(() => undefined);
      }
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      // Capture keeps a drag going outside the canvas. It throws while the
      // pointer is being locked (the lock takes over), which is fine to skip.
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Pointer lock in progress: no capture needed.
      }
    };
    const onMove = (e: PointerEvent) => {
      if (locked()) {
        cameraRig.yaw -= e.movementX * PLAYER.mouseSensitivity;
        cameraRig.pitch = clamp(cameraRig.pitch + e.movementY * PLAYER.mouseSensitivity, 0.05, 1.4);
        return;
      }
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
    const onLockChange = () => useGameStore.getState().setPointerLocked(locked());
    document.addEventListener('pointerlockchange', onLockChange);
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('wheel', onWheel);
    };
  }, [target]);
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
