import { DEFAULT_APPEARANCE, sanitizeAppearance, type Appearance } from '../avatar/appearance';
import { itemById } from './catalog';
import { COINS, type WardrobeProgress } from './unlocks';

/**
 * The avatar's look and the wardrobe progress, kept in this browser.
 * `version` lets a later change migrate old saves instead of losing them:
 * add a step in `parseSave` when the shape changes.
 */
export interface WardrobeSave {
  version: 1;
  appearance: Appearance;
  progress: WardrobeProgress;
  /** The starter look has been chosen (it can only be picked once). */
  starterChosen: boolean;
}

const KEY = 'duskwood.wardrobe.v1';

export function defaultSave(): WardrobeSave {
  return {
    version: 1,
    appearance: DEFAULT_APPEARANCE,
    progress: { coins: COINS.start, owned: [], completedQuests: [] },
    starterChosen: false,
  };
}

/** Reads a save of any age; anything missing or broken falls back to the defaults. */
export function parseSave(raw: unknown): WardrobeSave {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const v = raw as Record<string, unknown>;
  const p = (v.progress && typeof v.progress === 'object' ? v.progress : {}) as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  return {
    version: 1,
    appearance: sanitizeAppearance(v.appearance),
    progress: {
      coins: typeof p.coins === 'number' && Number.isFinite(p.coins) && p.coins >= 0 ? Math.floor(p.coins) : base.progress.coins,
      owned: [...new Set(strings(p.owned).filter((id) => itemById(id)))],
      completedQuests: [...new Set(strings(p.completedQuests))],
    },
    starterChosen: v.starterChosen === true,
  };
}

export function loadSave(): WardrobeSave {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: WardrobeSave): void {
  try {
    // unlockAll is a testing switch from the address bar; never stored.
    const { coins, owned, completedQuests } = save.progress;
    localStorage.setItem(KEY, JSON.stringify({ ...save, progress: { coins, owned, completedQuests } }));
  } catch {
    // No storage (private window, blocked): the look still works for this visit.
  }
}
