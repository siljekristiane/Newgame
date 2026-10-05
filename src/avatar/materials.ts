import * as THREE from 'three';

/**
 * Avatar materials: PBR like the rest of the world (MeshStandardMaterial), so
 * the avatar takes the same sun, sky light, shadows and tone mapping.
 * Cached by kind + colour and shared between avatars; never disposed with one.
 */
export type MaterialKind =
  | 'skin'
  | 'hair'
  | 'fabric'
  | 'knit'
  | 'silk'
  | 'leather'
  | 'metal'
  | 'gem'
  | 'eyeWhite'
  | 'iris'
  | 'pupil'
  | 'lip'
  | 'leaf';

const SURFACE: Record<MaterialKind, { roughness: number; metalness: number }> = {
  skin: { roughness: 0.62, metalness: 0 },
  hair: { roughness: 0.42, metalness: 0 },
  fabric: { roughness: 0.88, metalness: 0 },
  knit: { roughness: 0.97, metalness: 0 },
  silk: { roughness: 0.5, metalness: 0 },
  leather: { roughness: 0.58, metalness: 0 },
  metal: { roughness: 0.32, metalness: 1 },
  gem: { roughness: 0.15, metalness: 0 },
  eyeWhite: { roughness: 0.3, metalness: 0 },
  iris: { roughness: 0.25, metalness: 0 },
  pupil: { roughness: 0.2, metalness: 0 },
  lip: { roughness: 0.5, metalness: 0 },
  leaf: { roughness: 0.6, metalness: 0 },
};

export interface MaterialOptions {
  /** Glow (stars on the night-sky dress, gems). Colour and strength. */
  glow?: string;
  glowStrength?: number;
  /** Open shells (coats, skirts, cloaks) are seen from inside too. */
  doubleSided?: boolean;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function material(kind: MaterialKind, color: string, opts: MaterialOptions = {}): THREE.MeshStandardMaterial {
  const key = `${kind}|${color}|${opts.glow ?? ''}|${opts.glowStrength ?? ''}|${opts.doubleSided ? 2 : 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      ...SURFACE[kind],
      emissive: opts.glow ?? '#000000',
      emissiveIntensity: opts.glow ? (opts.glowStrength ?? 1) : 0,
      side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    m.name = `avatar-${kind}`;
    cache.set(key, m);
  }
  return m;
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();

/** Unlit bits: the shine in the eyes and the blush on the cheeks. */
export function unlit(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    m.name = 'avatar-unlit';
    basicCache.set(key, m);
  }
  return m;
}
