import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SPAWN_AREA } from '../../config/world';
import { waterPalette, world } from '../../design/tokens';
import { clock } from '../../state/runtime';
import { groundHeightAt } from '../../world/ground';
import { lightingAt } from '../../world/timeOfDay';
import { placeLamps } from './furniture';
import type { SpawnLayout } from './layout';
import {
  LANTERN_OFFSET,
  createCrystalGeometry,
  createFountainGeometry,
  createFountainWaterGeometry,
  createLampPostGeometry,
  createLanternGeometry,
} from './props';

/** Radius of the light pool under a lamp, meters. */
const POOL_RADIUS = 7;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Radial glow for the lantern halos (white; tinted by the material colour). */
function glowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = Math.max(0, 1 - d) ** 1.6;
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Shrinks instances to nothing between `start` and `end` meters from the
 * camera: lamps stand on the LOD 0 ground, which morphs away further out.
 */
function fadeByDistance(material: THREE.Material, start: number, end: number): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 dwBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        transformed *= 1.0 - smoothstep(${start.toFixed(1)}, ${end.toFixed(1)}, distance(dwBase, cameraPosition));
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `dw-fade-${start}-${end}`;
}

/** One ground-hugging grid per lamp, centred under its lantern (relative to the plaza). */
function buildPools(lamps: ReturnType<typeof placeLamps>, plaza: SpawnLayout['plaza']): THREE.BufferGeometry {
  const n = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const m = new THREE.Matrix4();
  const c = new THREE.Vector3();
  lamps.forEach((l) => {
    c.copy(LANTERN_OFFSET).applyMatrix4(m.makeRotationY(l.rotation).setPosition(l.x, 0, l.z));
    const base = positions.length / 3;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = c.x + (i / n - 0.5) * POOL_RADIUS * 2;
        const z = c.z + (j / n - 0.5) * POOL_RADIUS * 2;
        positions.push(x - plaza.x, groundHeightAt(x, z) + 0.1, z - plaza.z);
        uvs.push(i / n, j / n);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/** Fades a plain mesh's alpha out between `start` and `end` meters from the camera. */
function fadeVerticesByDistance(material: THREE.Material, start: number, end: number): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vDwFade;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDwFade = 1.0 - smoothstep(${start.toFixed(1)}, ${end.toFixed(1)}, distance((modelMatrix * vec4(position, 1.0)).xyz, cameraPosition));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vDwFade;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vDwFade;');
  };
  material.customProgramCacheKey = () => `dw-vfade-${start}-${end}`;
}

/**
 * The spawn area's furniture: the fountain with its crystal in the middle of
 * the plaza, and lamps round the plaza and along the paths that light up as
 * the sun goes down. Positions are relative to the plaza centre (the parent
 * group is at plaza − origin).
 */
export function SpawnProps({ layout }: { layout: SpawnLayout }) {
  const parts = useMemo(() => {
    const { plaza } = layout;
    const lamps = placeLamps(layout);
    const fadeStart = SPAWN_AREA.lampDrawDistance * 0.7;
    const fadeEnd = SPAWN_AREA.lampDrawDistance;

    const postMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
    fadeByDistance(postMaterial, fadeStart, fadeEnd);
    const lanternMaterial = new THREE.MeshStandardMaterial({ color: world.ivory, emissive: world.lamp, emissiveIntensity: 0, roughness: 0.3 });
    fadeByDistance(lanternMaterial, fadeStart, fadeEnd);
    const posts = new THREE.InstancedMesh(createLampPostGeometry(), postMaterial, lamps.length);
    const lanterns = new THREE.InstancedMesh(createLanternGeometry(), lanternMaterial, lamps.length);
    const m = new THREE.Matrix4();
    const glowPositions = new Float32Array(lamps.length * 3);
    const light = new THREE.Vector3();
    lamps.forEach((l, i) => {
      m.makeRotationY(l.rotation).setPosition(l.x - plaza.x, l.y, l.z - plaza.z);
      posts.setMatrixAt(i, m);
      lanterns.setMatrixAt(i, m);
      light.copy(LANTERN_OFFSET).applyMatrix4(m);
      glowPositions.set([light.x, light.y, light.z], i * 3);
    });
    posts.castShadow = true;
    posts.receiveShadow = true;
    for (const mesh of [posts, lanterns]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

    // Pools of lamplight on the ground: additive patches under each lantern,
    // small grids that follow the ground so they never cut into a slope.
    const poolMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: world.lamp,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    fadeVerticesByDistance(poolMaterial, fadeStart, fadeEnd);
    const pools = new THREE.Mesh(buildPools(lamps, plaza), poolMaterial);
    pools.renderOrder = 3;

    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    const glow = new THREE.Points(
      glowGeometry,
      new THREE.PointsMaterial({
        map: glowTexture(),
        color: world.lamp,
        size: 6,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    const fountain = new THREE.Mesh(
      createFountainGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    );
    fountain.castShadow = fountain.receiveShadow = true;
    const water = new THREE.Mesh(
      createFountainWaterGeometry(),
      new THREE.MeshStandardMaterial({ color: waterPalette.shallow, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }),
    );
    const crystal = new THREE.Mesh(
      createCrystalGeometry(),
      new THREE.MeshStandardMaterial({ color: world.crystal, emissive: world.crystalDeep, emissiveIntensity: 0.4, roughness: 0.15, metalness: 0.1, flatShading: true }),
    );
    crystal.castShadow = true;
    const crystalLight = new THREE.PointLight(world.crystal, 0, 30, 2);
    crystalLight.position.set(0, 3.6, 0);
    for (const obj of [fountain, water, crystal, crystalLight]) obj.position.y += plaza.y;

    return { posts, lanterns, pools, glow, fountain, water, crystal, crystalLight };
  }, [layout]);

  useEffect(
    () => () => {
      parts.pools.material.map?.dispose();
      for (const obj of [parts.posts, parts.lanterns, parts.pools, parts.fountain, parts.water, parts.crystal]) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
      parts.glow.geometry.dispose();
      parts.glow.material.map?.dispose();
      parts.glow.material.dispose();
      parts.crystalLight.dispose();
    },
    [parts],
  );

  useFrame(() => {
    const l = lightingAt(clock.hours);
    // Lamps come on in the golden hour and are fully lit once the sun is down.
    const on = smooth(0.12, -0.04, l.sunElevation);
    (parts.lanterns.material as THREE.MeshStandardMaterial).emissiveIntensity = on * 4;
    parts.glow.material.opacity = on * 0.7;
    parts.pools.material.opacity = on * 0.35;
    parts.pools.visible = on > 0.01;
    parts.glow.visible = on > 0.01;
    (parts.crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + on * 1.6;
    parts.crystalLight.intensity = on * 25;
  });

  return (
    <>
      <primitive object={parts.posts} />
      <primitive object={parts.lanterns} />
      <primitive object={parts.pools} />
      <primitive object={parts.glow} />
      <primitive object={parts.fountain} />
      <primitive object={parts.water} />
      <primitive object={parts.crystal} />
      <primitive object={parts.crystalLight} />
    </>
  );
}
