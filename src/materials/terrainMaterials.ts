import * as THREE from 'three';
import { CHUNK_SIZE, LOD_LEVELS, MORPH_RANGE, TERRAIN_TEXTURE } from '../config/world';
import type { TerrainTextureSet } from '../world/terrainTextures';

/**
 * Terrain and prop materials, with geomorphing added to three.js' own shaders.
 *
 * Every vertex carries its height on the next coarser LOD (`morphHeight`).
 * Near the outer edge of its LOD ring it glides to that height, so when the
 * chunk is swapped for the coarser mesh nothing moves. Distance is Chebyshev
 * (square rings, like the LOD rings) from the player, in render space.
 */

/** Player position in render space (x, z). Shared by every terrain material; set once per frame. */
export const morphPlayer = { value: new THREE.Vector2() };

/** 1 = geomorphing on, 0 = off (debug: shows what the LOD swaps would look like without it). */
export const morphEnabled = { value: 1 };

/** A 1×1 placeholder array texture, bound until the real detail textures are generated. */
function placeholderArray(rgba: [number, number, number, number], layers: number): THREE.DataArrayTexture {
  const data = new Uint8Array(4 * layers);
  for (let l = 0; l < layers; l++) data.set(rgba, l * 4);
  const t = new THREE.DataArrayTexture(data, 1, 1, layers);
  t.needsUpdate = true;
  return t;
}

/**
 * Detail textures shared by every terrain material (step 2c). `on` is 0 until
 * the worker has generated the textures (and when switched off in F3).
 * `uvOffset` = origin mod TERRAIN_TEXTURE.uvWrap, so UVs follow world space
 * exactly while the numbers on the GPU stay small (floating origin).
 */
export const terrainDetail = {
  albedo: { value: placeholderArray([128, 128, 128, 128], 5) },
  normal: { value: placeholderArray([128, 128, 255, 242], 5) },
  on: { value: 0 },
  uvOffset: { value: new THREE.Vector2() },
  tile: { value: [...TERRAIN_TEXTURE.tileMeters] as number[] },
  macro: { value: TERRAIN_TEXTURE.macroScale as number },
  fade: { value: new THREE.Vector2(TERRAIN_TEXTURE.fadeStart, TERRAIN_TEXTURE.fadeEnd) },
};

/** Uploads generated detail textures and returns a disposer. */
export function applyTerrainTextures(set: TerrainTextureSet, anisotropy: number): () => void {
  const make = (data: Uint8Array) => {
    // Worker data always arrives on a plain ArrayBuffer.
    const t = new THREE.DataArrayTexture(data as Uint8Array<ArrayBuffer>, set.size, set.size, set.layers);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.colorSpace = THREE.NoColorSpace; // factors and normals, not colours
    t.needsUpdate = true;
    return t;
  };
  const albedo = make(set.albedo);
  const normal = make(set.normal);
  const previous = [terrainDetail.albedo.value, terrainDetail.normal.value];
  terrainDetail.albedo.value = albedo;
  terrainDetail.normal.value = normal;
  previous.forEach((t) => t.dispose());
  return () => {
    albedo.dispose();
    normal.dispose();
  };
}

/** [start, end] of the morph for a LOD, in meters. The coarsest LOD never morphs. */
export function morphRange(lod: number): THREE.Vector2 {
  const last = lod >= LOD_LEVELS.length - 1;
  if (last) return new THREE.Vector2(1e9, 1e9 + 1);
  const end = LOD_LEVELS[lod]!.maxDistance * CHUNK_SIZE;
  return new THREE.Vector2(end - MORPH_RANGE, end);
}

export const MORPH_HEAD = /* glsl */ `
uniform vec2 uPlayer;
uniform vec2 uMorph;
uniform float uMorphOn;
float dwMorphFactor(vec3 worldPos) {
  float d = max(abs(worldPos.x - uPlayer.x), abs(worldPos.z - uPlayer.y));
  return uMorphOn * clamp((d - uMorph.x) / (uMorph.y - uMorph.x), 0.0, 1.0);
}
`;

