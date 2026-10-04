import { COIN_CAP, DEFAULT_ASSUMPTIONS, MAX_LEVEL, MAX_RANK, RANK_UP_COSTS, incomeForLevel, slotsUnlockedAtLevel, type PlannerAssumptions } from '../planner/rules';
import { equippedCardIds, type PlannerCard } from '../planner/planner';
import { PERK_BY_ID } from '../data/legendaryPerks';
import { clampRank, decodeState, encodeState, type AppState, type Faction, type Mode } from '../utils/codec';

const DEBOUNCE_MS = 200;

function normalize(s: AppState): AppState {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of s.order) {
    if (!PERK_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const ranks: Record<string, number> = {};
  for (const [id, rank] of Object.entries(s.ranks)) {
    if (PERK_BY_ID.has(id)) ranks[id] = clampRank(rank);
  }
  return { ...s, order, ranks };
}

function initialState(): AppState {
  const fromUrl = typeof location !== 'undefined' ? decodeState(location.hash) : null;
  if (fromUrl) return normalize(fromUrl);
  return {
    level: 1,
    slots: 6,
    coins: 0,
    order: [],
    ranks: {},
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    faction: 'human',
    mode: 'setup',
  };
}

class UrlState {
  level = $state(1);
  slots = $state(6);
  coins = $state(0);
  order = $state<string[]>([]);
  ranks = $state<Record<string, number>>({});
  assumptions = $state<PlannerAssumptions>({ ...DEFAULT_ASSUMPTIONS });
  faction = $state<Faction>('human');
  mode = $state<Mode>('setup');

  #timer: ReturnType<typeof setTimeout> | undefined;
  #lastWritten = '';
  #adopting = false;

  constructor() {
    const s = initialState();
    this.level = s.level;
    this.slots = s.slots;
    this.coins = s.coins;
    this.order = s.order;
    this.ranks = s.ranks;
    this.assumptions = s.assumptions;
    this.faction = s.faction;
    this.mode = s.mode;

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => this.#adoptFromUrl());
    }
  }

  /** adopt state coming from the URL (back button, pasted link in same tab) */
  #adoptFromUrl() {
    const s = typeof location !== 'undefined' ? decodeState(location.hash) : null;
    if (!s) return;
    const encoded = encodeState(s);
    if (encoded === this.#lastWritten) return;
    this.#adopting = true;
    const n = normalize(s);
    this.level = n.level;
    this.slots = n.slots;
    this.coins = n.coins;
    this.order = n.order;
    this.ranks = n.ranks;
    this.assumptions = n.assumptions;
    this.faction = n.faction;
    this.mode = n.mode;
    this.#adopting = false;
  }

  /** write current state into the URL (debounced, replaceState — no history spam) */
  syncToUrl() {
    if (this.#adopting || typeof history === 'undefined') return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      const hash = `#s=${encodeState(this.snapshot())}`;
      if (hash === this.#lastWritten) return;
      this.#lastWritten = hash;
      history.replaceState(null, '', hash);
    }, DEBOUNCE_MS);
  }

  snapshot(): AppState {
    return {
      level: this.level,
      slots: this.slots,
      coins: this.coins,
      order: [...this.order],
      ranks: { ...this.ranks },
      assumptions: { ...this.assumptions },
      faction: this.faction,
      mode: this.mode,
    };
  }

  plannerCards(): PlannerCard[] {
    return this.order.map((id) => ({ id, rank: this.ranks[id] ?? 1 }));
  }

  rankOf(id: string): number {
    return this.ranks[id] ?? 1;
  }

  /** one level: gain coin income only — spending is a human decision in REGULAR mode */
  levelUp() {
    if (this.level >= MAX_LEVEL) return;
    const next = this.level + 1;
    this.coins = Math.min(COIN_CAP, this.coins + incomeForLevel(next, this.assumptions, this.level));
    this.level = next;
  }

  /** card is equipped in an available slot at the current level/slots */
  isEquipped(id: string): boolean {
    const slotsNow = Math.max(this.slots, slotsUnlockedAtLevel(this.level));
    return equippedCardIds(this.order, this.ranks, slotsNow).includes(id);
  }

  /** REGULAR mode: next rank-up is affordable and the card is currently equipped */
  canBuy(id: string): boolean {
    const rank = this.rankOf(id);
    if (!this.order.includes(id) || rank >= MAX_RANK) return false;
    if (!this.isEquipped(id)) return false;
    return this.coins >= RANK_UP_COSTS[rank - 1];
  }

  nextRankCost(id: string): number | null {
    const rank = this.rankOf(id);
    return rank >= MAX_RANK ? null : RANK_UP_COSTS[rank - 1];
  }

  /** REGULAR mode: spend the coins for the next rank-up */
  buy(id: string) {
    if (!this.canBuy(id)) return;
    const cost = RANK_UP_COSTS[(this.rankOf(id)) - 1];
    this.coins -= cost;
    this.setRank(id, this.rankOf(id) + 1);
  }

  setMode(mode: Mode) {
    this.mode = mode;
  }

  toggleCard(id: string) {
    if (this.order.includes(id)) {
      this.removeCard(id);
    } else if (this.order.length < 6) {
      this.order = [...this.order, id];
      if (!(id in this.ranks)) this.ranks = { ...this.ranks, [id]: 1 };
    }
  }

  /** remove from priority list but keep the remembered rank */
  removeCard(id: string) {
    this.order = this.order.filter((c) => c !== id);
  }

  setRank(id: string, rank: number) {
    this.ranks = { ...this.ranks, [id]: clampRank(rank) };
  }  swap(i: number, j: number) {
    if (i === j || i < 0 || j < 0 || i >= this.order.length || j >= this.order.length) return;
    const arr = [...this.order];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.order = arr;
  }

  moveTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= this.order.length || to > this.order.length) return;
    const arr = [...this.order];
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    this.order = arr;
  }

  /** clears the plan but keeps level, slots and faction */
  reset() {
    this.order = [];
    this.ranks = {};
    this.coins = 0;
  }

  currentUrl(): string {
    return `${location.origin}${location.pathname}#s=${encodeState(this.snapshot())}`;
  }
}

export const urlState = new UrlState();
