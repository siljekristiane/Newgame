import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { AVATAR } from '../config/world';
import { world } from '../design/tokens';
import { useAvatar } from '../avatar/useAvatar';
import { motion, origin, player } from '../state/runtime';
import { useWardrobeStore } from '../wardrobe/useWardrobeStore';

/**
 * The player's avatar, built from the look saved in the wardrobe (procedural
 * figure or a rigged .glb body, see avatar/models.ts). It is rebuilt when the
 * look changes and animated every frame from the movement state.
 */
export function Player() {
  const ref = useRef<THREE.Group>(null);
  const appearance = useWardrobeStore((s) => s.appearance);
  const avatar = useAvatar(appearance, AVATAR.gameDetail);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.set(player.x - origin.x, player.y, player.z - origin.z);
    g.rotation.y = player.heading;
    avatar?.update(Math.min(dt, 0.1), { speed: player.speed, air: motion.air });
  });

  return (
    <group ref={ref}>
      {avatar && <primitive object={avatar.group} />}
      <pointLight color={world.lamp} intensity={6} distance={18} position={[0, AVATAR.height + 0.9, 0]} />
    </group>
  );
}