const DETAIL_VERTEX_HEAD = /* glsl */ `
attribute float morphHeight;
attribute vec3 morphNormal;
attribute vec3 morphColor;
attribute vec4 surfaceWeights;
attribute vec4 morphWeights;
varying vec4 vDwWeights;
varying vec3 vDwWorldPos;
varying vec3 vDwWorldNormal;
`;

/**
 * Fragment part of the detail textures. The biome colour (vertex colour) stays
 * the base; each material's texture adds a detail factor (mean 1.0), relief
 * (normal map) and roughness, blended by the material weights. Rock is sampled
 * triplanar so cliffs don't smear. Everything fades out with distance.
 */
const DETAIL_FRAGMENT_HEAD = /* glsl */ `
uniform highp sampler2DArray uDetailAlbedo;
uniform highp sampler2DArray uDetailNormal;
uniform float uDetailOn;
uniform vec2 uUvOffset;
uniform float uTile[5];
uniform float uMacro;
uniform vec2 uFade;
varying vec4 vDwWeights;
varying vec3 vDwWorldPos;
varying vec3 vDwWorldNormal;

// One material's detail: colour factor (mean 1), world-space normal offset, roughness.
void dwSample(int i, vec2 p, vec3 wp, vec3 n, out vec3 f, out vec3 d, out float r) {
  float layer = float(i);
  if (i == 2) {
    // Rock: triplanar, weighted by the normal, so steep faces keep their scale.
    vec3 bw = pow(abs(n), vec3(4.0));
    bw /= bw.x + bw.y + bw.z;
    vec3 P = vec3(p.x, wp.y, p.y) / uTile[2];
    vec4 ax = texture(uDetailAlbedo, vec3(P.zy, layer));
    vec4 ay = texture(uDetailAlbedo, vec3(P.xz, layer));
    vec4 az = texture(uDetailAlbedo, vec3(P.xy, layer));
    vec4 nx = texture(uDetailNormal, vec3(P.zy, layer)) * 2.0 - 1.0;
    vec4 ny = texture(uDetailNormal, vec3(P.xz, layer)) * 2.0 - 1.0;
    vec4 nz = texture(uDetailNormal, vec3(P.xy, layer)) * 2.0 - 1.0;
    f = (ax.rgb * bw.x + ay.rgb * bw.y + az.rgb * bw.z) * 2.0;
    d = vec3(0.0, nx.y, nx.x) * bw.x + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z;
    r = (nx.a * bw.x + ny.a * bw.y + nz.a * bw.z) * 0.5 + 0.5;
  } else {
    vec2 uv = p / uTile[i];
    vec4 a = texture(uDetailAlbedo, vec3(uv, layer));
    // The same texture at a larger scale breaks up visible repetition.
    vec3 macro = texture(uDetailAlbedo, vec3(uv / uMacro + 0.37, layer)).rgb * 2.0;
    vec4 t = texture(uDetailNormal, vec3(uv, layer)) * 2.0 - 1.0;
    f = a.rgb * 2.0 * mix(vec3(1.0), macro, 0.5);
    d = vec3(t.x, 0.0, t.y);
    r = t.a * 0.5 + 0.5;
  }
}
`;

/**
 * Only the two strongest materials are sampled per pixel (at most 9 texture
 * reads instead of ~27). To stay seamless where the ranking changes, the third
 * strongest weight is subtracted from both before blending.
 */
