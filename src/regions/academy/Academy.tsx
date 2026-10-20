import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ACADEMY, TERRAIN_SHADOW } from '../../config/world';
import { academyPalette } from '../../design/tokens';
import { addTerrainShadow, lightDirections, type FixedHorizon } from '../../materials/terrainShadow';
import { origin } from '../../state/runtime';
import { horizonAt } from '../../world/horizon';
import { ACADEMY_PARTS, createAcademyGeometry, type AcademyPart } from './academyGeometry';
import { academyLayout } from './layout';

/** Texture sets in public/textures/academy (CC0, Poly Haven; see CREDITS.md). */
const TEXTURED: ReadonlyArray<Exclude<AcademyPart, 'glass'>> = ['wall', 'roof', 'trim', 'door'];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The academy by the spawn plaza (regions/academy). Built once in its own
 * frame and placed at its world position minus the floating origin. Each
 * surface is a PBR material that starts as a plain colour from the palette
 * and takes its CC0 texture set (colour, normal, AO/roughness/metal) once the
 * files have loaded, so the building is never missing. It gets mountain and
 * cloud shadow from the horizon at its foot, like the giant trees, and its
 * windows glow after dark.
 */
export function Academy() {
  const gl = useThree((s) => s.gl);

  const built = useMemo(() => {
    const layout = academyLayout();
    const { parts } = createAcademyGeometry();
    const bytes = new Uint8Array(TERRAIN_SHADOW.directions);
    horizonAt(layout.x, layout.z, bytes);
    const horizon: FixedHorizon = {
      a: { value: new THREE.Vector4(bytes[0]! / 255, bytes[1]! / 255, bytes[2]! / 255, bytes[3]! / 255) },
      b: { value: new THREE.Vector4(bytes[4]! / 255, bytes[5]! / 255, bytes[6]! / 255, bytes[7]! / 255) },
    };
    const materials = {} as Record<AcademyPart, THREE.MeshStandardMaterial>;
    for (const part of ACADEMY_PARTS) {
      const glass = part === 'glass';
      const m = new THREE.MeshStandardMaterial({
        color: academyPalette[part],
        roughness: glass ? 0.12 : 0.9,
        metalness: glass ? 0.4 : 0,
        emissive: glass ? academyPalette.glow : '#000000',
        emissiveIntensity: 0,
      });
      m.name = `academy-${part}`;
      m.onBeforeCompile = (shader) => addTerrainShadow(shader, 'fixed', horizon);
      // Textured and plain variants compile to different programs.
      m.customProgramCacheKey = () => `dw-academy-${m.map ? 'tex' : 'plain'}`;
      materials[part] = m;
    }
    const group = new THREE.Group();
    group.name = 'academy';
    group.rotation.y = layout.rotation;
    for (const part of ACADEMY_PARTS) {
      const mesh = new THREE.Mesh(parts[part], materials[part]);
      mesh.castShadow = part !== 'glass';
      mesh.receiveShadow = true;
      mesh.name = `academy-${part}`;
      group.add(mesh);
    }
    return { layout, parts, materials, group };
  }, []);

  // Load the texture sets; each surface switches over once all three of its maps are in.
  useEffect(() => {
    const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    const loader = new THREE.TextureLoader();
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const textures: THREE.Texture[] = [];
    let cancelled = false;
    for (const part of TEXTURED) {
      const load = (map: 'diff' | 'nor' | 'arm') =>
        loader.loadAsync(`${base}textures/academy/${part}-${map}.jpg`).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = anisotropy;
          t.colorSpace = map === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          textures.push(t);
          return t;
        });
      Promise.all([load('diff'), load('nor'), load('arm')])
        .then(([diff, nor, arm]) => {
          if (cancelled) return;
          const m = built.materials[part];
          m.color.setScalar(part === 'trim' ? ACADEMY.trimBrightness : 1);
          m.map = diff;
          m.normalMap = nor;
          m.aoMap = arm;
          m.roughnessMap = arm;
          m.metalnessMap = arm;
          m.roughness = 1;
          m.metalness = 1;
          m.needsUpdate = true;
        })
        .catch((err: unknown) => console.warn(`Academy: textures for "${part}" could not be loaded, keeping the plain colour`, err));
    }
    return () => {
      cancelled = true;
      textures.forEach((t) => t.dispose());
    };
  }, [built, gl]);

  useEffect(
    () => () => {
      for (const part of ACADEMY_PARTS) {
        built.parts[part].dispose();
        built.materials[part].dispose();
      }
    },
    [built],
  );

  useFrame(() => {
    const { layout, group, materials } = built;
    group.position.set(layout.x - origin.x, layout.y, layout.z - origin.z);
    // Lit windows from dusk, like the lamps.
    materials.glass.emissiveIntensity = 1.6 * smooth(ACADEMY.glowFrom, ACADEMY.glowFull, lightDirections.sun.value.y);
  });

  return <primitive object={built.group} />;
}
