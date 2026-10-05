import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { AVATAR } from '../config/world';
import { world } from '../design/tokens';
import { animateAvatar, createAnimState } from '../avatar/animate';
import { buildAvatar } from '../avatar/buildAvatar';
import { motion, origin, player } from '../state/runtime';
import { useWardrobeStore } from '../wardrobe/useWardrobeStore';

/**
 * The player's avatar (src/avatar/), built from the look saved in the
 * wardrobe. It is rebuilt when the look changes and animated every frame from
 * the movement state.
 */
export function Player() {
  const ref = useRef<THREE.Group>(null);
  const appearance = useWardrobeStore((s) => s.appearance);
  const avatar = useMemo(() => buildAvatar(appearance, AVATAR.gameDetail), [appearance]);
  const anim = useRef(createAnimState());

  useEffect(() => () => avatar.dispose(), [avatar]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.set(player.x - origin.x, player.y, player.z - origin.z);
    g.rotation.y = player.heading;
    animateAvatar(avatar.rig, anim.current, Math.min(dt, 0.1), { speed: player.speed, air: motion.air });
  });

  return (
    <group ref={ref}>
      <primitive object={avatar.group} />
      <pointLight color={world.lamp} intensity={6} distance={18} position={[0, AVATAR.height + 0.9, 0]} />
    </group>
  );
}
