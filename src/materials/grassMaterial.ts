import * as THREE from 'three';
import { GRASS } from '../config/world';
import { plantWind } from './plantMaterial';
import { addTerrainShadow } from './terrainShadow';

/** Uniforms the Grass component updates each frame (render-space values only). */
export const grassUniforms = {
  uHeights: { value: null as THREE.Texture | null },
  uGround: { value: null as THREE.Texture | null },
  /** Paths and plazas: 1 = no grass. Covers the same square as the patch. */
  uMask: { value: null as THREE.Texture | null },
  uPatchSize: { value: 1 },
  /** Render-space xz of the patch's grid point (0, 0), grid step and grid points per side. */
  uPatchOrigin: { value: new THREE.Vector2() },
  uGridStep: { value: 1 },
  uPatchSide: { value: 1 },
  /** World cell index of instance 0 (exact integers) and that cell's render-space corner. */
  uCellBase: { value: new THREE.Vector2() },
  uCellBaseRender: { value: new THREE.Vector2() },
  uGrid: { value: 1 },
  uPlayerR: { value: new THREE.Vector2() },
};

/**
 * Grass tufts placed entirely on the GPU. Instance i sits in world cell
 * (uCellBase + (i % grid, i / grid)); an integer hash of that cell gives its
 * jitter, rotation, size and whether it grows (vs. the density map), so tufts
 * stay put as the grid follows the player. The ground height rebuilds the LOD 0
 * triangle from the patch heights exactly like gridHeightAt(), so every tuft
 * stands on the rendered ground.
 */
