import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AVATAR } from '../config/world';
import type { Appearance } from '../avatar/appearance';
import { useAvatar } from '../avatar/useAvatar';

/** Zoom range in the preview, meters from the avatar. */
const ZOOM = { near: 0.55, far: 4.4, start: 3.4 };

/**
 * The wardrobe's 3D preview: the avatar in full detail on a small stone,
 * dragged to turn and scrolled (or pinched) to zoom right in to the face.
 */
export function AvatarPreview({ appearance }: { appearance: Appearance }) {
  return (
    <div className="dw-ward-preview">
      <Canvas camera={{ fov: 28, near: 0.02, far: 40, position: [0, 1.1, ZOOM.start] }} dpr={[1, 2]} shadows gl={{ antialias: true }}>
        <PreviewScene appearance={appearance} />
      </Canvas>
    </div>
  );
}

function PreviewScene({ appearance }: { appearance: Appearance }) {
  const avatar = useAvatar(appearance, 'high', 2);
  const view = useRef({ yaw: 0.35, dist: ZOOM.start, pinch: 0 });
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      if (pointers.size === 1) view.current.yaw -= (e.clientX - last.x) * 0.01;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const span = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (view.current.pinch) zoom(view.current.pinch / span);
        view.current.pinch = span;
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      view.current.pinch = 0;
    };
    const zoom = (factor: number) => {
      view.current.dist = Math.min(ZOOM.far, Math.max(ZOOM.near, view.current.dist * factor));
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.0012));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  useFrame((_, dt) => {
    avatar?.update(Math.min(dt, 0.1), { speed: 0, air: 0 });
    const { yaw, dist } = view.current;
    // Whole figure when far, the face when close.
    const t = Math.min(1, Math.max(0, (ZOOM.far - dist) / (ZOOM.far - ZOOM.near)));
    const focus = AVATAR.height * (0.55 + 0.37 * t * t);
    camera.position.set(Math.sin(yaw) * dist, focus + 0.08 * (1 - t), Math.cos(yaw) * dist);
    camera.lookAt(0, focus, 0);
  });

  return (
    <>
      <hemisphereLight args={['#cfe0ff', '#5b5a45', 1.2]} />
      <directionalLight position={[2.5, 5, 4]} intensity={3} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-3, 2, -3]} intensity={1.1} color="#b8c8ff" />
      {avatar && <primitive object={avatar.group} />}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[0.55, 64]} />
        <meshStandardMaterial color="#857d72" roughness={0.95} />
      </mesh>
    </>
  );
}
