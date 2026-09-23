import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAMERA } from '../config/world';
import { world } from '../design/tokens';

/** Dusk gradient dome (sky-glow at the horizon → sky-zenith overhead). Follows the camera. */
export function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          zenith: { value: new THREE.Color(world.skyZenith) },
          glow: { value: new THREE.Color(world.skyGlow) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w; // always at the far plane
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith;
          uniform vec3 glow;
          varying vec3 vDir;
          void main() {
            float t = smoothstep(-0.02, 0.45, vDir.y);
            gl_FragColor = vec4(mix(glow, zenith, t), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );

  useFrame(({ camera }) => ref.current?.position.copy(camera.position));

  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[CAMERA.far * 0.9, 32, 16]} />
    </mesh>
  );
}
