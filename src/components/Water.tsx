import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SEA_LEVEL, TERRAIN_TEXTURE, WATER, WORLD_SIZE } from '../config/world';
import { waterPalette } from '../design/tokens';
import { clock, origin, player } from '../state/runtime';
import { lightingAt, type Rgb } from '../world/timeOfDay';
import type { WorkerPool } from '../world/workerPool';

/** Depth used where there is no depth map (open sea beyond it, or before it is built). */
const DEFAULT_DEPTH = 30;

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vRender;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vRender = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uDepth;
uniform vec4 uDepthRect;   // xy: render-space min corner, z: size in m, w: 1 when valid
uniform float uDefaultDepth;
uniform sampler2D uNormals;
uniform vec2 uUvOffset;    // origin mod a multiple of the wave tiles: world UVs without big numbers
uniform vec2 uTiles;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;    // colour * intensity
uniform vec3 uAmbient;     // sky light colour * intensity
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
varying vec3 vRender;

vec2 slopeAt(vec2 uv) {
  vec3 n = texture2D(uNormals, uv).xyz * 2.0 - 1.0;
  return n.xy / max(n.z, 0.2);
}

void main() {
  #include <logdepthbuf_fragment>
  vec2 duv = (vRender.xz - uDepthRect.xy) / uDepthRect.z;
  bool mapped = uDepthRect.w > 0.5 && all(greaterThan(duv, vec2(0.0))) && all(lessThan(duv, vec2(1.0)));
  float depth = mapped ? texture2D(uDepth, duv).r * 255.0 * 0.1 : uDefaultDepth;

  vec3 toCamera = cameraPosition - vRender;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;

  // Two wave layers drifting in different directions; calmer with distance
  // (and in the shallows) so far water does not shimmer.
  vec2 p = vRender.xz + uUvOffset;
  vec2 slope = slopeAt(p / uTiles.x + uTime * vec2(0.011, 0.006))
             + slopeAt(p / uTiles.y + uTime * vec2(-0.013, 0.017));
  slope *= 0.5 * mix(1.0, 0.12, smoothstep(40.0, 1500.0, dist)) * mix(0.4, 1.0, smoothstep(0.0, 3.0, depth));
  vec3 N = normalize(vec3(slope.x, 1.0, slope.y));

  // Sky reflection (Schlick fresnel) over the water body's own colour.
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.3, R.y)) * 0.85;
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 light = (uSunColor * max(uSunDir.y, 0.0) + uAmbient) * RECIPROCAL_PI;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.5, 14.0, depth)) * light;
  vec3 color = mix(body, sky, fresnel);

  // Sun glitter.
  vec3 H = normalize(uSunDir + V);
  color += uSunColor * pow(max(dot(N, H), 0.0), 350.0) * 1.5 * step(0.0, uSunDir.y);

  // Foam where the water gets shallow, broken up by the wave height.
  float shore = mapped ? 1.0 - smoothstep(0.0, 1.5, depth) : 0.0;
  float waveHeight = texture2D(uNormals, p / uTiles.x * 1.5 - uTime * 0.008).a;
  float foam = smoothstep(0.55, 0.75, shore * 0.8 + waveHeight * 0.4);
  color = mix(color, uFoam * light, foam);

  // Clear in the shallows, opaque in deep water and at grazing angles.
  float alpha = max(mix(0.3, 0.97, smoothstep(0.0, 5.0, depth)), fresnel);
  alpha = max(alpha, foam);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * The sea: one plane covering the whole 100 × 100 km world at sea level (past
 * its edge there is only sky). Its shader reads a seabed depth map baked around
 * the player in a worker, for the colour gradient from shallow to deep, the
 * clear shallows and the foam line; waves are two drifting normal maps.
 */
