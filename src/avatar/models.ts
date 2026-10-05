import { IDENTITY_BONE_MAP, type BoneMap } from './humanoid';

/**
 * Every body the avatar can have. `procedural` is the figure built in code
 * (src/avatar/body.ts …), dressed from the wardrobe. The others are rigged
 * .glb models in `public/avatars/`, with their clothes and hair baked in.
 *
 * To add a model: put the .glb in public/avatars/, add an entry here (and a
 * line in CREDITS.md), and give it a starter look in presets.ts if wanted.
 * See docs/avatar-og-klesskap.md.
 */
export type BodyId = 'procedural' | 'elf';

export interface ProceduralBody {
  kind: 'procedural';
  name: string;
}

export interface GlbBody {
  kind: 'glb';
  name: string;
  /** Path under public/ (served from the site root). */
  file: string;
  /** Bone names in the file → the game's humanoid roles. */
  bones: BoneMap;
  /**
   * The angle of the upper arms from straight down in the file's rest pose
   * is measured from the bones; the animator lowers them to this (radians).
   */
  armRest?: number;
  /** Whether the wardrobe's clothes and hair can be put on it (not yet for .glb). */
  dressable: false;
}

export type BodyModel = ProceduralBody | GlbBody;

export const BODY_MODELS: Record<BodyId, BodyModel> = {
  procedural: { kind: 'procedural', name: 'Tegnet figur' },
  elf: {
    kind: 'glb',
    name: 'Alven',
    file: 'avatars/alv.glb',
    bones: IDENTITY_BONE_MAP,
    armRest: 0.12,
    dressable: false,
  },
};

export const BODY_IDS = Object.keys(BODY_MODELS) as BodyId[];

export function isBodyId(v: unknown): v is BodyId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BODY_MODELS, v);
}
