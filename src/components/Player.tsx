import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { PLAYER } from '../config/world';
import { world } from '../design/tokens';
import { origin, player } from '../state/runtime';

/** Placeholder player: a sphere with a small cube "backpack" showing its facing. */
export function Player() {
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(player.x - origin.x, player.y + PLAYER.radius, player.z - origin.z);
    g.rotation.y = player.heading;
  });

  return (
    <group ref={ref}>
      <mesh>
        <icosahedronGeometry args={[PLAYER.radius, 2]} />
        <meshLambertMaterial color={world.crystal} flatShading emissive={world.crystalDeep} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.1, -0.85]}>
        <boxGeometry args={[0.9, 1, 0.5]} />
        <meshLambertMaterial color={world.wood} flatShading />
      </mesh>
      <pointLight color={world.lamp} intensity={6} distance={18} position={[0, 2.5, 0]} />
    </group>
  );
}