const DETAIL_FRAGMENT_MAIN = /* glsl */ `
vec3 dwN = normalize(vDwWorldNormal);
vec3 dwFactor = vec3(1.0);
vec3 dwPert = vec3(0.0);
float dwRough = 0.95;
float dwFade = uDetailOn * (1.0 - smoothstep(uFade.x, uFade.y, length(vDwWorldPos - cameraPosition)));
if (dwFade > 0.0) {
  float w[5] = float[5](vDwWeights.x, vDwWeights.y, vDwWeights.z, vDwWeights.w,
    max(0.0, 1.0 - vDwWeights.x - vDwWeights.y - vDwWeights.z - vDwWeights.w));
  int i1 = 0;
  for (int i = 1; i < 5; i++) if (w[i] > w[i1]) i1 = i;
  int i2 = i1 == 0 ? 1 : 0;
  for (int i = 0; i < 5; i++) if (i != i1 && w[i] > w[i2]) i2 = i;
  float w3 = 0.0;
  for (int i = 0; i < 5; i++) if (i != i1 && i != i2) w3 = max(w3, w[i]);
  float a = w[i1] - w3;
  float b = max(0.0, w[i2] - w3);
  vec2 p = vDwWorldPos.xz + uUvOffset;
  vec3 f1; vec3 d1; float r1;
  dwSample(i1, p, vDwWorldPos, dwN, f1, d1, r1);
  vec3 f = f1; vec3 d = d1; float r = r1;
  if (b > 0.01) {
    vec3 f2; vec3 d2; float r2;
    dwSample(i2, p, vDwWorldPos, dwN, f2, d2, r2);
    float t = b / (a + b);
    f = mix(f1, f2, t); d = mix(d1, d2, t); r = mix(r1, r2, t);
  }
  dwFactor = mix(vec3(1.0), f, dwFade);
  dwPert = d * dwFade;
  dwRough = mix(0.95, r, dwFade);
}
vec3 dwNormalWorld = normalize(dwN + dwPert);
diffuseColor.rgb *= dwFactor;
`;

/**
 * Whether a LOD's chunks can ever be close enough to show detail textures:
 * its ring starts where the previous one ends, so if that is beyond the fade,
 * the material gets a plain shader and pays nothing for textures it never shows.
 */
export function lodHasDetail(lod: number): boolean {
  const innerDistance = lod === 0 ? 0 : LOD_LEVELS[lod - 1]!.maxDistance * CHUNK_SIZE;
  return innerDistance < TERRAIN_TEXTURE.fadeEnd;
}

/** `withDetail: false` forces the plain shader (used when detail textures are switched off). */
export function createTerrainMaterial(lod: number, withDetail = true): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const range = morphRange(lod);
  const detail = withDetail && lodHasDetail(lod);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = morphPlayer;
    shader.uniforms.uMorph = { value: range };
    shader.uniforms.uMorphOn = morphEnabled;
    let vertex = (DETAIL_VERTEX_HEAD + MORPH_HEAD + shader.vertexShader)
      // Colour comes first in three's vertex shader, so compute the factor there.
      .replace(
        '#include <color_vertex>',
        /* glsl */ `float dwM = dwMorphFactor((modelMatrix * vec4(position, 1.0)).xyz);
        #include <color_vertex>
        vColor.xyz = mix(color.xyz, morphColor, dwM);`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, morphNormal, dwM));')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mix(transformed.y, morphHeight, dwM);');
    if (detail) {
      shader.uniforms.uDetailAlbedo = terrainDetail.albedo;
      shader.uniforms.uDetailNormal = terrainDetail.normal;
      shader.uniforms.uDetailOn = terrainDetail.on;
      shader.uniforms.uUvOffset = terrainDetail.uvOffset;
      shader.uniforms.uTile = terrainDetail.tile;
      shader.uniforms.uMacro = terrainDetail.macro;
      shader.uniforms.uFade = terrainDetail.fade;
      vertex = vertex
        .replace('vColor.xyz = mix(color.xyz, morphColor, dwM);', 'vColor.xyz = mix(color.xyz, morphColor, dwM);\nvDwWeights = mix(surfaceWeights, morphWeights, dwM);')
        .replace('objectNormal = normalize(mix(objectNormal, morphNormal, dwM));', 'objectNormal = normalize(mix(objectNormal, morphNormal, dwM));\nvDwWorldNormal = objectNormal;')
        .replace('transformed.y = mix(transformed.y, morphHeight, dwM);', 'transformed.y = mix(transformed.y, morphHeight, dwM);\nvDwWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = (DETAIL_FRAGMENT_HEAD + shader.fragmentShader)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL_FRAGMENT_MAIN)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = dwRough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(dwNormalWorld, 0.0)).xyz);');
    }
    shader.vertexShader = vertex;
  };
  material.customProgramCacheKey = () => (detail ? 'dw-terrain-detail' : 'dw-terrain-plain');
  return material;
}
