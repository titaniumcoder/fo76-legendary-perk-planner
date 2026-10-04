import {
  COIN_CAP,
  COINS_PER_PICK,
  COINS_PER_PACK,
  LEVEL_50_BONUS,
  MAX_LEVEL,
  MAX_RANK,
  RANK_UP_COSTS,
  SLOT_MILESTONES,
  PACK_LEVELS,
  FIRST_PICK_LEVEL,
  slotsUnlockedAtLevel,
} from './rules';
import { PERK_BY_ID } from '../data/legendaryPerks';

export interface PlannerCard {
  id: string;
  /** current rank 1-4 */
  rank: number;
}

export interface PlannerAssumptions {
  coinsPerPick: number;
  coinsPerPack: number;
  level50Bonus: number;
}

export interface PlannerInput {
  level: number;
  /** account-wide unlocked legendary slots 0-6 */
  slotsUnlocked: number;
  coinsOwned: number;
  /** priority order = array order */
  cards: PlannerCard[];
  assumptions: PlannerAssumptions;
}

export interface PlanEvent {
  level: number;
  cardId: string;
  cardName: string;
  fromRank: number;
  toRank: number;
  cost: number;
  coinsAfter: number;
}

export interface CardPlan {
  cardId: string;
  cardName: string;
  /** level at which the card can first be equipped (current level if a slot is free now) */
  activateAtLevel: number;
  /** level at which the card reaches 4★, or null if never within horizon */
  finishAtLevel: number | null;
  /** first planned upgrade beyond the card's input rank, if any */
  nextStep: { level: number; toRank: number } | null;
}

export interface PlanResult {
  events: PlanEvent[];
  cardPlans: CardPlan[];
  /** level at which all selected cards reach 4★, or null */
  finishedAtLevel: number | null;
  /** sum of all planned upgrade costs */
  totalCoinsNeeded: number;
  /** sum of simulated coin income */
  coinsEarnedTotal: number;
  /** coins lost to the 5000 cap */
  coinsWastedToCap: number;
  allDone: boolean;
  /** effective slots available at the current level */
  availableSlotsNow: number;
  /** upcoming slot unlock, if more slots remain */
  nextSlotUnlock: { level: number; slotIndex: number } | null;
  /** true if the simulation had to stop early (zero income assumptions) */
  stalled: boolean;
}

