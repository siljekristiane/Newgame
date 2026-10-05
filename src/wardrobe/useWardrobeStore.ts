import { create } from 'zustand';
import { sanitizeAppearance, type Appearance } from '../avatar/appearance';
import { PRESETS, presetItemIds } from '../avatar/presets';
import { input } from '../state/runtime';
import { QUESTS } from './quests';
import { loadSave, writeSave, type WardrobeSave } from './storage';
import { buyItem, completeQuest, grantItems, unownedInOutfit, type WardrobeProgress } from './unlocks';

/**
 * The avatar's look, the wardrobe progress (coins, owned items, finished
 * quests) and whether the wardrobe is open. Saved in the browser on every change.
 */
interface WardrobeState {
  appearance: Appearance;
  progress: WardrobeProgress;
  starterChosen: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Saves a new look. Items the player doesn't own are refused (returns false). */
  saveAppearance: (appearance: Appearance) => boolean;
  /** Buys an item with coins; false if it can't be bought now. */
  buy: (itemId: string) => boolean;
  /** One time only: gives the preset's clothes and puts the look on. */
  chooseStarter: (presetId: string) => void;
  /** For the coming quest system: opens every item locked behind the quest and pays its reward. */
  completeQuest: (questId: string) => void;
  addCoins: (amount: number) => void;
}

/** `?unlockAll` in the address unlocks every item, for testing clothes without playing. */
const unlockAll = typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockAll');

const initial = loadSave();

function persist(s: Pick<WardrobeState, 'appearance' | 'progress' | 'starterChosen'>): void {
  const save: WardrobeSave = { version: 1, appearance: s.appearance, progress: s.progress, starterChosen: s.starterChosen };
  writeSave(save);
}

export const useWardrobeStore = create<WardrobeState>((set, get) => ({
  appearance: initial.appearance,
  progress: { ...initial.progress, unlockAll },
  starterChosen: initial.starterChosen,
  open: false,
  setOpen: (open) => {
    // Stop walking while the wardrobe is open, and give the mouse back.
    input.keys.clear();
    if (open && typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set({ open });
  },
  toggle: () => get().setOpen(!get().open),
  saveAppearance: (next) => {
    const appearance = sanitizeAppearance(next);
    if (unownedInOutfit(appearance.outfit, get().progress).length) return false;
    set({ appearance });
    persist(get());
    return true;
  },
  buy: (itemId) => {
    const progress = buyItem(itemId, get().progress);
    if (!progress) return false;
    set({ progress });
    persist(get());
    return true;
  },
  chooseStarter: (presetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset || get().starterChosen) return;
    set({ progress: grantItems(presetItemIds(preset), get().progress), appearance: preset.appearance, starterChosen: true });
    persist(get());
  },
  completeQuest: (questId) => {
    set({ progress: completeQuest(questId, QUESTS[questId]?.rewardCoins ?? 0, get().progress) });
    persist(get());
  },
  addCoins: (amount) => {
    const p = get().progress;
    set({ progress: { ...p, coins: Math.max(0, p.coins + Math.round(amount)) } });
    persist(get());
  },
}));
