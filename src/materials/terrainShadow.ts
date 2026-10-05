import * as THREE from 'three';
import { TERRAIN_SHADOW, WEATHER } from '../config/world';

/** Terrain shadows on/off (F3 and the test hook). */
export const terrainShadow = { on: { value: 1 } };

/** World directions toward the sun and the moon, set by Atmosphere each frame. */
export const lightDirections = { sun: { value: new THREE.Vector3(0, 1, 0) }, moon: { value: new THREE.Vector3(0, -1, 0) } };

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
export type HorizonSource = 'vertex' | 'instance' | 'local' | 'fixed';

const D = TERRAIN_SHADOW.directions;

const HORIZON_INPUT: Record<HorizonSource, { head: string; a: string; b: string }> = {
  vertex: { head: 'attribute vec4 horizonA;\nattribute vec4 horizonB;\n', a: 'horizonA', b: 'horizonB' },
  instance: { head: 'attribute vec4 aHorA;\nattribute vec4 aHorB;\n', a: 'aHorA', b: 'aHorB' },
  local: { head: 'uniform vec4 uLocalHorA;\nuniform vec4 uLocalHorB;\n', a: 'uLocalHorA', b: 'uLocalHorB' },
  fixed: { head: 'uniform vec4 uFixedHorA;\nuniform vec4 uFixedHorB;\n', a: 'uFixedHorA', b: 'uFixedHorB' },
};

/** A horizon of its own for one object (the giant trees): traced once at its foot. */
export interface FixedHorizon {
  a: { value: THREE.Vector4 };
  b: { value: THREE.Vector4 };
}

/**
 * Light visibility is worked out per vertex (the shadows are soft and the
 * clouds kilometres wide, so per pixel would only cost more): one value for
 * the sun and one for the moon, passed to the fragment shader.
 */
const VERTEX_HEAD = /* glsl */ `
uniform float uTerrainShadowOn;
uniform vec3 uDwSunDir;
uniform vec3 uDwMoonDir;
uniform sampler2D uCloudShadowNoise;
uniform float uCloudShadowCover;
uniform vec2 uCloudShadowOffset;
varying float vDwSunLight;
varying float vDwMoonLight;
// 1 where light from world direction dir (towards the light) clears the
// terrain horizon, 0 where hills hide it; soft at the edge.
float dwHorizonLight(vec4 ha, vec4 hb, vec3 dir) {
  float h[${D + 1}];
  h[0] = ha.x; h[1] = ha.y; h[2] = ha.z; h[3] = ha.w;
  h[4] = hb.x; h[5] = hb.y; h[6] = hb.z; h[7] = hb.w;
  h[8] = ha.x;
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
// Sunlight left after the clouds: follow the light up to the cloud plane and
// read the same noise and threshold as the sky's cloud layer.
float dwCloudLight(vec3 pos, vec3 dir) {
  if (uCloudShadowCover < 0.01 || dir.y < 0.03) return 1.0;
  vec2 p = (pos.xz + dir.xz / dir.y * (${WEATHER.cloudHeight.toFixed(1)} - pos.y) + uCloudShadowOffset) / ${WEATHER.cloudTile.toFixed(1)};
  float n = textureLod(uCloudShadowNoise, p, 0.0).r * 0.55 + textureLod(uCloudShadowNoise, p * 2.7 + 0.37, 0.0).r * 0.3 + textureLod(uCloudShadowNoise, p * 7.1 + 0.71, 0.0).r * 0.15;
  float edge = 1.0 - uCloudShadowCover;
  float density = smoothstep(edge * 0.9, edge * 0.9 + 0.22, n);
  return 1.0 - density * ${TERRAIN_SHADOW.cloudStrength.toFixed(2)};
}
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uDwSunDir;
varying float vDwSunLight;
varying float vDwMoonLight;
// Visibility of a directional light (world direction towards it): sun or moon.
float dwLightVisibility(vec3 dir) {
  return dot(dir, uDwSunDir) > 0.999 ? vDwSunLight : vDwMoonLight;
}
`;

/** GLSL for a view-space light direction rotated back to world space (v * viewMatrix). */
export const worldLightDir = (viewDir: string) => `normalize((vec4(${viewDir}, 0.0) * viewMatrix).xyz)`;

/**
 * Adds terrain and cloud shadows to a material's shader (chunks, far ring,
 * plants, grass): every directional light (sun, moon) is dimmed where the
 * terrain hides it or clouds cover it. Sky light is untouched, so shaded
 * ground is dim, not black. `dwLightVisibility(worldDir)` is available to the
 * fragment shader for extra light terms (light through leaves).
 */
export function addTerrainShadow(shader: THREE.WebGLProgramParametersWithUniforms, source: HorizonSource = 'vertex', fixed?: FixedHorizon): void {
  Object.assign(shader.uniforms, {
    uTerrainShadowOn: terrainShadow.on,
    uDwSunDir: lightDirections.sun,
    uDwMoonDir: lightDirections.moon,
    uCloudShadowNoise: cloudShadow.noise,
    uCloudShadowCover: cloudShadow.cover,
    uCloudShadowOffset: cloudShadow.offset,
  });
  if (source === 'local') Object.assign(shader.uniforms, { uLocalHorA: localHorizon.a, uLocalHorB: localHorizon.b });
  if (source === 'fixed') {
    if (!fixed) throw new Error("terrain shadow: 'fixed' needs its horizon");
    Object.assign(shader.uniforms, { uFixedHorA: fixed.a, uFixedHorB: fixed.b });
  }
  const input = HORIZON_INPUT[source];
  shader.vertexShader = (input.head + VERTEX_HEAD + shader.vertexShader).replace(
    '#include <project_vertex>',
    // After every displacement (morph, wind, instancing): the render-space position for the cloud lookup.
    `#include <project_vertex>
    {
      vec4 dwPos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        dwPos = instanceMatrix * dwPos;
      #endif
      dwPos = modelMatrix * dwPos;
      vDwSunLight = dwHorizonLight(${input.a}, ${input.b}, uDwSunDir) * dwCloudLight(dwPos.xyz, uDwSunDir);
      vDwMoonLight = dwHorizonLight(${input.a}, ${input.b}, uDwMoonDir);
    }`,
  );
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    // three unrolls this loop without braces: no local variables here.
    `getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= dwLightVisibility( ${worldLightDir('directLight.direction')} );`,
  );
  if (lights === THREE.ShaderChunk.lights_fragment_begin) throw new Error('terrain shadow: light loop not found');
  shader.fragmentShader = (FRAGMENT_HEAD + shader.fragmentShader).replace('#include <lights_fragment_begin>', lights);
}
