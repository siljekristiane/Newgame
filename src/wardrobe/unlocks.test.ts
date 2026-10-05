import { describe, expect, it } from 'vitest';
import { CATALOG, itemById, REQUIRED_SLOTS } from './catalog';
import { QUESTS } from './quests';
import { buyItem, completeQuest, equipInOutfit, grantItems, itemStatus, sanitizeOutfit, unownedInOutfit, wornItems, type WardrobeProgress } from './unlocks';

const fresh = (coins = 100): WardrobeProgress => ({ coins, owned: [], completedQuests: [] });
const item = (id: string) => {
  const i = itemById(id);
  if (!i) throw new Error(`missing ${id}`);
  return i;
};

describe('catalog', () => {
  it('has unique ids, a free item in every required slot, and known quests', () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
    for (const slot of REQUIRED_SLOTS) expect(CATALOG.some((i) => i.slot === slot && i.unlock.type === 'free')).toBe(true);
    for (const i of CATALOG) {
      if (i.unlock.type === 'quest' || i.unlock.type === 'questAndCoins') expect(QUESTS[i.unlock.questId], i.id).toBeDefined();
      if (i.colors) expect(i.colors[0]).toBe(i.params.color);
    }
  });
});

describe('itemStatus', () => {
  it('free items are owned, coin items buyable or too expensive', () => {
    expect(itemStatus(item('top_travel_tunic'), fresh()).state).toBe('owned');
    expect(itemStatus(item('top_moon_blouse'), fresh(100))).toEqual({ state: 'buyable', reason: '55 mynter' });
    expect(itemStatus(item('top_moon_blouse'), fresh(10)).state).toBe('tooExpensive');
  });

  it('quest items are locked (or hidden) until the quest is done', () => {
    expect(itemStatus(item('outer_starchart_coat'), fresh()).state).toBe('locked');
    expect(itemStatus(item('outer_starchart_coat'), fresh()).reason).toContain('Krystallen i fontenen');
    expect(itemStatus(item('neck_starcharter_brooch'), fresh()).state).toBe('hidden');
    const done = completeQuest('fountain_crystal', 60, fresh(0));
    expect(done.coins).toBe(60);
    expect(itemStatus(item('outer_starchart_coat'), done).state).toBe('owned');
    expect(itemStatus(item('neck_starcharter_brooch'), done).state).toBe('owned');
    // Finishing it twice pays once.
    expect(completeQuest('fountain_crystal', 60, done)).toBe(done);
  });

  it('unlockAll owns everything', () => {
    for (const i of CATALOG) expect(itemStatus(i, { ...fresh(0), unlockAll: true }).state).toBe('owned');
  });
});

describe('buying and granting', () => {
  it('buying takes the coins and owns the item once', () => {
    const p = buyItem('top_moon_blouse', fresh(100));
    expect(p).not.toBeNull();
    expect(p!.coins).toBe(45);
    expect(p!.owned).toContain('top_moon_blouse');
    expect(buyItem('top_moon_blouse', p!)).toBeNull();
    expect(buyItem('top_moon_blouse', fresh(10))).toBeNull();
    expect(buyItem('outer_starchart_coat', fresh(999))).toBeNull();
    expect(buyItem('no_such_item', fresh(999))).toBeNull();
  });

  it('granting skips unknown and duplicate ids', () => {
    const p = grantItems(['outer_lavender_coat', 'outer_lavender_coat', 'nope'], fresh());
    expect(p.owned).toEqual(['outer_lavender_coat']);
  });
});

describe('outfits', () => {
  it('fills required slots and drops bad entries', () => {
    const o = sanitizeOutfit({ top: { id: 'shoes_star_sandals' }, head: { id: 'missing' }, neck: { id: 'neck_mist_scarf', color: '#000000' } });
    expect(o.top?.id).toBe('top_travel_tunic');
    expect(o.bottom?.id).toBe('bottom_travel_pants');
    expect(o.shoes?.id).toBe('shoes_hiking_boots');
    expect(o.head).toBeUndefined();
    expect(o.neck).toEqual({ id: 'neck_mist_scarf' });
  });

  it('a dress covers the bottom, and a new bottom takes the dress off', () => {
    const withDress = equipInOutfit(sanitizeOutfit({}), 'top', item('top_nightsky_dress'));
    expect(wornItems(withDress).map((w) => w.item.slot)).not.toContain('bottom');
    const withSkirt = equipInOutfit(withDress, 'bottom', item('bottom_flow_skirt'), '#d98fa3');
    expect(withSkirt.top?.id).toBe('top_travel_tunic');
    expect(withSkirt.bottom).toEqual({ id: 'bottom_flow_skirt', color: '#d98fa3' });
  });

  it('optional slots can be emptied, required ones fall back', () => {
    const o = equipInOutfit(sanitizeOutfit({ head: { id: 'head_leaf_clip' } }), 'head', null);
    expect(o.head).toBeUndefined();
    expect(equipInOutfit(o, 'shoes', null).shoes?.id).toBe('shoes_hiking_boots');
  });

  it('lists the items being tried on', () => {
    const o = equipInOutfit(sanitizeOutfit({}), 'outer', item('outer_lavender_coat'));
    expect(unownedInOutfit(o, fresh())).toEqual(['outer_lavender_coat']);
    expect(unownedInOutfit(o, grantItems(['outer_lavender_coat'], fresh()))).toEqual([]);
  });
});
