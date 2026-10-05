import { sanitizeOutfit, type Outfit } from '../wardrobe/unlocks';
import { isBodyId, type BodyId } from './models';

/**
 * How the avatar looks: body colours, hair and what it wears. Pure data, so
 * it can be saved, compared and handed to buildAvatar.
 */
export type HairStyleId = 'long' | 'bob' | 'ponytail' | 'crown' | 'curly';

export interface Appearance {
  /** Which body (models.ts): the procedural figure, or a rigged .glb model with its own clothes. */
  body: BodyId;
  skin: string;
  eyes: string;
  hairStyle: HairStyleId;
  hairColor: string;
  outfit: Outfit;
}

export const SKIN_TONES: readonly string[] = ['#ffe0c2', '#f3c99e', '#d9a066', '#b0743f', '#7a4a2b', '#4f3020'];
export const HAIR_COLORS: readonly string[] = ['#3a2a20', '#6b4226', '#a8672b', '#d9b45c', '#e8e3d9', '#7a5ea8', '#4a7fae', '#c96b8a'];
export const EYE_COLORS: readonly string[] = ['#4a7fae', '#5ea87d', '#a8672b', '#7a5ea8', '#3a2a20', '#c9a13b'];
export const HAIR_STYLES: ReadonlyArray<{ id: HairStyleId; name: string }> = [
  { id: 'long', name: 'Langt og bølgete' },
  { id: 'bob', name: 'Kort bob' },
  { id: 'ponytail', name: 'Høy hestehale' },
  { id: 'crown', name: 'Flettet krone' },
  { id: 'curly', name: 'Krøllete løs' },
];

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'elf',
  skin: '#f3c99e',
  eyes: '#4a7fae',
  hairStyle: 'long',
  hairColor: '#6b4226',
  outfit: sanitizeOutfit({ head: { id: 'head_leaf_clip' } }),
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Checks loaded data and falls back field by field, so a broken save never breaks the avatar. */
export function sanitizeAppearance(value: unknown): Appearance {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof Appearance, unknown>>;
  const hex = (x: unknown, fallback: string) => (typeof x === 'string' && HEX.test(x) ? x : fallback);
  const style = HAIR_STYLES.some((h) => h.id === v.hairStyle) ? (v.hairStyle as HairStyleId) : DEFAULT_APPEARANCE.hairStyle;
  const outfit = v.outfit && typeof v.outfit === 'object' ? (v.outfit as Outfit) : DEFAULT_APPEARANCE.outfit;
  return {
    // Saves from before bodies existed get the default body.
    body: isBodyId(v.body) ? v.body : DEFAULT_APPEARANCE.body,
    skin: hex(v.skin, DEFAULT_APPEARANCE.skin),
    eyes: hex(v.eyes, DEFAULT_APPEARANCE.eyes),
    hairStyle: style,
    hairColor: hex(v.hairColor, DEFAULT_APPEARANCE.hairColor),
    outfit: sanitizeOutfit(outfit),
  };
}

/** Lighter (f > 0) or darker (f < 0) version of a #rrggbb colour. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    const out = f < 0 ? c * (1 + f) : c + (255 - c) * f;
    return Math.round(Math.min(255, Math.max(0, out)));
  };
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}
