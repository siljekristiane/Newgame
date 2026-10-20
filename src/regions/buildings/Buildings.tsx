import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, TERRAIN_SHADOW } from '../../config/world';
import { academyPalette } from '../../design/tokens';
import { addTerrainShadow, lightDirections } from '../../materials/terrainShadow';
import { origin } from '../../state/runtime';
import { horizonAt } from '../../world/horizon';
import { spawnLayout } from '../spawn/layout';
import { createBuildingGeometry } from './buildingKit';
import { BUILDING_PARTS, type BuildingPart } from './kitParts';
import { placedBuildings } from './placements';

/** Texture sets in public/textures/academy (CC0, Poly Haven; see CREDITS.md). */
const TEXTURED: ReadonlyArray<Exclude<BuildingPart, 'glass'>> = ['wall', 'roof', 'trim', 'door'];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The stone buildings round the spawn plaza (regions/buildings). Every
 * building is built once with the kit, turned onto its site, given the
 * terrain horizon at its own foot as vertex attributes (mountain and cloud
 * shadow, as the terrain gets them), and merged with the others: one mesh per
 * surface, five draw calls for the whole campus. The group stands at the
 * plaza centre minus the floating origin.
 *
 * Surfaces start as plain palette colours and take their CC0 texture sets
 * once loaded; windows glow after dark.
 */
export function Buildings() {
  const gl = useThree((s) => s.gl);

  const built = useMemo(() => {
    const { plaza } = spawnLayout();
    const pieces: Record<BuildingPart, THREE.BufferGeometry[]> = { wall: [], roof: [], trim: [], door: [], glass: [] };
    const m = new THREE.Matrix4();
    const bytes = new Uint8Array(TERRAIN_SHADOW.directions);
    for (const b of placedBuildings()) {
      const { parts } = createBuildingGeometry(b.design.spec, BUILDINGS.texScale);
      m.makeRotationY(b.rotation).setPosition(b.x - plaza.x, b.y, b.z - plaza.z);
      horizonAt(b.x, b.z, bytes);
      for (const part of BUILDING_PARTS) {
        const g = parts[part];
        g.applyMatrix4(m);
        const n = g.attributes.position!.count;
        const a = new Uint8Array(n * 4);
        const c = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) {
          a.set(bytes.subarray(0, 4), i * 4);
          c.set(bytes.subarray(4, 8), i * 4);
        }
        g.setAttribute('horizonA', new THREE.BufferAttribute(a, 4, true));
        g.setAttribute('horizonB', new THREE.BufferAttribute(c, 4, true));
        pieces[part].push(g);
      }
    }
    const geometries = {} as Record<BuildingPart, THREE.BufferGeometry>;
    const materials = {} as Record<BuildingPart, THREE.MeshStandardMaterial>;
    const group = new THREE.Group();
    group.name = 'buildings';
    for (const part of BUILDING_PARTS) {
      const merged = mergeGeometries(pieces[part]);
      if (!merged) throw new Error(`buildings: could not merge "${part}"`);
      pieces[part].forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      geometries[part] = merged;
      const glass = part === 'glass';
      const mat = new THREE.MeshStandardMaterial({
        color: academyPalette[part],
        roughness: glass ? 0.12 : 0.9,
        metalness: glass ? 0.4 : 0,
        emissive: glass ? academyPalette.glow : '#000000',
        emissiveIntensity: 0,
      });
      mat.name = `building-${part}`;
      mat.onBeforeCompile = (shader) => addTerrainShadow(shader, 'vertex');
      // Textured and plain variants compile to different programs.
      mat.customProgramCacheKey = () => `dw-building-${mat.map ? 'tex' : 'plain'}`;
      materials[part] = mat;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !glass;
      mesh.receiveShadow = true;
      mesh.name = `buildings-${part}`;
      group.add(mesh);
    }
    return { plaza, geometries, materials, group };
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
          const mat = built.materials[part];
          mat.color.setScalar(part === 'trim' ? BUILDINGS.trimBrightness : 1);
          mat.map = diff;
          mat.normalMap = nor;
          mat.aoMap = arm;
          mat.roughnessMap = arm;
          mat.metalnessMap = arm;
          mat.roughness = 1;
          mat.metalness = 1;
          mat.needsUpdate = true;
        })
        .catch((err: unknown) => console.warn(`Buildings: textures for "${part}" could not be loaded, keeping the plain colour`, err));
    }
    return () => {
      cancelled = true;
      textures.forEach((t) => t.dispose());
    };
  }, [built, gl]);

  useEffect(
    () => () => {
      for (const part of BUILDING_PARTS) {
        built.geometries[part].dispose();
        built.materials[part].dispose();
      }
    },
    [built],
  );

  useFrame(() => {
    const { plaza, group, materials } = built;
    group.position.set(plaza.x - origin.x, 0, plaza.z - origin.z);
    // Lit windows from dusk, like the lamps.
    materials.glass.emissiveIntensity = 1.6 * smooth(BUILDINGS.glowFrom, BUILDINGS.glowFull, lightDirections.sun.value.y);
  });

  return <primitive object={built.group} />;
}
