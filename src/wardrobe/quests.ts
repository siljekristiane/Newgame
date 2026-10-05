/**
 * Quests that clothing can be locked behind. There is no quest system yet:
 * these are the names the wardrobe shows ("Fullfør «…»"). When a quest is
 * finished later, call `useWardrobeStore.getState().completeQuest(id)` and every
 * item locked behind that id opens up.
 *
 * To lock an item behind a new quest: add the quest here and point the item's
 * `unlock.questId` at it in catalog.ts.
 */
export const QUESTS: Readonly<Record<string, { name: string; rewardCoins?: number }>> = {
  fountain_crystal: { name: 'Krystallen i fontenen', rewardCoins: 60 },
  forest_path: { name: 'Stien inn i skogen', rewardCoins: 40 },
};

export function questName(id: string): string {
  return QUESTS[id]?.name ?? id;
}
