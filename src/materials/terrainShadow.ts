import * as THREE from 'three';
import { TERRAIN_SHADOW, WEATHER } from '../config/world';

/** Terrain shadows on/off (F3 and the test hook). */
export const terrainShadow = { on: { value: 1 } };

const D = TERRAIN_SHADOW.directions;

/**
 * Cloud shadows (step 14): the sky's cloud noise, cover and drift, set by
 * Atmosphere each frame. `offset` = (origin + cloud drift) mod the cloud tile,
 * so render-space positions find the same clouds as the sky shader.
 */
export const cloudShadow = {
  noise: { value: null as THREE.Texture | null },
  cover: { value: 0 },
  offset: { value: new THREE.Vector2() },
};

/** Horizon at the player, for things near it that carry no horizon of their own (grass). */
export const localHorizon = { a: { value: new THREE.Vector4() }, b: { value: new THREE.Vector4() } };

/**
 * Where the horizon comes from: 'vertex' attributes (terrain), 'instance'
 * attributes (plants, one horizon per plant) or the 'local' uniforms.
 */
export type HorizonSource = 'vertex' | 'instance' | 'local';

const VERTEX_HEADS: Record<HorizonSource, string> = {
  vertex: 'attribute vec4 horizonA;\nattribute vec4 horizonB;\n',
  instance: 'attribute vec4 aHorA;\nattribute vec4 aHorB;\n',
  local: 'uniform vec4 uLocalHorA;\nuniform vec4 uLocalHorB;\n',
};
const VERTEX_SET: Record<HorizonSource, string> = {
  vertex: 'vDwHorA = horizonA;\nvDwHorB = horizonB;',
  instance: 'vDwHorA = aHorA;\nvDwHorB = aHorB;',
  local: 'vDwHorA = uLocalHorA;\nvDwHorB = uLocalHorB;',
};

const FRAGMENT_HEAD = /* glsl */ `
varying vec4 vDwHorA;
varying vec4 vDwHorB;
varying vec3 vDwShadowPos;
uniform float uTerrainShadowOn;
uniform sampler2D uCloudShadowNoise;
uniform float uCloudShadowCover;
uniform vec2 uCloudShadowOffset;
// Sunlight left after the clouds: follow the light up to the cloud plane and
// read the same noise and threshold as the sky's cloud layer.
float dwCloudLight(vec3 dir) {
  if (uCloudShadowCover < 0.01 || dir.y < 0.03) return 1.0;
  vec2 p = (vDwShadowPos.xz + dir.xz / dir.y * (${WEATHER.cloudHeight.toFixed(1)} - vDwShadowPos.y) + uCloudShadowOffset) / ${WEATHER.cloudTile.toFixed(1)};
  float n = texture2D(uCloudShadowNoise, p).r * 0.55 + texture2D(uCloudShadowNoise, p * 2.7 + 0.37).r * 0.3 + texture2D(uCloudShadowNoise, p * 7.1 + 0.71).r * 0.15;
  float edge = 1.0 - uCloudShadowCover;
  float density = smoothstep(edge * 0.9, edge * 0.9 + 0.22, n);
  return 1.0 - density * ${TERRAIN_SHADOW.cloudStrength.toFixed(2)};
}
// 1 where a light from world direction dir (towards the light) clears the
// terrain horizon, 0 where hills hide it; soft at the edge.
float dwHorizonLight(vec3 dir) {
  float h[${D + 1}];
  h[0] = vDwHorA.x; h[1] = vDwHorA.y; h[2] = vDwHorA.z; h[3] = vDwHorA.w;
  h[4] = vDwHorB.x; h[5] = vDwHorB.y; h[6] = vDwHorB.z; h[7] = vDwHorB.w;
  h[8] = vDwHorA.x;
  // Direction k points along (cos θ, sin θ) in (x, z), θ = 2πk / ${D} (world/horizon.ts).
  float az = atan(dir.z, dir.x);
  if (az < 0.0) az += 6.28318530718;
  float f = az / ${((2 * Math.PI) / D).toFixed(8)};
  int i0 = int(floor(f));
  float t = f - float(i0);
  float horizon = 0.0;
  for (int k = 0; k < ${D}; k++) {
    if (k == i0) horizon = mix(h[k], h[k + 1], t);
  }
  float elevation = asin(clamp(dir.y, -1.0, 1.0));
  float lit = smoothstep(horizon * 1.5707963 - ${TERRAIN_SHADOW.softness.toFixed(3)}, horizon * 1.5707963 + ${TERRAIN_SHADOW.softness.toFixed(3)}, elevation);
  return mix(1.0, lit, uTerrainShadowOn);
}
`;

/**
 * Adds terrain shadows to a material's shader (chunks, far ring, plants,
 * grass): the horizon passes to the fragment shader, and every
 * directional light (sun, moon) is dimmed where the terrain hides it. Sky
 * light is untouched, so shaded valleys are dim, not black.
 */
export function addTerrainShadow(shader: THREE.WebGLProgramParametersWithUniforms, source: HorizonSource = 'vertex'): void {
  shader.uniforms.uTerrainShadowOn = terrainShadow.on;
  shader.uniforms.uCloudShadowNoise = cloudShadow.noise;
  shader.uniforms.uCloudShadowCover = cloudShadow.cover;
  shader.uniforms.uCloudShadowOffset = cloudShadow.offset;
  if (source === 'local') {
    shader.uniforms.uLocalHorA = localHorizon.a;
    shader.uniforms.uLocalHorB = localHorizon.b;
  }
  shader.vertexShader = (VERTEX_HEADS[source] + 'varying vec4 vDwHorA;\nvarying vec4 vDwHorB;\nvarying vec3 vDwShadowPos;\n' + shader.vertexShader)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERTEX_SET[source])
    // Render-space position after every displacement (morph, wind, instancing), for the cloud lookup.
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 dwShadowPos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        dwShadowPos = instanceMatrix * dwShadowPos;
      #endif
      vDwShadowPos = (modelMatrix * dwShadowPos).xyz;`,
    );
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    // directLight.direction is in view space; v * viewMatrix rotates it back to world space.
    // three unrolls this loop without braces: keep the local variable in its own block.
    'getDirectionalLightInfo( directionalLight, directLight );\n\t\t{ vec3 dwLightDir = normalize( ( vec4( directLight.direction, 0.0 ) * viewMatrix ).xyz );\n\t\tdirectLight.color *= dwHorizonLight( dwLightDir ) * dwCloudLight( dwLightDir ); }',
  );
  if (lights === THREE.ShaderChunk.lights_fragment_begin) throw new Error('terrain shadow: light loop not found');
  shader.fragmentShader = (FRAGMENT_HEAD + shader.fragmentShader).replace('#include <lights_fragment_begin>', lights);
}
