import * as THREE from 'three';
import { VEGETATION } from '../config/world';
import { MORPH_HEAD, morphEnabled, morphPlayer, morphRange } from './terrainMaterials';
import { addTerrainShadow, worldLightDir } from './terrainShadow';

/** Seconds of wind animation, advanced by the terrain component each frame. */
export const plantWind = {
  time: { value: 0 },
  /** origin mod 1000 m: keeps the wind phase continuous in world space without big numbers. */
  originMod: { value: new THREE.Vector2() },
  /** Sway multiplier from the weather's wind (1 = a light breeze). */
  strength: { value: 1 },
};

/**
 * One material for every plant and boulder of a LOD: vertex colours, a
 * per-instance tint (instanceColor), wind sway on `sway` vertices, and the
 * LOD morph (height delta + shrinking away for plants the next LOD drops).
 */
export function createPlantMaterial(lod: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const range = morphRange(lod);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = morphPlayer;
    shader.uniforms.uMorph = { value: range };
    shader.uniforms.uMorphOn = morphEnabled;
    shader.uniforms.uWindTime = plantWind.time;
    shader.uniforms.uOriginMod = plantWind.originMod;
    shader.uniforms.uWindScale = plantWind.strength;
    shader.vertexShader =
      /* glsl */ `attribute float aMorphDelta;
      attribute float aFade;
      attribute float sway;
      varying float vFoliage;
      uniform float uWindTime;
      uniform vec2 uOriginMod;
      uniform float uWindScale;
      ` +
      MORPH_HEAD +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vFoliage = sway > 0.0 ? 1.0 : 0.0;
        #ifdef USE_INSTANCING
          vec3 dwBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float dwMorph = dwMorphFactor(dwBase);
          // Shrink away plants the next LOD leaves out, then follow the ground's morph.
          transformed *= 1.0 - dwMorph * aFade;
          transformed.y += aMorphDelta * dwMorph / length(instanceMatrix[1].xyz);
          // Wind: slow sway plus a quicker flutter, phase from the world position.
          vec2 dwW = dwBase.xz + uOriginMod;
          float dwPhase = uWindTime * ${VEGETATION.windSpeed.toFixed(2)} + dot(dwW, vec2(0.021, 0.017));
          vec2 dwSway = vec2(sin(dwPhase), cos(dwPhase * 0.7)) + 0.3 * sin(uWindTime * 3.1 + dwW.yx * 0.3);
          transformed.xz += dwSway * sway * uWindScale * ${VEGETATION.windStrength.toFixed(2)};
        #endif`,
      );
    addTerrainShadow(shader, 'instance');
    // Leaves let light through: some sky light on every side, and the sun
    // shining through from behind, so backlit trees are not black cut-outs.
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vFoliage;\nvoid main() {')
      .replace(
        '#include <lights_fragment_maps>',
        /* glsl */ `#include <lights_fragment_maps>
        #if NUM_HEMI_LIGHTS > 0
          irradiance += hemisphereLights[0].skyColor * ${VEGETATION.foliageSkyLight.toFixed(2)} * vFoliage;
        #endif
        #if NUM_DIR_LIGHTS > 0
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
            irradiance += directionalLights[i].color * max(dot(-normal, directionalLights[i].direction), 0.0) * ${VEGETATION.foliageTransmission.toFixed(2)} * vFoliage
              * dwLightVisibility(${worldLightDir('directionalLights[i].direction')});
          }
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'dw-plant';
  return material;
}
