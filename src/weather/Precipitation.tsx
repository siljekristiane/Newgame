import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PRECIPITATION, WORLD_SEED } from '../config/world';
import { weatherPalette } from '../design/tokens';
import { origin, player, weather } from '../state/runtime';
import { climateAt } from '../world/biomes';
import { snowFraction } from './weather';
import { mulberry32 } from '../world/noise';

/**
 * Rain and snow in a box around the camera, animated entirely on the GPU.
 * Each particle has a fixed random place in a PRECIPITATION.box-sized cell
 * that tiles the world; the shader moves it with the fall speed and wind and
 * wraps it round the camera, so drops stay put in the world as you walk
 * through them. Rain draws short streaks along the fall direction, snow soft
 * points; which one depends on the temperature where the player is.
 */

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec4 aSeed;   // xyz: place in the cell 0..1, w: order in which drops appear
attribute float aEnd;   // 0 = head of the streak, 1 = tail (rain only)
uniform vec3 uOffset;   // accumulated travel (fall + wind), modulo the box
uniform vec3 uVelocity; // m/s (wind x, -fall, wind z), for the streak direction
uniform vec3 uCamMod;   // camera world position modulo the box
uniform float uBox;
uniform float uAmount;  // 0..1: share of particles shown
uniform float uStreak;  // streak length in seconds of travel
uniform float uSize;
varying float vAlpha;
void main() {
  vec3 p = aSeed.xyz * uBox + uOffset;
  vec3 rel = mod(p - uCamMod, uBox) - 0.5 * uBox;
  rel -= uVelocity * uStreak * aEnd;
  vec3 world = cameraPosition + rel;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Hide particles beyond the current amount, and fade them toward the box edge.
  float shown = step(aSeed.w, uAmount);
  vAlpha = shown * (1.0 - smoothstep(0.3, 0.5, length(rel) / uBox)) * (1.0 - aEnd * 0.8);
  gl_PointSize = uSize * shown * 300.0 / max(1.0, -mvPosition.z);
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRound;   // 1 for snow points: round, soft flakes
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  float a = vAlpha * uOpacity;
  if (uRound > 0.5) {
    vec2 c = gl_PointCoord - 0.5;
    a *= 1.0 - smoothstep(0.2, 0.5, length(c));
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function makeMaterial(color: string, round: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uOffset: { value: new THREE.Vector3() },
        uVelocity: { value: new THREE.Vector3() },
        uCamMod: { value: new THREE.Vector3() },
        uBox: { value: PRECIPITATION.box },
        uAmount: { value: 0 },
        uStreak: { value: 0 },
        uSize: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 },
        uRound: { value: round ? 1 : 0 },
      },
    ]),
  });
}

export function Precipitation() {
  const parts = useMemo(() => {
    const random = mulberry32(WORLD_SEED + 1_500);
    const n = PRECIPITATION.count;
    // Rain: two vertices per drop (head and tail of the streak).
    const rainSeeds = new Float32Array(n * 8);
    const rainEnds = new Float32Array(n * 2);
    const snowSeeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const seed = [random(), random(), random(), random()];
      rainSeeds.set(seed, i * 8);
      rainSeeds.set(seed, i * 8 + 4);
      rainEnds[i * 2 + 1] = 1;
      snowSeeds.set([random(), random(), random(), random()], i * 4);
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    rainGeometry.setAttribute('aSeed', new THREE.BufferAttribute(rainSeeds, 4));
    rainGeometry.setAttribute('aEnd', new THREE.BufferAttribute(rainEnds, 1));
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    snowGeometry.setAttribute('aSeed', new THREE.BufferAttribute(snowSeeds, 4));
    snowGeometry.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(n), 1));

    const rain = new THREE.LineSegments(rainGeometry, makeMaterial(weatherPalette.rain, false));
    const snow = new THREE.Points(snowGeometry, makeMaterial(weatherPalette.snow, true));
    for (const obj of [rain, snow]) {
      obj.frustumCulled = false; // placed in the shader, always around the camera
      obj.renderOrder = 5;
      obj.visible = false;
    }
    // Travel so far, accumulated on the CPU (float64): wind changes never make particles jump.
    return { rain, snow, travel: { rain: new THREE.Vector3(), snow: new THREE.Vector3() } };
  }, []);

  useEffect(
    () => () => {
      for (const obj of [parts.rain, parts.snow]) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    },
    [parts],
  );

  useFrame(({ camera }, dt) => {
    const amount = weather.precipitation;
    const { temperature } = climateAt(player.x, player.z, player.y);
    const snowy = snowFraction(temperature);
    const box = PRECIPITATION.box;
    const cam = camera.position;
    const mod = (v: number) => ((v % box) + box) % box;
    const step = Math.min(dt, 0.1);
    const set = (obj: THREE.LineSegments | THREE.Points, travel: THREE.Vector3, share: number, fall: number, windK: number, streak: number, size: number, opacity: number) => {
      obj.visible = amount * share > 0.01;
      if (!obj.visible) return;
      const u = (obj.material as THREE.ShaderMaterial).uniforms;
      const v = u.uVelocity!.value as THREE.Vector3;
      v.set(weather.windX * windK, -fall, weather.windZ * windK);
      travel.set(mod(travel.x + v.x * step), mod(travel.y + v.y * step), mod(travel.z + v.z * step));
      (u.uOffset!.value as THREE.Vector3).copy(travel);
      (u.uCamMod!.value as THREE.Vector3).set(mod(origin.x + cam.x), mod(cam.y), mod(origin.z + cam.z));
      u.uAmount!.value = amount * share;
      u.uStreak!.value = streak;
      u.uSize!.value = size;
      u.uOpacity!.value = opacity;
    };
    set(parts.rain, parts.travel.rain, 1 - snowy, PRECIPITATION.rainSpeed, 0.6, 0.035, 0, 0.45);
    set(parts.snow, parts.travel.snow, snowy, PRECIPITATION.snowSpeed, 0.35, 0, PRECIPITATION.snowSize, 0.85);
  });

  return (
    <>
      <primitive object={parts.rain} />
      <primitive object={parts.snow} />
    </>
  );
}
