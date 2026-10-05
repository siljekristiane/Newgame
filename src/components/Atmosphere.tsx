import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CAMERA, SHADOWS, WEATHER, WORLD_SEED } from '../config/world';
import { clock, cloudDrift, origin, player, weather } from '../state/runtime';
import { buildCloudNoise } from '../weather/clouds';
import { useGameStore } from '../state/useGameStore';
import { atmosphere } from '../design/tokens';
import { mulberry32 } from '../world/noise';
import { lightingAt, type Rgb } from '../world/timeOfDay';
import { cloudShadow } from '../materials/terrainShadow';

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
    // Cloud layer: a plane WEATHER.cloudHeight up, textured with tiling noise
    // and thresholded by cloud cover; lit from the sun side, grey underneath.
    const cloudNoise = new THREE.DataTexture(buildCloudNoise(256) as Uint8Array<ArrayBuffer>, 256, 256, THREE.RedFormat);
    cloudNoise.wrapS = cloudNoise.wrapT = THREE.RepeatWrapping;
    cloudNoise.magFilter = THREE.LinearFilter;
    cloudNoise.minFilter = THREE.LinearMipmapLinearFilter;
    cloudNoise.generateMipmaps = true;
    cloudNoise.needsUpdate = true;
    const clouds = {
      uCloudNoise: { value: cloudNoise },
      uCloudCover: { value: 0 },
      /** World position of the camera plus the wind drift, modulo the tile (meters). */
      uCloudOffset: { value: new THREE.Vector2() },
      uCloudLight: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
    };
    sky.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night;
      shader.uniforms.uNightZenith = nightZenith;
      shader.uniforms.uNightHorizon = nightHorizon;
      Object.assign(shader.uniforms, clouds);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform float uNight;
          uniform vec3 uNightZenith;
          uniform vec3 uNightHorizon;
          uniform sampler2D uCloudNoise;
          uniform float uCloudCover;
          uniform vec2 uCloudOffset;
          uniform vec3 uCloudLight;
          uniform vec3 uCloudShade;
          void main() {`,
        )
        .replace(
          '#include <tonemapping_fragment>',
          `vec3 dwDir = normalize(vWorldPosition - cameraPosition);
          vec3 dwNightSky = mix(uNightHorizon, uNightZenith, smoothstep(0.0, 0.5, dwDir.y));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, dwNightSky, uNight);
          if (dwDir.y > 0.0 && uCloudCover > 0.01) {
            // Where the view ray meets the cloud plane (flattened toward the horizon).
            vec2 dwP = (dwDir.xz / (dwDir.y + 0.06) * ${WEATHER.cloudHeight.toFixed(1)} + uCloudOffset) / ${WEATHER.cloudTile.toFixed(1)};
            float dwN = texture2D(uCloudNoise, dwP).r * 0.55 + texture2D(uCloudNoise, dwP * 2.7 + 0.37).r * 0.3 + texture2D(uCloudNoise, dwP * 7.1 + 0.71).r * 0.15;
            float dwEdge = 1.0 - uCloudCover;
            float dwDensity = smoothstep(dwEdge * 0.9, dwEdge * 0.9 + 0.22, dwN);
            // Thick parts are darker underneath; the sun side glows.
            float dwThick = smoothstep(dwEdge, dwEdge + 0.45, dwN);
            float dwSun = pow(max(dot(dwDir, vSunDirection), 0.0), 6.0);
            vec3 dwCloud = mix(uCloudLight, uCloudShade, dwThick * 0.8) * (1.0 + dwSun * 0.6);
            float dwFade = smoothstep(0.0, 0.1, dwDir.y);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, dwCloud, dwDensity * dwFade);
          }
          // Overcast: a grey veil over the whole sky (hides the sun disc too).
          float dwVeil = smoothstep(0.55, 0.95, uCloudCover);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(uCloudLight, uCloudShade, 0.35), dwVeil * 0.9);
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
    return { sky, sun, moon, hemi, stars, fog, night, nightZenith, nightHorizon, clouds };
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
      objects.clouds.uCloudNoise.value.dispose();
      sun.dispose();
      moon.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
    };
  }, [objects, scene, gl]);

  useFrame(({ camera }) => {
    const { sky, sun, moon, hemi, stars, fog, night, nightZenith, nightHorizon, clouds } = objects;
    const l = lightingAt(clock.hours);
    const cover = weather.cloudCover;
    const wet = weather.precipitation;
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
    // Clouds dim the sun (and soften its shadows away under overcast).
    sun.intensity = l.sunIntensity * (1 - 0.7 * cover * cover);
    sun.castShadow = shadows && sun.intensity > 0.05;

    const [mx, my, mz] = l.moonDirection;
    moon.target.position.set(tx, ty, tz);
    moon.position.set(tx + mx * 1_000, ty + my * 1_000, tz + mz * 1_000);
    moon.intensity = l.moonIntensity;

    setSrgb(hemi.color, l.skyLightColor);
    hemi.color.lerp(grey.setScalar(hemi.color.r * 0.3 + hemi.color.g * 0.55 + hemi.color.b * 0.15), cover * 0.7);
    setSrgb(hemi.groundColor, l.groundColor);
    hemi.intensity = l.ambientIntensity * (1 + 0.25 * cover);
    setSrgb(fog.color, l.horizonColor);
    fog.color.lerp(grey.setScalar(fog.color.r * 0.3 + fog.color.g * 0.55 + fog.color.b * 0.15), cover * 0.6);
    // Rain closes the view in.
    fog.near = CAMERA.fogNear + (WEATHER.rainFogNear - CAMERA.fogNear) * wet;
    fog.far = CAMERA.fogFar + (WEATHER.rainFogFar - CAMERA.fogFar) * wet;
    gl.toneMappingExposure = l.exposure;

    // Cloud layer: lit by the sun and sky, darker the more overcast it is.
    clouds.uCloudCover.value = cover;
    // The same clouds shade the ground (step 14).
    cloudShadow.noise.value = clouds.uCloudNoise.value;
    cloudShadow.cover.value = cover;
    cloudShadow.offset.value.set(mod(origin.x + cloudDrift.x, WEATHER.cloudTile), mod(origin.z + cloudDrift.z, WEATHER.cloudTile));
    const cam = camera.position;
    clouds.uCloudOffset.value.set(mod(origin.x + cam.x + cloudDrift.x, WEATHER.cloudTile), mod(origin.z + cam.z + cloudDrift.z, WEATHER.cloudTile));
    const lightK = (0.35 + 0.65 * (1 - l.night)) * (1 - 0.45 * cover);
    setSrgb(clouds.uCloudLight.value, l.horizonColor);
    clouds.uCloudLight.value.lerp(white.setRGB(l.sunColor[0], l.sunColor[1], l.sunColor[2], THREE.SRGBColorSpace), 0.5 * (1 - l.night)).multiplyScalar(lightK * 1.1);
    clouds.uCloudShade.value.copy(clouds.uCloudLight.value).multiplyScalar(0.45);
  });

  return null;
}

const grey = new THREE.Color();
const white = new THREE.Color();
const mod = (v: number, m: number) => ((v % m) + m) % m;

function setSrgb(color: THREE.Color, rgb: Rgb): void {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}
