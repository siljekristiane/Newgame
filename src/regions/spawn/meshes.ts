import * as THREE from 'three';
import { SPAWN_AREA } from '../../config/world';
import { pathPalette } from '../../design/tokens';
import { groundHeightAt } from '../../world/ground';
import type { PathPoint, SpawnLayout } from './layout';
import type { DetailTexture } from './textures';

/**
 * Meshes for the spawn area's ground: path ribbons and the paved plaza. They
 * lie on the LOD 0 terrain (groundHeightAt at every vertex, a hair above it)
 * with soft alpha edges. Vertices are relative to the plaza centre, so the
 * numbers stay small; the caller places the group at plaza − origin.
 */

/** Height above the ground and the soft edge width, meters. */
const LIFT = 0.04;
const EDGE = 0.7;
/** Fade out with distance: beyond this the terrain morphs away from LOD 0. */
export const PATH_FADE = { start: 350, end: 550 } as const;

export function buildPathGeometry(path: PathPoint[], ox: number, oz: number): THREE.BufferGeometry {
  const half = SPAWN_AREA.pathWidth / 2;
  // Across the path: soft outer edge, solid band, soft outer edge.
  const across = [-half - EDGE, -half + EDGE * 0.3, half - EDGE * 0.3, half + EDGE];
  const alpha = [0, 1, 1, 0];
  const positions: number[] = [];
  const uvs: number[] = [];
  const alphas: number[] = [];
  let along = 0;
  path.forEach((p, i) => {
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(path.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    // Left-hand normal of the direction of travel.
    const nx = tz / tl;
    const nz = -tx / tl;
    if (i > 0) along += Math.hypot(p.x - prev.x, p.z - prev.z);
    across.forEach((a, k) => {
      const x = p.x + nx * a;
      const z = p.z + nz * a;
      positions.push(x - ox, groundHeightAt(x, z) + LIFT, z - oz);
      uvs.push(a, along);
      alphas.push(alpha[k]!);
    });
  });
  const indices: number[] = [];
  const w = across.length;
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < w - 1; k++) {
      const a = i * w + k;
      const b = a + w;
      indices.push(a, b, a + 1, a + 1, b, b + 1); // counter-clockwise seen from above
    }
  }
  return finish(positions, uvs, alphas, indices);
}

export function buildPlazaGeometry(plaza: SpawnLayout['plaza'], ox: number, oz: number): THREE.BufferGeometry {
  const segments = 64;
  const rings = [0, 0.35, 0.65, 0.9, 1, 1 + EDGE / plaza.radius];
  const positions: number[] = [];
  const uvs: number[] = [];
  const alphas: number[] = [];
  rings.forEach((r) => {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const x = plaza.x + Math.cos(a) * r * plaza.radius;
      const z = plaza.z + Math.sin(a) * r * plaza.radius;
      positions.push(x - ox, groundHeightAt(x, z) + LIFT, z - oz);
      uvs.push(x - plaza.x, z - plaza.z);
      alphas.push(r > 1 ? 0 : 1);
    }
  });
  const indices: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + ((s + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      indices.push(a, b, c, b, d, c); // counter-clockwise seen from above
    }
  }
  return finish(positions, uvs, alphas, indices);
}

function finish(positions: number[], uvs: number[], alphas: number[], indices: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('edgeAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Colour factors and normals are data, not colours: no colour-space conversion. */
function dataTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data as Uint8Array<ArrayBuffer>, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Ground material for paths or paving: base colour × detail texture (factor
 * around 1), normal map, soft edges from `edgeAlpha`, and a fade with
 * distance. `tile` is the texture repeat in meters.
 */
export function createGroundMaterial(kind: 'gravel' | 'paving', tex: DetailTexture, tile: number, anisotropy: number): THREE.MeshStandardMaterial {
  const albedo = dataTexture(tex.albedo, tex.size);
  const normal = dataTexture(tex.normal, tex.size);
  albedo.anisotropy = normal.anisotropy = anisotropy;
  const material = new THREE.MeshStandardMaterial({
    color: kind === 'gravel' ? pathPalette.gravel : pathPalette.paving,
    normalMap: normal,
    roughness: 0.9,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: albedo };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float edgeAlpha;\nvarying float vEdgeAlpha;\nvarying vec2 vTileUv;\nvarying float vCamDist;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vEdgeAlpha = edgeAlpha;
        vTileUv = uv / ${tile.toFixed(2)};`,
      )
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCamDist = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D uDetail;\nvarying float vEdgeAlpha;\nvarying vec2 vTileUv;\nvarying float vCamDist;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `vec3 dwDetail = texture2D(uDetail, vTileUv).rgb * 2.0;
        diffuseColor.rgb *= dwDetail;
        diffuseColor.a *= vEdgeAlpha * (1.0 - smoothstep(${PATH_FADE.start.toFixed(1)}, ${PATH_FADE.end.toFixed(1)}, vCamDist));`,
      )
;
  };
  material.customProgramCacheKey = () => `dw-ground-${kind}`;
  // The normal map reads the mesh uv; scale it the same way through the texture repeat.
  normal.repeat.set(1 / tile, 1 / tile);
  material.userData.textures = [albedo, normal];
  return material;
}
