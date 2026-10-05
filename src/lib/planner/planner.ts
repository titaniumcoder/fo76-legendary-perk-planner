import {
  MAX_LEVEL,
  MAX_RANK,
  RANK_UP_COSTS,
  SLOT_MILESTONES,
  DEFAULT_ASSUMPTIONS,
  incomeForLevel,
  slotsUnlockedAtLevel,
  type PlannerAssumptions,
} from './rules';
import { LEGENDARY_PERKS, PERK_BY_ID } from '../data/legendaryPerks';

export interface PlannerCard {
  id: string;
  /** current rank 1-4 */
  rank: number;
}

export interface PlannerInput {
  level: number;
  /** account-wide unlocked legendary slots 0-6 */
  slotsUnlocked: number;
  coinsOwned: number;
  /** priority order = array order */
  cards: PlannerCard[];
  assumptions: PlannerAssumptions;
  /** remembered ranks for cards not currently in the list (rank memory) */
  rememberedRanks?: Record<string, number>;
}

export interface SpendEvent {
  cardId: string;
  cardName: string;
  fromRank: number;
  toRank: number;
  cost: number;
  coinsAfter: number;
}

export interface PlanEvent extends SpendEvent {
  level: number;
}

export interface CardPlan {
  cardId: string;
  cardName: string;
  /** first level the card is equipped (null if never within horizon) */
  activateAtLevel: number | null;
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
  allDone: boolean;
  /** effective slots available at the current level */
  availableSlotsNow: number;
  /** upcoming slot unlock, if more slots remain */
  nextSlotUnlock: { level: number; slotIndex: number } | null;
  /** true if the simulation had to stop early (zero income assumptions) */
  stalled: boolean;
}

