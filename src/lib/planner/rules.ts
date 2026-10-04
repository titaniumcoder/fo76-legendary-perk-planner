/** Character level milestones that unlock the 6 legendary perk slots (account-wide). */
export const SLOT_MILESTONES = [50, 75, 100, 150, 200, 300] as const;

/** Perk coins to go from rank r to r+1. Index 0 = 1★→2★. Total 300 per card. */
export const RANK_UP_COSTS = [50, 100, 150] as const;

/** Max legendary perk rank (stars). */
export const MAX_RANK = 4;

/** Coins received for scrapping a perk card of rank r: 2 × rank (rank-1 cards assumed in sim). */
export const COINS_PER_CARD_RANK = 2;

/** Coins per level: 1 perk card pick scrapped. */
export const COINS_PER_PICK = COINS_PER_CARD_RANK * 1;

/** Early perk card pack levels, then every PACK_CADENCE-th level. */
export const EARLY_PACK_LEVELS = [4, 6, 8, 10] as const;
export const PACK_CADENCE = 5;
/** First "every 5th level" pack after the early ones. */
export const REGULAR_PACK_START = 15;

/** Cards per perk pack (3 random + 1 animated foil; foil scrappability undocumented → tweakable). */
export const CARDS_PER_PACK = 4;

/** Coins per perk pack = cards × 2 (scrapped, rank 1). */
export const COINS_PER_PACK = CARDS_PER_PACK * COINS_PER_CARD_RANK;

/** One-time "Become Legendary" challenge reward at level 50. */
export const LEVEL_50_BONUS = 50;

/** Perk coin stockpile cap. */
export const COIN_CAP = 5000;

/** The game's hard level cap. */
export const MAX_LEVEL = 32767;

/** Minimum level a character starts at. */
export const MIN_LEVEL = 1;

/** First level that receives a perk pick (perk system unlocks at level 2). */
export const FIRST_PICK_LEVEL = 2;

export interface PlannerAssumptions {
  coinsPerPick: number;
  coinsPerPack: number;
  level50Bonus: number;
}

export const DEFAULT_ASSUMPTIONS: PlannerAssumptions = {
  coinsPerPick: COINS_PER_PICK,
  coinsPerPack: COINS_PER_PACK,
  level50Bonus: LEVEL_50_BONUS,
};

export function packLevelsSet(): Set<number> {
  const s = new Set<number>(EARLY_PACK_LEVELS);
  for (let n = REGULAR_PACK_START; n <= MAX_LEVEL; n += PACK_CADENCE) s.add(n);
  return s;
}

export const PACK_LEVELS = packLevelsSet();

export function slotsUnlockedAtLevel(level: number): number {
  return SLOT_MILESTONES.filter((m) => level >= m).length;
}

/** Coin income gained by reaching level n (startLevel = level before the step). */
export function incomeForLevel(n: number, a: PlannerAssumptions, startLevel: number): number {
  let income = 0;
  if (n >= FIRST_PICK_LEVEL) income += a.coinsPerPick;
  if (PACK_LEVELS.has(n)) income += a.coinsPerPack;
  if (n === 50 && startLevel < 50) income += a.level50Bonus;
  return income;
}
