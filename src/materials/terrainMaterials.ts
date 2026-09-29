import * as THREE from 'three';
import { CHUNK_SIZE, LOD_LEVELS, MORPH_RANGE } from '../config/world';

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

/** [start, end] of the morph for a LOD, in meters. The coarsest LOD never morphs. */
export function morphRange(lod: number): THREE.Vector2 {
  const last = lod >= LOD_LEVELS.length - 1;
  if (last) return new THREE.Vector2(1e9, 1e9 + 1);
  const end = LOD_LEVELS[lod]!.maxDistance * CHUNK_SIZE;
  return new THREE.Vector2(end - MORPH_RANGE, end);
}

const MORPH_HEAD = /* glsl */ `
uniform vec2 uPlayer;
uniform vec2 uMorph;
uniform float uMorphOn;
float dwMorphFactor(vec3 worldPos) {
  float d = max(abs(worldPos.x - uPlayer.x), abs(worldPos.z - uPlayer.y));
  return uMorphOn * clamp((d - uMorph.x) / (uMorph.y - uMorph.x), 0.0, 1.0);
}
`;

export function createTerrainMaterial(lod: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const range = morphRange(lod);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = morphPlayer;
    shader.uniforms.uMorph = { value: range };
    shader.uniforms.uMorphOn = morphEnabled;
    shader.vertexShader = ('attribute float morphHeight;\nattribute vec3 morphNormal;\nattribute vec3 morphColor;\n' + MORPH_HEAD + shader.vertexShader)
      // Colour comes first in three's vertex shader, so compute the factor there.
      .replace(
        '#include <color_vertex>',
        /* glsl */ `float dwM = dwMorphFactor((modelMatrix * vec4(position, 1.0)).xyz);
        #include <color_vertex>
        vColor.xyz = mix(color.xyz, morphColor, dwM);`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, morphNormal, dwM));')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mix(transformed.y, morphHeight, dwM);');
  };
  material.customProgramCacheKey = () => 'dw-terrain-morph';
  return material;
}

/**
 * Placeholder props (instanced). Each instance has `aMorphDelta` = its height on
 * the coarser mesh minus its height on its own mesh, and follows the ground's morph.
 */
export function createPropMaterial(color: THREE.ColorRepresentation, lod: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const range = morphRange(lod);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = morphPlayer;
    shader.uniforms.uMorph = { value: range };
    shader.uniforms.uMorphOn = morphEnabled;
    shader.vertexShader =
      'attribute float aMorphDelta;\n' +
      MORPH_HEAD +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float dwMorph = dwMorphFactor((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
          // transformed is scaled by the instance matrix afterwards, so undo its Y scale.
          transformed.y += aMorphDelta * dwMorph / length(instanceMatrix[1].xyz);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'dw-prop-morph';
  return material;
}
