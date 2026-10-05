/**
 * Every piece of clothing in the wardrobe, as plain data.
 *
 * To add a garment: add one entry here. `pattern` picks the shape builder in
 * src/avatar/clothing.ts and `params` tunes it (colours, length, details), so a
 * new item with an existing pattern needs no new code. `unlock` decides how it
 * is earned (see unlocks.ts): free, for coins, by a quest, or both.
 */

export type Slot = 'top' | 'outer' | 'bottom' | 'shoes' | 'head' | 'neck';

/** Tab order in the wardrobe, with Norwegian labels. */
export const SLOTS: ReadonlyArray<{ id: Slot; label: string }> = [
  { id: 'top', label: 'Topp' },
  { id: 'outer', label: 'Ytterplagg' },
  { id: 'bottom', label: 'Underdel' },
  { id: 'shoes', label: 'Sko' },
  { id: 'head', label: 'Hode' },
  { id: 'neck', label: 'Hals og bryst' },
];

/** These slots always hold something; the others can be left empty. */
export const REQUIRED_SLOTS: readonly Slot[] = ['top', 'bottom', 'shoes'];

export type PatternId =
  | 'tunic'
  | 'blouse'
  | 'shirtVest'
  | 'sweater'
  | 'dress'
  | 'coat'
  | 'cloak'
  | 'pants'
  | 'shorts'
  | 'skirt'
  | 'boots'
  | 'sandals'
  | 'circlet'
  | 'flowerCrown'
  | 'leafClip'
  | 'starPin'
  | 'scarf'
  | 'brooch';

export type Unlock =
  /** Owned from the start. */
  | { type: 'free' }
  /** Bought in the wardrobe. */
  | { type: 'coins'; cost: number }
  /** Given when the quest is completed. `hidden` keeps it out of the wardrobe until then. */
  | { type: 'quest'; questId: string; hidden?: boolean }
  /** Can be bought once the quest is completed. */
  | { type: 'questAndCoins'; questId: string; cost: number };

export type ParamValue = string | number | boolean;

export interface ClothingItem {
  id: string;
  name: string;
  slot: Slot;
  pattern: PatternId;
  /** Shape and colour settings for the pattern. `color` is the main colour. */
  params: Readonly<Record<string, ParamValue>> & { color: string };
  /** Optional colour choices the player can switch between (the first is the default). */
  colors?: readonly string[];
  /** Other slots this item covers (a dress fills `bottom` too). */
  covers?: readonly Slot[];
  unlock: Unlock;
}