export type { PlannerAssumptions };
export { DEFAULT_ASSUMPTIONS };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sanitize(input: PlannerInput): Required<PlannerInput> {
  const seen = new Set<string>();
  const cards: PlannerCard[] = [];
  for (const c of input.cards) {
    if (!PERK_BY_ID.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push({ id: c.id, rank: clamp(Math.floor(c.rank) || 1, 1, MAX_RANK) });
  }
  const remembered: Record<string, number> = {};
  for (const [id, rank] of Object.entries(input.rememberedRanks ?? {})) {
    if (PERK_BY_ID.has(id) && !seen.has(id)) remembered[id] = clamp(Math.floor(rank) || 1, 1, MAX_RANK);
  }
  return {
    level: clamp(Math.floor(input.level) || 1, 1, MAX_LEVEL),
    slotsUnlocked: clamp(Math.floor(input.slotsUnlocked) || 0, 0, 6),
    coinsOwned: Math.max(0, Math.floor(input.coinsOwned) || 0),
    cards,
    rememberedRanks: remembered,
    assumptions: {
      coinsPerPick: Math.max(0, input.assumptions?.coinsPerPick ?? DEFAULT_ASSUMPTIONS.coinsPerPick),
      coinsPerPack: Math.max(0, input.assumptions?.coinsPerPack ?? DEFAULT_ASSUMPTIONS.coinsPerPack),
      level50Bonus: Math.max(0, input.assumptions?.level50Bonus ?? DEFAULT_ASSUMPTIONS.level50Bonus),
    },
  };
}

/**
 * Cards equipped in slots at a given moment: walk the priority order, a card fits
 * while free slots remain; a maxed card is swapped out (its rank is remembered),
 * freeing the slot for the next card.
 */
export function equippedCardIds(order: string[], ranks: Record<string, number>, slots: number): string[] {
  const equipped: string[] = [];
  let freed = 0;
  for (let k = 0; k < order.length; k++) {
    if (k - freed >= slots) break;
    equipped.push(order[k]);
    if ((ranks[order[k]] ?? 1) >= MAX_RANK) freed++;
  }
  return equipped;
}

/**
 * Greedy spending at one level:
 * Phase A — every equipped stat-boost card still at 1★ gets its first-up (50 coins),
 *           in priority order, before anything is finished.
 * Phase B — strict queue: cards are taken to 4★ one after another in priority order;
 *           an unaffordable step blocks all later cards.
 */
export function spendAtLevel(
  coins: number,
  cards: PlannerCard[],
): { coins: number; ranks: Record<string, number>; events: SpendEvent[] } {
  const ranks = new Map(cards.map((c) => [c.id, c.rank]));
  const events: SpendEvent[] = [];

  for (const c of cards) {
    if (ranks.get(c.id) !== 1) continue;
    if (!PERK_BY_ID.get(c.id)?.statBoost) continue;
    const cost = RANK_UP_COSTS[0];
    if (coins < cost) continue;
    coins -= cost;
    ranks.set(c.id, 2);
    events.push({ cardId: c.id, cardName: PERK_BY_ID.get(c.id)!.name, fromRank: 1, toRank: 2, cost, coinsAfter: coins });
  }

  queue: for (const c of cards) {
    let rank = ranks.get(c.id)!;
    while (rank < MAX_RANK) {
      const cost = RANK_UP_COSTS[rank - 1];
      if (coins < cost) break queue;
      coins -= cost;
      events.push({
        cardId: c.id,
        cardName: PERK_BY_ID.get(c.id)!.name,
        fromRank: rank,
        toRank: rank + 1,
        cost,
        coinsAfter: coins,
      });
      rank++;
      ranks.set(c.id, rank);
    }
  }

  return { coins, ranks: Object.fromEntries(ranks), events };
}

export function computePlan(raw: PlannerInput): PlanResult {
  const input = sanitize(raw);
  const { level, assumptions, cards } = input;
  const order = cards.map((c) => c.id);
  const ranks: Record<string, number> = Object.fromEntries(cards.map((c) => [c.id, c.rank]));

  const slotsAt = (n: number) => Math.max(input.slotsUnlocked, slotsUnlockedAtLevel(n));

  const events: PlanEvent[] = [];
  let coins = input.coinsOwned;
  let coinsEarnedTotal = 0;
  let totalCoinsNeeded = 0;
  const firstEquipped = new Map<string, number>();

  const doLevel = (n: number) => {
    for (;;) {
      const equipped = equippedCardIds(order, ranks, slotsAt(n));
      for (const id of equipped) if (!firstEquipped.has(id)) firstEquipped.set(id, n);
      const res = spendAtLevel(coins, equipped.map((id) => ({ id, rank: ranks[id] })));
      if (res.events.length === 0) break;
      coins = res.coins;
      for (const ev of res.events) {
        totalCoinsNeeded += ev.cost;
        events.push({ ...ev, level: n });
      }
      for (const [id, rank] of Object.entries(res.ranks)) ranks[id] = rank;
    }
  };

  doLevel(level);

  const allMaxed = () => order.length > 0 && order.every((id) => ranks[id] >= MAX_RANK);

  let finishedAtLevel: number | null = allMaxed() ? level : null;
  let stalled = false;

  if (finishedAtLevel === null) {
    let stagnant = 0;
    for (let n = level + 1; n <= MAX_LEVEL; n++) {
      const income = incomeForLevel(n, assumptions, level);
      if (income === 0) {
        stagnant++;
        if (stagnant > 1000) {
          stalled = true;
          break;
        }
      } else {
        stagnant = 0;
        coinsEarnedTotal += income;
        coins += income;
      }

      doLevel(n);

      if (allMaxed()) {
        finishedAtLevel = n;
        break;
      }
    }
  }

  const cardPlans: CardPlan[] = cards.map((c) => {
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
      activateAtLevel: firstEquipped.get(c.id) ?? null,
      finishAtLevel: finish,
      nextStep,
    };
  });

  const availableSlotsNow = slotsAt(level);
  const nextSlotUnlock =
    availableSlotsNow < 6 ? { level: SLOT_MILESTONES[availableSlotsNow], slotIndex: availableSlotsNow + 1 } : null;

  return {
    events,
    cardPlans,
    finishedAtLevel,
    totalCoinsNeeded,
    coinsEarnedTotal,
    allDone: finishedAtLevel !== null,
    availableSlotsNow,
    nextSlotUnlock,
    stalled,
  };
}

/**
 * Full-pool projection: every legendary perk usable by the chosen faction
 * (selected cards keep their priority + ranks, the rest follow in data order)
 * leveled to 4★ with the same planner.
 */
export function fullPoolProjection(
  input: PlannerInput,
  faction: 'human' | 'ghoul',
): { finishedAtLevel: number | null; totalCoinsNeeded: number } {
  const input0 = sanitize(input);
  const selectedIds = new Set(input0.cards.map((c) => c.id));
  const pool = LEGENDARY_PERKS.filter((p) => (faction === 'human' ? !p.ghoulOnly : !p.humanOnly));
  const rest = pool
    .filter((p) => !selectedIds.has(p.id))
    .map((p) => ({ id: p.id, rank: input0.rememberedRanks[p.id] ?? 1 }));
  const plan = computePlan({ ...input, cards: [...input0.cards, ...rest] });
  return { finishedAtLevel: plan.finishedAtLevel, totalCoinsNeeded: plan.totalCoinsNeeded };
}
