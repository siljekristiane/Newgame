import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../avatar/appearance';
import { defaultSave, parseSave } from './storage';

describe('parseSave', () => {
  it('returns the defaults for nothing or junk', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('hello')).toEqual(defaultSave());
    expect(parseSave({ progress: 5, appearance: [] }).appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid data and cleans the rest', () => {
    const s = parseSave({
      version: 1,
      starterChosen: true,
      appearance: { skin: '#7a4a2b', eyes: 'blue', hairStyle: 'mohawk', hairColor: '#c96b8a', outfit: { top: { id: 'top_gold_vest' } } },
      progress: { coins: -4, owned: ['top_gold_vest', 'top_gold_vest', 'gone_item', 7], completedQuests: ['forest_path'] },
    });
    expect(s.starterChosen).toBe(true);
    expect(s.appearance.skin).toBe('#7a4a2b');
    expect(s.appearance.eyes).toBe(DEFAULT_APPEARANCE.eyes);
    expect(s.appearance.hairStyle).toBe(DEFAULT_APPEARANCE.hairStyle);
    expect(s.appearance.outfit.top?.id).toBe('top_gold_vest');
    expect(s.appearance.outfit.bottom?.id).toBe('bottom_travel_pants');
    expect(s.progress.coins).toBe(defaultSave().progress.coins);
    expect(s.progress.owned).toEqual(['top_gold_vest']);
    expect(s.progress.completedQuests).toEqual(['forest_path']);
  });
});
