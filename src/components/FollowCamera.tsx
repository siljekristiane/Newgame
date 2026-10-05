import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { AVATAR, CAMERA, SEA_LEVEL } from '../config/world';
import { cameraRig, origin, player } from '../state/runtime';
import { groundHeightAt } from '../world/ground';

/** Points along the player → camera line (fractions) checked against the ground. */
const SIGHT_SAMPLES = [0.25, 0.5, 0.75, 1];

/**
 * Third-person camera: orbits the player, eases toward its target, keeps its view of the player clear of the ground.
 * It looks at the avatar's chest, and glides up to the face when zoomed right in (AVATAR.camera).
 */
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
    // Keep the line of sight from the focus point to the camera above the
    // ground: at each sample the camera must be high enough that the line
    // clears the ground there. The clearance shrinks when zoomed in, so the
    // camera can come down to the avatar's face.
    const cam = AVATAR.camera;
    const face = smoothstep(cam.faceBlendFrom, cam.faceBlendTo, d);
    const headY = player.y + AVATAR.height * (AVATAR.focusRatio + (AVATAR.faceRatio - AVATAR.focusRatio) * face);
    const clearance = Math.min(CAMERA.clearance, Math.max(cam.minClearance, d * cam.clearancePerMeter));
    let wantY = headY + Math.sin(cameraRig.pitch) * d;
    for (const t of SIGHT_SAMPLES) {
      const g = Math.max(SEA_LEVEL, groundHeightAt(player.x + (wantX - player.x) * t, player.z + (wantZ - player.z) * t)) + clearance;
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
    target.current.set(player.x - origin.x, headY, player.z - origin.z);
    camera.lookAt(target.current);
  });

  return null;
}

/** 0 at `from`, 1 at `to` (either order), smooth in between. */
function smoothstep(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
