import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { cameraRig, origin, player } from '../state/runtime';
import { heightAt } from '../world/terrain';

/** Third-person camera: orbits the player, eases toward its target, stays above ground. */
export function FollowCamera() {
  const camera = useThree((s) => s.camera);
  const target = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());
  const lastOrigin = useRef({ x: origin.x, z: origin.z });

  useFrame((_, dt) => {
    const d = cameraRig.distance;
    const cp = Math.cos(cameraRig.pitch);
    const wantX = player.x + Math.sin(cameraRig.yaw) * d * cp;
    const wantZ = player.z + Math.cos(cameraRig.yaw) * d * cp;
    const ground = Math.max(0, heightAt(wantX, wantZ)) + 2;
    const wantY = Math.max(ground, player.y + 2 + Math.sin(cameraRig.pitch) * d);

    // After a rebase, move the camera by the same shift so it stays put in the world.
    const last = lastOrigin.current;
    if (last.x !== origin.x || last.z !== origin.z) {
      camera.position.x -= origin.x - last.x;
      camera.position.z -= origin.z - last.z;
      last.x = origin.x;
      last.z = origin.z;
    }
    want.current.set(wantX - origin.x, wantY, wantZ - origin.z);
    if (camera.position.distanceTo(want.current) > 500) {
      camera.position.copy(want.current); // teleport or fast travel: don't swoop across the map
    } else {
      camera.position.lerp(want.current, 1 - Math.exp(-dt * 10));
    }
    target.current.set(player.x - origin.x, player.y + 1.5, player.z - origin.z);
    camera.lookAt(target.current);
  });

  return null;
}
