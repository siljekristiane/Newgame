import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../config/world';
import { morphEnabled } from '../materials/terrainMaterials';
import { player } from '../state/runtime';
import { PLANT_FIELDS as F, PLANT_KINDS, PLANT_STRIDE } from '../world/vegetation';

interface KindInstances {
  geometry: THREE.BufferGeometry;
  matrices: Float32Array;
  colors: Float32Array;
  n: number;
  /** Instances that stay through the LOD swap; the ones after them shrink away. */
  keep: number;
}

/**
 * A chunk's trees, bushes and boulders: one instanced draw call per kind.
 * `bases` are the shared plant meshes for this LOD; each chunk gets a shallow
 * copy with its own per-instance morph attributes.
 *
 * Plants that shrink away before the next LOD are sorted last, so once the
 * whole chunk is past `morphEnd` (all of them at scale 0) they are simply not
 * drawn: no vertex work for invisible plants.
 */
export function ChunkPlants({
  plants,
  bases,
  material,
  cx,
  cz,
  morphEnd,
}: {
  plants: Float32Array;
  bases: THREE.BufferGeometry[];
  material: THREE.Material;
  cx: number;
  cz: number;
  morphEnd: number;
}) {
  const kinds = useMemo<KindInstances[]>(() => {
    const count = plants.length / PLANT_STRIDE;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const byKind = PLANT_KINDS.map(() => [] as number[]);
    for (let i = 0; i < count; i++) byKind[plants[i * PLANT_STRIDE + F.kind]!]!.push(i);
    return byKind.map((indices, k) => {
      // Stable order: plants that stay first, plants that fade after.
      indices.sort((a, b) => plants[a * PLANT_STRIDE + F.fade]! - plants[b * PLANT_STRIDE + F.fade]! || a - b);
      const n = indices.length;
      const matrices = new Float32Array(n * 16);
      const colors = new Float32Array(n * 3);
      const delta = new Float32Array(n);
      const fade = new Float32Array(n);
      const snow = new Float32Array(n);
      const horA = new Float32Array(n * 4);
      const horB = new Float32Array(n * 4);
      let keep = 0;
      indices.forEach((i, slot) => {
        const o = i * PLANT_STRIDE;
        const s = plants[o + F.scale]!;
        const y = plants[o + F.y]!;
        const tint = plants[o + F.tint]!;
        const w = s * plants[o + F.width]!;
        // Turned, then leaned a little toward leanDir, then its own height and width.
        const dir = plants[o + F.leanDir]!;
        tilt.setFromAxisAngle(axis.set(Math.cos(dir), 0, Math.sin(dir)), plants[o + F.lean]!);
        q.setFromAxisAngle(up, plants[o + F.rotation]!).premultiply(tilt);
        m.compose(pos.set(plants[o + F.x]!, y, plants[o + F.z]!), q, scale.set(w, s * plants[o + F.height]!, w));
        matrices.set(m.elements, slot * 16);
        // Natural variation: a little lighter/darker, a little more yellow or blue-green.
        colors.set([0.82 + tint * 0.32, 0.86 + tint * 0.24, 0.9 + (1 - tint) * 0.16], slot * 3);
        delta[slot] = plants[o + F.morphY]! - y;
        fade[slot] = plants[o + F.fade]!;
        snow[slot] = plants[o + F.snow]!;
        horA.set(plants.subarray(o + F.horizon, o + F.horizon + 4), slot * 4);
        horB.set(plants.subarray(o + F.horizon + 4, o + F.horizon + 8), slot * 4);
        if (fade[slot] === 0) keep++;
      });
      const geometry = new THREE.BufferGeometry();
      const base = bases[k]!;
      for (const name of Object.keys(base.attributes)) geometry.setAttribute(name, base.getAttribute(name));
      geometry.boundingSphere = base.boundingSphere;
      geometry.setAttribute('aMorphDelta', new THREE.InstancedBufferAttribute(delta, 1));
      geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1));
      geometry.setAttribute('aSnow', new THREE.InstancedBufferAttribute(snow, 1));
      geometry.setAttribute('aHorA', new THREE.InstancedBufferAttribute(horA, 4));
      geometry.setAttribute('aHorB', new THREE.InstancedBufferAttribute(horB, 4));
      return { geometry, matrices, colors, n, keep };
    });
  }, [plants, bases]);

  // Only the per-instance attributes belong to this chunk. Detach the shared
  // base attributes first, so dispose() frees just this chunk's buffers.
  useEffect(
    () => () =>
      kinds.forEach((k, i) => {
        for (const name of Object.keys(bases[i]!.attributes)) k.geometry.deleteAttribute(name);
        k.geometry.dispose();
      }),
    [kinds, bases],
  );

  const meshes = useRef<Array<THREE.InstancedMesh | null>>([]);
  const setMesh = useMemo(
    () =>
      kinds.map((_, i) => (mesh: THREE.InstancedMesh | null) => {
        meshes.current[i] = mesh;
      }),
    [kinds],
  );
  useFrame(() => {
    // Chebyshev distance from the player to the nearest point of the chunk,
    // the same measure the morph uses.
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const dx = Math.max(x0 - player.x, 0, player.x - x0 - CHUNK_SIZE);
    const dz = Math.max(z0 - player.z, 0, player.z - z0 - CHUNK_SIZE);
    // With morphing off (debug) the fading plants never shrink, so keep drawing them.
    const beyond = morphEnabled.value === 1 && Math.max(dx, dz) >= morphEnd;
    kinds.forEach((k, i) => {
      const mesh = meshes.current[i];
      if (mesh) mesh.count = beyond ? k.keep : k.n;
    });
  });

  return (
    <>
      {kinds.map((k, i) => (
        <Instances
          key={i}
          data={k}
          material={material}
          meshRef={setMesh[i]!}
        />
      ))}
    </>
  );
}

function Instances({
  data,
  material,
  meshRef,
}: {
  data: KindInstances;
  material: THREE.Material;
  meshRef: (mesh: THREE.InstancedMesh | null) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix.array.set(data.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(data.colors, 3);
    mesh.count = data.n;
    mesh.computeBoundingSphere();
    meshRef(mesh);
    return () => meshRef(null);
  }, [data, meshRef]);
  if (data.n === 0) return null;
  return <instancedMesh ref={ref} args={[data.geometry, material, data.n]} castShadow receiveShadow />;
}
