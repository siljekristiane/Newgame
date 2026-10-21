import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { COLLISION, SEA_LEVEL, TUMBLEWEEDS, WORLD_SEED } from '../config/world';
import { addTerrainShadow } from '../materials/terrainShadow';
import { moveWithCollision, type MoveResult } from '../player/collision';
import { motion, origin, player, weather } from '../state/runtime';
import { groundHeightAt } from '../world/ground';
import { mulberry32 } from '../world/noise';
import { createTumbleweedGeometry } from './geometry';
import { createTumbleweed, habitat, respawn, stepTumbleweed, type TumbleEnv } from './sim';
import { tumbleweedState } from './state';

/** Weeds closer than this get the detailed mesh. */
const NEAR = 30;
/** How often (s) the pool looks for dry land to put idle weeds on. */
const SCAN_EVERY = 0.5;

/**
 * The tumbleweeds near the player (src/tumbleweeds): a pool simulated with
 * sim.ts every frame and drawn as two instanced meshes, detailed up close and
 * lighter further off. Weeds that drift out of the live circle come back on
 * its upwind rim; idle ones wait until there is dry land near the player.
 */
export function Tumbleweeds() {
  const built = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    material.name = 'tumbleweed';
    // Mountain and cloud shadow from the horizon where the player stands (they are all near).
    material.onBeforeCompile = (shader) => addTerrainShadow(shader, 'local');
    const mesh = (detail: 'high' | 'low') => {
      const m = new THREE.InstancedMesh(createTumbleweedGeometry(detail), material, TUMBLEWEEDS.count);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // instances roam far from the mesh's own origin
      m.count = 0;
      m.name = `tumbleweeds-${detail}`;
      return m;
    };
    const near = mesh('high');
    const far = mesh('low');
    const group = new THREE.Group();
    group.add(near, far);
    const weeds = Array.from({ length: TUMBLEWEEDS.count }, createTumbleweed);
    tumbleweedState.weeds = weeds;
    const moved: MoveResult = { x: 0, z: 0, nx: 0, nz: 0 };
    const env: TumbleEnv = {
      ground: (x, z) => Math.max(SEA_LEVEL, groundHeightAt(x, z)),
      habitat: (x, z) => habitat(x, z, groundHeightAt(x, z)),
      windX: 0,
      windZ: 0,
      player: { x: 0, z: 0, vx: 0, vz: 0, radius: COLLISION.playerRadius },
      move: (x, z, dx, dz, r) => moveWithCollision(x, z, dx, dz, r, moved),
      random: mulberry32(WORLD_SEED + 9_300),
    };
    return { material, near, far, group, weeds, env, scan: { timer: 0, dry: false, filled: false } };
  }, []);

  useEffect(
    () => () => {
      built.near.geometry.dispose();
      built.far.geometry.dispose();
      built.material.dispose();
      tumbleweedState.weeds = [];
      tumbleweedState.active = 0;
    },
    [built],
  );

  const m = useMemo(() => ({ matrix: new THREE.Matrix4(), pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3() }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { env, weeds, scan, near, far } = built;
    env.windX = weather.windX;
    env.windZ = weather.windZ;
    env.player.x = player.x;
    env.player.z = player.z;
    env.player.vx = motion.vx;
    env.player.vz = motion.vz;

    // Is there dry land about? (A few samples, twice a second.)
    scan.timer -= dt;
    if (scan.timer <= 0) {
      scan.timer = SCAN_EVERY;
      let dry = env.habitat(player.x, player.z) > 0.1;
      for (let k = 0; k < 8 && !dry; k++) {
        const a = (k / 8) * Math.PI * 2;
        dry = env.habitat(player.x + Math.cos(a) * TUMBLEWEEDS.radius * 0.7, player.z + Math.sin(a) * TUMBLEWEEDS.radius * 0.7) > 0.1;
      }
      scan.dry = dry;
      if (dry) {
        // On first arrival fill the whole circle; later, one idle weed per scan comes in upwind.
        let budget = scan.filled ? 2 : weeds.length;
        for (const w of weeds) {
          if (w.active || budget <= 0) continue;
          respawn(w, env, !scan.filled);
          budget--;
        }
        scan.filled = true;
      } else scan.filled = false;
    }

    const impacts = tumbleweedState.impacts;
    let active = 0;
    let rustle = 0;
    near.count = 0;
    far.count = 0;
    for (const w of weeds) {
      if (!w.active) continue;
      const kicks = impacts.length;
      stepTumbleweed(w, env, dt, impacts);
      for (let i = kicks; i < impacts.length; i++) if (impacts[i]!.kind === 'kick') tumbleweedState.kicks++;
      const d = Math.hypot(w.x - player.x, w.z - player.z);
      // Out of the circle: come back upwind (or rest, if the land has gone green).
      if (d > TUMBLEWEEDS.radius + 30) {
        if (scan.dry) respawn(w, env, false);
        else w.active = false;
        if (!w.active) continue;
      }
      active++;
      const speed = Math.hypot(w.vx, w.vz);
      if (w.y - w.r < env.ground(w.x, w.z) + 0.05) rustle += (speed / 6) / (1 + (d / 8) ** 2);
      const target = d < NEAR ? near : far;
      m.pos.set(w.x - origin.x, w.y, w.z - origin.z);
      m.quat.set(w.q[0], w.q[1], w.q[2], w.q[3]);
      m.scale.setScalar(w.r);
      target.setMatrixAt(target.count++, m.matrix.compose(m.pos, m.quat, m.scale));
    }
    near.instanceMatrix.needsUpdate = true;
    far.instanceMatrix.needsUpdate = true;
    // Keep the queue short if the sound is not reading it (sound still locked).
    if (impacts.length > 64) impacts.splice(0, impacts.length - 64);
    tumbleweedState.active = active;
    tumbleweedState.rustle = Math.min(1, rustle);
  });

  return <primitive object={built.group} />;
}
