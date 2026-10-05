import { CATALOG, itemById, REQUIRED_SLOTS, type ClothingItem, type Slot } from './catalog';
import { questName } from './quests';

/** What the wardrobe calls the currency, and what a new player starts with. */
export const COINS = { label: 'mynter', start: 120 } as const;

/** The player's wardrobe progress (saved in the browser, see storage.ts). */
export interface WardrobeProgress {
  coins: number;
  /** Items bought or given (free items and finished quests count without being listed). */
  owned: readonly string[];
  completedQuests: readonly string[];
  /** Testing: everything counts as owned (`?unlockAll` in the address). */
  unlockAll?: boolean;
}

export type ItemState = 'owned' | 'buyable' | 'tooExpensive' | 'locked' | 'hidden';

export interface ItemStatus {
  state: ItemState;
  /** Short Norwegian text for the card: price or what unlocks it. */
  reason: string;
}

export function isOwned(item: ClothingItem, p: WardrobeProgress): boolean {
  if (p.unlockAll || item.unlock.type === 'free' || p.owned.includes(item.id)) return true;
  return item.unlock.type === 'quest' && p.completedQuests.includes(item.unlock.questId);
}

/** The single place that decides how an item shows in the wardrobe. */
export function itemStatus(item: ClothingItem, p: WardrobeProgress): ItemStatus {
  if (isOwned(item, p)) return { state: 'owned', reason: 'Din' };
  const u = item.unlock;
  switch (u.type) {
    case 'free':
      return { state: 'owned', reason: 'Din' };
    case 'coins':
      return p.coins >= u.cost
        ? { state: 'buyable', reason: `${u.cost} ${COINS.label}` }
        : { state: 'tooExpensive', reason: `${u.cost} ${COINS.label}` };
    case 'quest':
      return { state: u.hidden ? 'hidden' : 'locked', reason: `Fullfør «${questName(u.questId)}»` };
    case 'questAndCoins':
      if (!p.completedQuests.includes(u.questId)) return { state: 'locked', reason: `Fullfør «${questName(u.questId)}»` };
      return p.coins >= u.cost
        ? { state: 'buyable', reason: `${u.cost} ${COINS.label}` }
        : { state: 'tooExpensive', reason: `${u.cost} ${COINS.label}` };
  }
}

/** Buys an item: the new progress, or null if it can't be bought now. */
export function buyItem(id: string, p: WardrobeProgress): WardrobeProgress | null {
  const item = itemById(id);
  if (!item || itemStatus(item, p).state !== 'buyable') return null;
  const u = item.unlock;
  const cost = u.type === 'coins' || u.type === 'questAndCoins' ? u.cost : 0;
  return { ...p, coins: p.coins - cost, owned: [...p.owned, id] };
}

/** Gives items without payment (a starter outfit, a reward). */
export function grantItems(ids: readonly string[], p: WardrobeProgress): WardrobeProgress {
  const owned = [...p.owned];
  for (const id of ids) if (itemById(id) && !owned.includes(id)) owned.push(id);
  return { ...p, owned };
}

export function completeQuest(questId: string, rewardCoins: number, p: WardrobeProgress): WardrobeProgress {
  if (p.completedQuests.includes(questId)) return p;
  return { ...p, coins: p.coins + rewardCoins, completedQuests: [...p.completedQuests, questId] };
}

export interface EquippedItem {
  id: string;
  /** One of the item's `colors`, if it has them. */
  color?: string;
}

export type Outfit = Partial<Record<Slot, EquippedItem>>;

/** The free item each required slot falls back to. */
export const FALLBACK: Readonly<Record<'top' | 'bottom' | 'shoes', string>> = {
  top: 'top_travel_tunic',
  bottom: 'bottom_travel_pants',
  shoes: 'shoes_hiking_boots',
};

/**
 * Cleans an outfit: drops unknown items, items in the wrong slot and colours
 * the item doesn't offer, and fills empty required slots with the free fallback.
 */
export function sanitizeOutfit(outfit: Outfit): Outfit {
  const clean: Outfit = {};
  for (const slot of Object.keys(outfit) as Slot[]) {
    const eq = outfit[slot];
    const item = eq && itemById(eq.id);
    if (!eq || !item || item.slot !== slot) continue;
    clean[slot] = eq.color && item.colors?.includes(eq.color) ? { id: eq.id, color: eq.color } : { id: eq.id };
  }
  for (const slot of REQUIRED_SLOTS) {
    if (clean[slot]) continue;
    const coveredByOther = Object.values(clean).some((eq) => eq && itemById(eq.id)?.covers?.includes(slot));
    if (!coveredByOther) clean[slot] = { id: FALLBACK[slot as keyof typeof FALLBACK] };
  }
  return clean;
}

/**
 * Puts an item on (or takes it off with `item` = null, for optional slots).
 * Putting on something a worn item covers takes the covering item off, so a
 * new skirt replaces a dress with the free top.
 */
export function equipInOutfit(outfit: Outfit, slot: Slot, item: ClothingItem | null, color?: string): Outfit {
  const next: Outfit = { ...outfit };
  if (!item) {
    delete next[slot];
    return sanitizeOutfit(next);
  }
  for (const s of Object.keys(next) as Slot[]) {
    const other = itemById(next[s]?.id ?? '');
    if (s !== slot && other?.covers?.includes(slot)) delete next[s];
  }
  next[slot] = color ? { id: item.id, color } : { id: item.id };
  return sanitizeOutfit(next);
}

/** Ids in the outfit the player doesn't own (being tried on). */
export function unownedInOutfit(outfit: Outfit, p: WardrobeProgress): string[] {
  const ids: string[] = [];
  for (const eq of Object.values(outfit)) {
    const item = eq && itemById(eq.id);
    if (item && !isOwned(item, p)) ids.push(item.id);
  }
  return ids;
}

/** The items that are actually drawn: covered slots are skipped. */
export function wornItems(outfit: Outfit): Array<{ item: ClothingItem; color: string }> {
  const items: Array<{ item: ClothingItem; color: string }> = [];
  const covered = new Set<Slot>();
  for (const eq of Object.values(outfit)) {
    const item = eq && itemById(eq.id);
    for (const s of item?.covers ?? []) covered.add(s);
  }
  for (const slot of Object.keys(outfit) as Slot[]) {
    const eq = outfit[slot];
    const item = eq && itemById(eq.id);
    if (!eq || !item || covered.has(slot)) continue;
    items.push({ item, color: eq.color ?? item.params.color });
  }
  return items;
}

export const ALL_ITEM_IDS: readonly string[] = CATALOG.map((i) => i.id);
