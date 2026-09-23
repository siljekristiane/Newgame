import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { CAMERA } from './config/world';
import { Scene } from './components/Scene';
import { useControls } from './input/useControls';
import { Hud } from './ui/Hud';

export function App() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useControls(canvas);

  return (
    <>
      <Canvas
        ref={setCanvas}
        camera={{ fov: 60, near: CAMERA.near, far: CAMERA.far, position: [0, 20, 30] }}
        gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.75]}
      >
        <Scene />
      </Canvas>
      <Hud />
    </>
  );
}
