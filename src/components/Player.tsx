import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { AVATAR } from '../config/world';
import { world } from '../design/tokens';
import { useAvatar } from '../avatar/useAvatar';
import { lightDirections } from '../materials/terrainShadow';
import { cameraRig, motion, origin, player } from '../state/runtime';
import { useWardrobeStore } from '../wardrobe/useWardrobeStore';

const L = AVATAR.light;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The player's avatar, built from the look saved in the wardrobe (procedural
 * figure or a rigged .glb body, see avatar/models.ts). It is rebuilt when the
 * look changes and animated every frame from the movement state.
 */
export function Player() {
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const appearance = useWardrobeStore((s) => s.appearance);
  const avatar = useAvatar(appearance, AVATAR.gameDetail);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.set(player.x - origin.x, player.y, player.z - origin.z);
    if (body.current) body.current.rotation.y = player.heading;
    avatar?.update(Math.min(dt, 0.1), { speed: player.speed, air: motion.air });
    const l = light.current;
    if (l) {
      // The camera sits along (sin yaw, cos yaw) from the player (FollowCamera).
      l.position.set(Math.sin(cameraRig.yaw) * L.towardsCamera, AVATAR.height + L.aboveHead, Math.cos(cameraRig.yaw) * L.towardsCamera);
      // Stays in the scene at 0 by day, so no shader is rebuilt when it comes on.
      l.intensity = L.intensity * smooth(L.fadeFrom, L.fullAt, lightDirections.sun.value.y);
    }
  });

  return (
    <group ref={ref}>
      <group ref={body}>{avatar && <primitive object={avatar.group} />}</group>
      <pointLight ref={light} color={world.lamp} intensity={0} distance={L.distance} />
    </group>
  );
}