export function Water({ pool }: { pool: WorkerPool }) {
  const gl = useThree((s) => s.gl);

  const { mesh, material, depth } = useMemo(() => {
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 128]), 1, 1);
    flat.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uDepth: { value: null },
          uDepthRect: { value: new THREE.Vector4(0, 0, 1, 0) },
          uDefaultDepth: { value: DEFAULT_DEPTH },
          uNormals: { value: flat },
          uUvOffset: { value: new THREE.Vector2() },
          uTiles: { value: new THREE.Vector2(WATER.waveTiles[0], WATER.waveTiles[1]) },
          uTime: { value: 0 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uAmbient: { value: new THREE.Color() },
          uSkyZenith: { value: new THREE.Color() },
          uSkyHorizon: { value: new THREE.Color() },
          uShallow: { value: new THREE.Color(waterPalette.shallow) },
          uDeep: { value: new THREE.Color(waterPalette.deep) },
          uFoam: { value: new THREE.Color(waterPalette.foam) },
        },
      ]),
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.frustumCulled = false;
    // The depth map currently shown, and where (in world meters) it was built.
    const depth = { texture: null as THREE.DataTexture | null, x: 0, z: 0, pending: false, disposed: false };
    return { mesh, material, depth };
  }, []);

  useEffect(() => {
    let normals: THREE.DataTexture | null = null;
    pool
      .buildWaterNormals(WATER.normalTextureSize)
      .then((data) => {
        if (depth.disposed) return;
        const size = WATER.normalTextureSize;
        normals = new THREE.DataTexture(data as Uint8Array<ArrayBuffer>, size, size);
        normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
        normals.magFilter = THREE.LinearFilter;
        normals.minFilter = THREE.LinearMipmapLinearFilter;
        normals.generateMipmaps = true;
        normals.anisotropy = gl.capabilities.getMaxAnisotropy();
        normals.needsUpdate = true;
        material.uniforms.uNormals!.value = normals;
      })
      .catch((err: unknown) => console.warn('[water] wave normals failed; flat water', err));
    return () => {
      depth.disposed = true;
      normals?.dispose();
      depth.texture?.dispose();
      (material.uniforms.uNormals!.value as THREE.Texture).dispose();
      mesh.geometry.dispose();
      material.dispose();
    };
  }, [pool, gl, mesh, material, depth]);

  useFrame((_, dt) => {
    // Rebuild the depth map around the player when they get near its edge.
    if (!depth.pending && (!depth.texture || Math.hypot(player.x - depth.x, player.z - depth.z) > WATER.rebuildDistance)) {
      const x = player.x;
      const z = player.z;
      depth.pending = true;
      pool
        .buildSeabed({ centerX: x, centerZ: z, size: WATER.depthTextureSize, resolution: WATER.depthTextureRes })
        .then((data) => {
          if (depth.disposed) return;
          const res = WATER.depthTextureRes;
          const texture = new THREE.DataTexture(data as Uint8Array<ArrayBuffer>, res, res, THREE.RedFormat, THREE.UnsignedByteType);
          texture.magFilter = texture.minFilter = THREE.LinearFilter;
          texture.needsUpdate = true;
          depth.texture?.dispose();
          depth.texture = texture;
          depth.x = x;
          depth.z = z;
          material.uniforms.uDepth!.value = texture;
        })
        .catch((err: unknown) => console.warn('[water] depth map failed', err))
        .finally(() => {
          depth.pending = false;
        });
    }

    const u = material.uniforms;
    mesh.position.set(WORLD_SIZE / 2 - origin.x, SEA_LEVEL, WORLD_SIZE / 2 - origin.z);
    const half = WATER.depthTextureSize / 2;
    (u.uDepthRect!.value as THREE.Vector4).set(depth.x - half - origin.x, depth.z - half - origin.z, WATER.depthTextureSize, depth.texture ? 1 : 0);
    (u.uUvOffset!.value as THREE.Vector2).set(origin.x % TERRAIN_TEXTURE.uvWrap, origin.z % TERRAIN_TEXTURE.uvWrap);
    u.uTime!.value = (u.uTime!.value as number) + Math.min(dt, 0.1);

    const l = lightingAt(clock.hours);
    (u.uSunDir!.value as THREE.Vector3).set(...l.sunDirection);
    setLinear(u.uSunColor!.value as THREE.Color, l.sunColor, l.sunIntensity);
    setLinear(u.uAmbient!.value as THREE.Color, l.skyLightColor, l.ambientIntensity);
    setLinear(u.uSkyZenith!.value as THREE.Color, l.zenithColor, 1);
    setLinear(u.uSkyHorizon!.value as THREE.Color, l.horizonColor, 1);
  });

  return <primitive object={mesh} />;
}

function setLinear(color: THREE.Color, rgb: Rgb, intensity: number): void {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace).multiplyScalar(intensity);
}
