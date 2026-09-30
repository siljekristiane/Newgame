import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { CAMERA, SEA_LEVEL } from '../config/world';
import { cameraRig, origin, player } from '../state/runtime';
import { groundHeightAt } from '../world/ground';

/** Points along the player → camera line (fractions) checked against the ground. */
const SIGHT_SAMPLES = [0.25, 0.5, 0.75, 1];

/** Third-person camera: orbits the player, eases toward its target, keeps its view of the player clear of the ground. */
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
    // Keep the line of sight from the player's head to the camera above the
    // ground: at each sample the camera must be high enough that the line
    // clears the ground there by CAMERA.clearance.
    const headY = player.y + 1.5;
    let wantY = player.y + 2 + Math.sin(cameraRig.pitch) * d;
    for (const t of SIGHT_SAMPLES) {
      const g = Math.max(SEA_LEVEL, groundHeightAt(player.x + (wantX - player.x) * t, player.z + (wantZ - player.z) * t)) + CAMERA.clearance;
      wantY = Math.max(wantY, headY + (g - headY) / t);
    }

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