export const CATALOG: readonly ClothingItem[] = [
  // ---- Topper ----
  { id: 'top_travel_tunic', name: 'Reisetunika', slot: 'top', pattern: 'tunic', params: { color: '#8fb3c9', belt: '#6b4a2e' }, colors: ['#8fb3c9', '#c9b38f', '#9fb88a'], unlock: { type: 'free' } },
  { id: 'top_moon_blouse', name: 'Måneskinnsbluse', slot: 'top', pattern: 'blouse', params: { color: '#eef0f7', ribbon: '#a89bd9' }, unlock: { type: 'coins', cost: 55 } },
  { id: 'top_gold_vest', name: 'Gyllen vest', slot: 'top', pattern: 'shirtVest', params: { color: '#d9b45c', shirt: '#8fb3c9', buttons: '#f0dcb8' }, unlock: { type: 'coins', cost: 60 } },
  { id: 'top_owl_sweater', name: 'Ugleullgenser', slot: 'top', pattern: 'sweater', params: { color: '#c9a27a' }, colors: ['#c9a27a', '#8a9bb8', '#b88aa0'], unlock: { type: 'coins', cost: 45 } },
  { id: 'top_nightsky_dress', name: 'Nattskykjole', slot: 'top', pattern: 'dress', params: { color: '#3f4a8b', stars: true }, covers: ['bottom'], unlock: { type: 'coins', cost: 80 } },

  // ---- Ytterplagg ----
  { id: 'outer_lavender_coat', name: 'Lavendelkåpe', slot: 'outer', pattern: 'coat', params: { color: '#a89bd9', trim: '#d9b45c', belt: '#7a5ea8' }, colors: ['#a89bd9', '#5e8f6f', '#3f4a6b'], unlock: { type: 'coins', cost: 40 } },
  { id: 'outer_forest_cloak', name: 'Skogkappe', slot: 'outer', pattern: 'cloak', params: { color: '#5e8f6f', hood: '#4d7a5c', clasp: '#d9b45c' }, unlock: { type: 'quest', questId: 'forest_path' } },
  { id: 'outer_starchart_coat', name: 'Stjernekartkåpe', slot: 'outer', pattern: 'coat', params: { color: '#2c3a6b', trim: '#d9b45c', belt: '#1f2a52', stars: true }, unlock: { type: 'quest', questId: 'fountain_crystal' } },

  // ---- Underdeler ----
  { id: 'bottom_travel_pants', name: 'Reisebukser', slot: 'bottom', pattern: 'pants', params: { color: '#6b5b4a' }, unlock: { type: 'free' } },
  { id: 'bottom_flow_skirt', name: 'Flytende skjørt', slot: 'bottom', pattern: 'skirt', params: { color: '#7a5ea8', band: '#5d4590' }, colors: ['#7a5ea8', '#d98fa3', '#4a7fae'], unlock: { type: 'coins', cost: 45 } },
  { id: 'bottom_dusk_trousers', name: 'Skumringsbukser', slot: 'bottom', pattern: 'pants', params: { color: '#3f4a6b' }, unlock: { type: 'coins', cost: 45 } },
  { id: 'bottom_petal_shorts', name: 'Kronbladshorts', slot: 'bottom', pattern: 'shorts', params: { color: '#d98fa3' }, unlock: { type: 'coins', cost: 35 } },

  // ---- Sko ----
  { id: 'shoes_hiking_boots', name: 'Vandrestøvler', slot: 'shoes', pattern: 'boots', params: { color: '#5a4632', height: 0.09, band: '#3d2f22' }, unlock: { type: 'free' } },
  { id: 'shoes_tall_boots', name: 'Høye støvler', slot: 'shoes', pattern: 'boots', params: { color: '#5a4632', height: 0.21, band: '#a89bd9' }, unlock: { type: 'coins', cost: 40 } },
  { id: 'shoes_star_sandals', name: 'Stjernesandaler', slot: 'shoes', pattern: 'sandals', params: { color: '#d9b45c' }, unlock: { type: 'coins', cost: 30 } },
  { id: 'shoes_moss_shoes', name: 'Mosesko', slot: 'shoes', pattern: 'boots', params: { color: '#5e8f6f', height: 0.04, band: '#3f6a4c' }, unlock: { type: 'coins', cost: 30 } },

  // ---- Hode ----
  { id: 'head_leaf_clip', name: 'Bladspenne', slot: 'head', pattern: 'leafClip', params: { color: '#7fc28f', berry: '#d9b45c' }, unlock: { type: 'free' } },
  { id: 'head_flower_crown', name: 'Blomsterkrans', slot: 'head', pattern: 'flowerCrown', params: { color: '#f0b3c8', center: '#f5d83a' }, colors: ['#f0b3c8', '#f5f0e0', '#b8a8f0'], unlock: { type: 'coins', cost: 25 } },
  { id: 'head_moon_circlet', name: 'Månediadem', slot: 'head', pattern: 'circlet', params: { color: '#d9b45c', moon: '#eef0f7' }, unlock: { type: 'coins', cost: 70 } },

  // ---- Hals og bryst ----
  { id: 'neck_star_pin', name: 'Stjernenål', slot: 'neck', pattern: 'starPin', params: { color: '#d9b45c' }, unlock: { type: 'coins', cost: 25 } },
  { id: 'neck_mist_scarf', name: 'Tåkeskjerf', slot: 'neck', pattern: 'scarf', params: { color: '#a89bd9', tail: '#9585c9' }, colors: ['#a89bd9', '#d98fa3', '#8fb3c9'], unlock: { type: 'coins', cost: 35 } },
  { id: 'neck_starcharter_brooch', name: 'Stjernekartists brosje', slot: 'neck', pattern: 'brooch', params: { color: '#d9b45c', gem: '#9fd9e0' }, unlock: { type: 'quest', questId: 'fountain_crystal', hidden: true } },
];

const BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

export function itemById(id: string): ClothingItem | undefined {
  return BY_ID.get(id);
}

export function itemsInSlot(slot: Slot): ClothingItem[] {
  return CATALOG.filter((item) => item.slot === slot);
}