export const DEFAULT_ASSUMPTIONS: PlannerAssumptions = {
  coinsPerPick: COINS_PER_PICK,
  coinsPerPack: COINS_PER_PACK,
  level50Bonus: LEVEL_50_BONUS,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sanitize(input: PlannerInput): Required<PlannerInput> {
  return {
    level: clamp(Math.floor(input.level) || 1, 1, MAX_LEVEL),
    slotsUnlocked: clamp(Math.floor(input.slotsUnlocked) || 0, 0, 6),
    coinsOwned: clamp(Math.floor(input.coinsOwned) || 0, 0, COIN_CAP),
    cards: input.cards
      .filter((c) => PERK_BY_ID.has(c.id))
      .slice(0, 6)
      .map((c) => ({ id: c.id, rank: clamp(Math.floor(c.rank) || 1, 1, MAX_RANK) })),
    assumptions: {
      coinsPerPick: Math.max(0, input.assumptions?.coinsPerPick ?? DEFAULT_ASSUMPTIONS.coinsPerPick),
      coinsPerPack: Math.max(0, input.assumptions?.coinsPerPack ?? DEFAULT_ASSUMPTIONS.coinsPerPack),
      level50Bonus: Math.max(0, input.assumptions?.level50Bonus ?? DEFAULT_ASSUMPTIONS.level50Bonus),
    },
  };
}

/**
 * Simulate level-by-level coin income and greedy spending.
 *
 * Phase A: every active 1★ card gets its first rank-up (50 coins) before anything else,
 *          in priority order — "spread the first-ups" (even if an earlier card is
 *          temporarily unaffordable, later affordable 1★ cards still get theirs).
 * Phase B: then finish cards to 4★ in priority order.
 */
export function computePlan(raw: PlannerInput): PlanResult {
  const input = sanitize(raw);
  const { level, assumptions } = input;

  const availableSlotsNow = Math.max(input.slotsUnlocked, slotsUnlockedAtLevel(level));

  // card k (priority index) becomes active when a slot is available for it
  const activateAt = (k: number): number | null => {
    if (k >= 6) return null;
    if (k < availableSlotsNow) return level;
    return SLOT_MILESTONES[k];
  };

  const ranks = new Map<string, number>(input.cards.map((c) => [c.id, c.rank]));
  const activeAt = new Map<string, number>();
  input.cards.forEach((c, k) => {
    const at = activateAt(k);
    if (at !== null) activeAt.set(c.id, at);
  });

  const events: PlanEvent[] = [];
  let coins = input.coinsOwned;
  let coinsEarnedTotal = 0;
  let coinsWastedToCap = 0;
  let totalCoinsNeeded = 0;

  const activeCardsAt = (n: number): string[] =>
    input.cards.filter((c) => {
      const at = activeAt.get(c.id);
      return at !== undefined && at <= n;
    }).map((c) => c.id);

  const rankCost = (rank: number): number | null => (rank >= MAX_RANK ? null : RANK_UP_COSTS[rank - 1]);

  /** spend greedily at level n: phase A first-ups, then phase B finishing */
  const spend = (n: number) => {
    // Phase A
    for (const id of activeCardsAt(n)) {
      const rank = ranks.get(id)!;
      if (rank !== 1) continue;
      const cost = rankCost(1)!;
      if (coins >= cost) {
        coins -= cost;
        totalCoinsNeeded += cost;
        events.push({
          level: n,
          cardId: id,
          cardName: PERK_BY_ID.get(id)!.name,
          fromRank: 1,
          toRank: 2,
          cost,
          coinsAfter: coins,
        });
        ranks.set(id, 2);
      }
    }
    // Phase B
    for (const id of activeCardsAt(n)) {
      let rank = ranks.get(id)!;
      while (rank < MAX_RANK) {
        const cost = rankCost(rank)!;
        if (coins < cost) break;
        coins -= cost;
        totalCoinsNeeded += cost;
        events.push({
          level: n,
          cardId: id,
          cardName: PERK_BY_ID.get(id)!.name,
          fromRank: rank,
          toRank: rank + 1,
          cost,
          coinsAfter: coins,
        });
        rank += 1;
        ranks.set(id, rank);
      }
    }
  };

  const allMaxed = () => input.cards.every((c) => (ranks.get(c.id) ?? 1) >= MAX_RANK);

  // spend at the current level with coins on hand
  spend(level);

  let finishedAtLevel: number | null = allMaxed() ? level : null;
  let stalled = false;

  if (finishedAtLevel === null) {
    let stagnant = 0;
    for (let n = level + 1; n <= MAX_LEVEL; n++) {
      let income = 0;
      if (n >= FIRST_PICK_LEVEL) income += assumptions.coinsPerPick;
      if (PACK_LEVELS.has(n)) income += assumptions.coinsPerPack;
      if (n === 50 && level < 50) income += assumptions.level50Bonus;

      if (income === 0) {
        stagnant++;
        if (stagnant > 1000) {
          stalled = true;
          break;
        }
      } else {
        stagnant = 0;
        coinsEarnedTotal += income;
        const overflow = coins + income - COIN_CAP;
        if (overflow > 0) coinsWastedToCap += overflow;
        coins = Math.min(COIN_CAP, coins + income);
      }

      spend(n);

      if (allMaxed()) {
        finishedAtLevel = n;
        break;
      }
    }
  }

  const cardPlans: CardPlan[] = input.cards.map((c) => {
    const at = activeAt.get(c.id);
    let finish: number | null = null;
    for (const e of events) {
      if (e.cardId === c.id && e.toRank === MAX_RANK) finish = e.level;
    }
    let nextStep: CardPlan['nextStep'] = null;
    if (c.rank < MAX_RANK) {
      const ev = events.find((e) => e.cardId === c.id && e.fromRank === c.rank);
      if (ev) nextStep = { level: ev.level, toRank: ev.toRank };
    }
    return {
      cardId: c.id,
      cardName: PERK_BY_ID.get(c.id)!.name,
      activateAtLevel: at ?? MAX_LEVEL,
      finishAtLevel: at === undefined ? null : finish,
      nextStep,
    };
  });

  const nextSlotUnlock =
    availableSlotsNow < 6
      ? { level: SLOT_MILESTONES[availableSlotsNow], slotIndex: availableSlotsNow + 1 }
      : null;

  return {
    events,
    cardPlans,
    finishedAtLevel,
    totalCoinsNeeded,
    coinsEarnedTotal,
    coinsWastedToCap,
    allDone: finishedAtLevel !== null,
    availableSlotsNow,
    nextSlotUnlock,
    stalled,
  };
}
