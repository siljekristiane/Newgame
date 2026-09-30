import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CAMERA, SHADOWS, WORLD_SEED } from '../config/world';
import { clock, origin, player } from '../state/runtime';
import { useGameStore } from '../state/useGameStore';
import { atmosphere } from '../design/tokens';
import { mulberry32 } from '../world/noise';
import { lightingAt, type Rgb } from '../world/timeOfDay';

const SKY_SCALE = CAMERA.far * 0.8;
const STAR_COUNT = 2500;
/** Snap the shadow box to its texel grid in world space, so shadows don't shimmer when walking. */
const SHADOW_TEXEL = (SHADOWS.radius * 2) / SHADOWS.mapSize;

/**
 * Sky, sun, moon, stars, ambient light, fog and exposure, all driven by the
 * in-game clock (world/timeOfDay.ts). The sun casts shadows in a box around
 * the player; everything is placed in render space (world − origin).
 */
export function Atmosphere() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const shadows = useGameStore((s) => s.shadows);

  const objects = useMemo(() => {
    const sky = new Sky();
    sky.scale.setScalar(SKY_SCALE);
    sky.frustumCulled = false;
    const u = sky.material.uniforms;
    u.turbidity!.value = 3.5;
    u.rayleigh!.value = 1.4;
    u.mieCoefficient!.value = 0.004;
    u.mieDirectionalG!.value = 0.82;
    // The sky model is made for daylight; at night blend toward a dark gradient.
    const night = { value: 0 };
    const nightZenith = { value: new THREE.Color() };
    const nightHorizon = { value: new THREE.Color() };
    sky.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night;
      shader.uniforms.uNightZenith = nightZenith;
      shader.uniforms.uNightHorizon = nightHorizon;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uNight;\nuniform vec3 uNightZenith;\nuniform vec3 uNightHorizon;\nvoid main() {')
        .replace(
          '#include <tonemapping_fragment>',
          `vec3 dwDir = normalize(vWorldPosition - cameraPosition);
          vec3 dwNightSky = mix(uNightHorizon, uNightZenith, smoothstep(0.0, 0.5, dwDir.y));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, dwNightSky, uNight);
          #include <tonemapping_fragment>`,
        );
    };

    const sun = new THREE.DirectionalLight();
    sun.shadow.mapSize.set(SHADOWS.mapSize, SHADOWS.mapSize);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -SHADOWS.radius;
    cam.right = cam.top = SHADOWS.radius;
    cam.near = 1;
    cam.far = 2_000;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.35;
    const moon = new THREE.DirectionalLight(atmosphere.moon);
    const hemi = new THREE.HemisphereLight();

    // Stars: fixed points on a sphere that follows the camera, faded in at night.
    const random = mulberry32(WORLD_SEED + 99);
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const y = random() * 1.1 - 0.1; // mostly above the horizon
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const t = random() * Math.PI * 2;
      positions.set([Math.cos(t) * r * SKY_SCALE * 0.4, y * SKY_SCALE * 0.4, Math.sin(t) * r * SKY_SCALE * 0.4], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0xffffff, transparent: true, depthWrite: false, fog: false }),
    );
    stars.frustumCulled = false;
    stars.renderOrder = 1;

    const fog = new THREE.Fog(0xffffff, CAMERA.fogNear, CAMERA.fogFar);
    return { sky, sun, moon, hemi, stars, fog, night, nightZenith, nightHorizon };
  }, []);

  useEffect(() => {
    const { sky, sun, moon, hemi, stars, fog } = objects;
    scene.add(sky, sun, sun.target, moon, moon.target, hemi, stars);
    scene.fog = fog;
    gl.toneMapping = THREE.AgXToneMapping;
    return () => {
      scene.remove(sky, sun, sun.target, moon, moon.target, hemi, stars);
      scene.fog = null;
      sky.geometry.dispose();
      sky.material.dispose();
      sun.dispose();
      moon.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
    };
  }, [objects, scene, gl]);

  useFrame(({ camera }) => {
    const { sky, sun, moon, hemi, stars, fog, night, nightZenith, nightHorizon } = objects;
    const l = lightingAt(clock.hours);
    night.value = Math.pow(l.night, 0.6);
    setSrgb(nightZenith.value, l.zenithColor);
    setSrgb(nightHorizon.value, l.horizonColor);
    const [dx, dy, dz] = l.sunDirection;

    sky.position.copy(camera.position);
    sky.material.uniforms.sunPosition!.value.set(dx, dy, dz);
    stars.position.copy(camera.position);
    (stars.material as THREE.PointsMaterial).opacity = l.night;
    stars.visible = l.night > 0.01;

    // Shadow box centred on the player, snapped to texels in world space.
    const tx = Math.round(player.x / SHADOW_TEXEL) * SHADOW_TEXEL - origin.x;
    const tz = Math.round(player.z / SHADOW_TEXEL) * SHADOW_TEXEL - origin.z;
    const ty = player.y;
    sun.target.position.set(tx, ty, tz);
    sun.position.set(tx + dx * 1_000, ty + dy * 1_000, tz + dz * 1_000);
    setSrgb(sun.color, l.sunColor);
    sun.intensity = l.sunIntensity;
    sun.castShadow = shadows && l.sunIntensity > 0.05;

    const [mx, my, mz] = l.moonDirection;
    moon.target.position.set(tx, ty, tz);
    moon.position.set(tx + mx * 1_000, ty + my * 1_000, tz + mz * 1_000);
    moon.intensity = l.moonIntensity;

    setSrgb(hemi.color, l.skyLightColor);
    setSrgb(hemi.groundColor, l.groundColor);
    hemi.intensity = l.ambientIntensity;
    setSrgb(fog.color, l.horizonColor);
    gl.toneMappingExposure = l.exposure;
  });

  return null;
}

function setSrgb(color: THREE.Color, rgb: Rgb): void {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}