export function createGrassMaterial(): THREE.MeshLambertMaterial {
  // Lambert: thin blades seen edge-on should not pick up a grazing specular sheen.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    // Before the grass's own vertex code, which replaces begin_vertex entirely.
    addTerrainShadow(shader, 'local');
    Object.assign(shader.uniforms, grassUniforms, { uWindTime: plantWind.time, uOriginMod: plantWind.originMod, uWindScale: plantWind.strength });
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        /* glsl */ `uniform sampler2D uHeights;
        uniform sampler2D uGround;
        uniform sampler2D uMask;
        uniform float uPatchSize;
        uniform vec2 uPatchOrigin;
        uniform float uGridStep;
        uniform float uPatchSide;
        uniform vec2 uCellBase;
        uniform vec2 uCellBaseRender;
        uniform float uGrid;
        uniform vec2 uPlayerR;
        uniform float uWindTime;
        uniform vec2 uOriginMod;
        uniform float uWindScale;
        uint dwHash(uint x) {
          x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
          return x;
        }
        float dwRand(inout uint s) { s = dwHash(s); return float(s & 0xffffffu) / 16777216.0; }
        void main() {
          int dwGrid = int(uGrid);
          ivec2 dwLocal = ivec2(gl_InstanceID % dwGrid, gl_InstanceID / dwGrid);
          ivec2 dwCell = ivec2(uCellBase) + dwLocal;
          uint dwSeed = dwHash(uint(dwCell.x) * 73856093u ^ uint(dwCell.y) * 19349663u);
          vec2 dwJitter = vec2(dwRand(dwSeed), dwRand(dwSeed));
          float dwAngle = dwRand(dwSeed) * 6.2831853;
          float dwGrow = dwRand(dwSeed);
          float dwVary = dwRand(dwSeed);
          vec2 dwP = uCellBaseRender + (vec2(dwLocal) + dwJitter) * ${GRASS.cell.toFixed(3)};

          // Ground: the LOD 0 triangle under the tuft (same split as ground.ts).
          vec2 dwG = (dwP - uPatchOrigin) / uGridStep;
          ivec2 dwI = clamp(ivec2(floor(dwG)), ivec2(0), ivec2(int(uPatchSide) - 2));
          vec2 dwF = dwG - vec2(dwI);
          float dwA = texelFetch(uHeights, dwI, 0).r;
          float dwB = texelFetch(uHeights, dwI + ivec2(1, 0), 0).r;
          float dwC = texelFetch(uHeights, dwI + ivec2(0, 1), 0).r;
          float dwD = texelFetch(uHeights, dwI + ivec2(1, 1), 0).r;
          float dwY = dwF.x + dwF.y <= 1.0
            ? dwA + (dwB - dwA) * dwF.x + (dwC - dwA) * dwF.y
            : dwD + (dwC - dwD) * (1.0 - dwF.x) + (dwB - dwD) * (1.0 - dwF.y);
          vec4 dwGround = texture(uGround, (dwG + 0.5) / uPatchSide);

          float dwClear = texture(uMask, (dwP - uPatchOrigin) / uPatchSize).r;
          float dwDist = distance(dwP, uPlayerR);
          float dwSize = step(dwGrow, dwGround.a * (1.0 - dwClear)) * (1.0 - smoothstep(${(GRASS.radius * 0.55).toFixed(1)}, ${GRASS.radius.toFixed(1)}, dwDist)) * (0.5 + dwVary * dwVary * 1.2);`,
      )
      .replace(
        '#include <color_vertex>',
        /* glsl */ `#include <color_vertex>
        vColor.rgb *= dwGround.rgb;`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0); // lit like the ground it grows on')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = position * dwSize;
        float dwC0 = cos(dwAngle);
        float dwS0 = sin(dwAngle);
        transformed.xz = mat2(dwC0, -dwS0, dwS0, dwC0) * transformed.xz;
        vec2 dwW = dwP + uOriginMod;
        float dwPhase = uWindTime * 1.7 + dot(dwW, vec2(0.13, 0.09));
        float dwBend = position.y / ${GRASS.height.toFixed(3)};
        transformed.xz += vec2(sin(dwPhase), cos(dwPhase * 0.8)) * dwBend * dwBend * dwSize * uWindScale * ${GRASS.windStrength.toFixed(3)};
        transformed += vec3(dwP.x, dwY, dwP.y);`,
      );
    // Blades are seen from both sides but lit like the ground: never flip the
    // normal for back faces (that would turn every other blade black).
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      /* glsl */ `float faceDirection = 1.0;
      vec3 normal = normalize(vNormal);
      vec3 nonPerturbedNormal = normal;`,
    );
  };
  material.customProgramCacheKey = () => 'dw-grass';
  return material;
}

/**
 * One tuft: three tapered blades (two quads and a tip each), in meters,
 * darker at the root. Colour is multiplied by the ground's grass colour.
 */
export function createTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const h = GRASS.height;
  const blades = 3;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI + 0.3;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const lean = (b - 1) * 0.12;
    const w = [0.045, 0.03];
    const ys = [0, h * 0.55];
    const quad = (y0: number, y1: number, w0: number, w1: number) => {
      const l0 = lean * (y0 / h);
      const l1 = lean * (y1 / h);
      const v = [
        [-dx * w0 + l0 * dz, y0, -dz * w0 - l0 * dx],
        [dx * w0 + l0 * dz, y0, dz * w0 - l0 * dx],
        [dx * w1 + l1 * dz, y1, dz * w1 - l1 * dx],
        [-dx * w1 + l1 * dz, y1, -dz * w1 - l1 * dx],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) push(v[i]!);
    };
    const push = (p: number[]) => {
      positions.push(p[0]!, p[1]!, p[2]!);
      const k = 0.6 + 0.5 * (p[1]! / h);
      colors.push(k, k, k * 0.95);
    };
    quad(ys[0]!, ys[1]!, w[0]!, w[1]!);
    const lt = lean;
    push([-dx * w[1]! + lean * 0.55 * dz, ys[1]!, -dz * w[1]! - lean * 0.55 * dx]);
    push([dx * w[1]! + lean * 0.55 * dz, ys[1]!, dz * w[1]! - lean * 0.55 * dx]);
    push([lt * dz, h, -lt * dx]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
