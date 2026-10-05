import { sanitizeOutfit } from '../wardrobe/unlocks';
import type { Appearance } from './appearance';

/**
 * The starter looks. A new player picks one once in the wardrobe
 * ("Startfigur") and is given its clothes; after that the look is theirs to change.
 */
export interface Preset {
  id: string;
  name: string;
  mood: string;
  appearance: Appearance;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'starcharter',
    name: 'Stjernekartisten',
    mood: 'Drømmende og klok',
    appearance: {
      body: 'procedural',
      skin: '#ffe0c2',
      eyes: '#7a5ea8',
      hairStyle: 'long',
      hairColor: '#e8e3d9',
      outfit: sanitizeOutfit({
        top: { id: 'top_moon_blouse' },
        outer: { id: 'outer_lavender_coat' },
        bottom: { id: 'bottom_travel_pants' },
        shoes: { id: 'shoes_star_sandals' },
        head: { id: 'head_moon_circlet' },
      }),
    },
  },
  {
    id: 'forestkeeper',
    name: 'Skogvokteren',
    mood: 'Modig og rolig',
    appearance: {
      body: 'procedural',
      skin: '#b0743f',
      eyes: '#5ea87d',
      hairStyle: 'crown',
      hairColor: '#a8672b',
      outfit: sanitizeOutfit({
        top: { id: 'top_travel_tunic' },
        outer: { id: 'outer_forest_cloak' },
        bottom: { id: 'bottom_dusk_trousers' },
        shoes: { id: 'shoes_moss_shoes' },
        head: { id: 'head_leaf_clip' },
      }),
    },
  },
  {
    id: 'moondreamer',
    name: 'Måneskinnsdrømmeren',
    mood: 'Leken og nysgjerrig',
    appearance: {
      body: 'procedural',
      skin: '#f3c99e',
      eyes: '#4a7fae',
      hairStyle: 'ponytail',
      hairColor: '#4a7fae',
      outfit: sanitizeOutfit({
        top: { id: 'top_moon_blouse' },
        bottom: { id: 'bottom_flow_skirt' },
        shoes: { id: 'shoes_tall_boots' },
        neck: { id: 'neck_star_pin' },
      }),
    },
  },
  {
    id: 'duskadventurer',
    name: 'Skumringseventyreren',
    mood: 'Sprudlende og tøff',
    appearance: {
      body: 'procedural',
      skin: '#7a4a2b',
      eyes: '#c9a13b',
      hairStyle: 'bob',
      hairColor: '#c96b8a',
      outfit: sanitizeOutfit({
        top: { id: 'top_gold_vest' },
        bottom: { id: 'bottom_dusk_trousers' },
        shoes: { id: 'shoes_hiking_boots' },
        neck: { id: 'neck_mist_scarf' },
      }),
    },
  },
  {
    id: 'elf',
    name: 'Alven',
    mood: 'Varm og nysgjerrig',
    appearance: {
      body: 'elf',
      skin: '#e2b08c',
      eyes: '#5a3a24',
      hairStyle: 'long',
      hairColor: '#24170f',
      outfit: sanitizeOutfit({}),
    },
  },
];

/** Item ids a preset gives when chosen as the starter look. */
export function presetItemIds(preset: Preset): string[] {
  return Object.values(preset.appearance.outfit).flatMap((eq) => (eq ? [eq.id] : []));
}
