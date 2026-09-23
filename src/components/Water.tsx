import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { SEA_LEVEL, WORLD_SIZE } from '../config/world';
import { world } from '../design/tokens';
import { origin } from '../state/runtime';

/**
 * The sea: one flat plane covering the whole 500 × 500 km world at sea level.
 * It also marks the world's extent: past its edge there is only sky.
 */
export function Water() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => ref.current?.position.set(WORLD_SIZE / 2 - origin.x, SEA_LEVEL, WORLD_SIZE / 2 - origin.z));
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
      <meshLambertMaterial color={world.water} />
    </mesh>
  );
}
