import { DEFAULT_ASSUMPTIONS, MAX_LEVEL, MAX_RANK, RANK_UP_COSTS, incomeForLevel, slotsUnlockedAtLevel, type PlannerAssumptions } from '../planner/rules';
import { equippedCardIds, type PlanEvent, type PlannerCard } from '../planner/planner';
import { PERK_BY_ID } from '../data/legendaryPerks';
import { clampRank, decodeState, encodeState, type AppState, type Faction, type Mode } from '../utils/codec';

const DEBOUNCE_MS = 200;

/** sessionStorage key of the session-only undo/redo log (never in the URL). */
const HISTORY_KEY = 'fo76-perk-history';
const HISTORY_LIMIT = 50;

/** One recorded step in the session action log (undo/redo). */
interface SessionAction {
  kind: 'apply-plan';
  label: string;
  before: AppState;
  after: AppState;
}

function isSessionAction(v: unknown): v is SessionAction {
  if (!v || typeof v !== 'object') return false;
  const a = v as Partial<SessionAction>;
  const snapshotOk = (s: unknown) => !!s && typeof s === 'object' && typeof (s as AppState).level === 'number';
  return a.kind === 'apply-plan' && typeof a.label === 'string' && snapshotOk(a.before) && snapshotOk(a.after);
}

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

export class UrlState {
  level = $state(1);
  slots = $state(6);
  coins = $state(0);
  order = $state<string[]>([]);
  ranks = $state<Record<string, number>>({});
  assumptions = $state<PlannerAssumptions>({ ...DEFAULT_ASSUMPTIONS });
  faction = $state<Faction>('human');
  mode = $state<Mode>('setup');

  #undoStack: SessionAction[] = [];
  #redoStack: SessionAction[] = [];
  undoDepth = $state(0);
  redoDepth = $state(0);

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
    this.#loadHistory();

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => this.#adoptFromUrl());
    }
  }

  get canUndo(): boolean {
    return this.undoDepth > 0;
  }

  get canRedo(): boolean {
    return this.redoDepth > 0;
  }

  nextUndoLabel(): string | undefined {
    return this.#undoStack.at(-1)?.label;
  }

  nextRedoLabel(): string | undefined {
    return this.#redoStack.at(-1)?.label;
  }

  #syncDepths() {
    this.undoDepth = this.#undoStack.length;
    this.redoDepth = this.#redoStack.length;
  }

  /** record a mutating action with before/after snapshots (session-only log) */
  #record(label: string, mutate: () => void) {
    const before = this.snapshot();
    mutate();
    this.#undoStack.push({ kind: 'apply-plan', label, before, after: this.snapshot() });
    if (this.#undoStack.length > HISTORY_LIMIT) this.#undoStack.shift();
    this.#redoStack = [];
    this.#syncDepths();
    this.#persistHistory();
  }

  /** reverse the newest recorded action */
  undo() {
    const action = this.#undoStack.pop();
    if (!action) return;
    this.#redoStack.push(action);
    this.#adopt(action.before);
    this.#syncDepths();
    this.#persistHistory();
  }

  /** re-apply the newest undone action */
  redo() {
    const action = this.#redoStack.pop();
    if (!action) return;
    this.#undoStack.push(action);
    this.#adopt(action.after);
    this.#syncDepths();
    this.#persistHistory();
  }

  /** adopt a full snapshot (undo/redo restore) */
  #adopt(s: AppState) {
    this.level = s.level;
    this.slots = s.slots;
    this.coins = s.coins;
    this.order = [...s.order];
    this.ranks = { ...s.ranks };
    this.assumptions = { ...s.assumptions };
    this.faction = s.faction;
    this.mode = s.mode;
  }

  #persistHistory() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify({ undo: this.#undoStack, redo: this.#redoStack }));
    } catch {
      return;
    }
  }

  #loadHistory() {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const { undo, redo } = parsed as { undo?: unknown; redo?: unknown };
      this.#undoStack = Array.isArray(undo) ? undo.filter(isSessionAction) : [];
      this.#redoStack = Array.isArray(redo) ? redo.filter(isSessionAction) : [];
      this.#syncDepths();
    } catch {
      return;
    }
  }

  /** adopt state coming from the URL (back button, pasted link in same tab) */
  #adoptFromUrl() {
    const s = typeof location !== 'undefined' ? decodeState(location.hash) : null;
    if (!s) return;
    const encoded = encodeState(s);
    if (encoded === this.#lastWritten) return;
    this.#adopting = true;
    this.#adopt(normalize(s));
    this.#adopting = false;
    this.#lastWritten = encoded;
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

  /**
   * Assume the plan happened: apply the rank-ups up to events[index], jump the
   * character level there and set coins to what remains after the level-ups.
   * Income is credited level by level and each spend happens at the level the
   * plan schedules it, so every earned coin is kept and coins never go negative.
   */
  applyPlanUpTo(events: PlanEvent[], index: number) {
    const last = events[index];
    if (!last) return;
    this.#record(`${last.cardName} → ${last.toRank}★ @ LVL ${last.level}`, () => {
      const from = this.level;
      const target = Math.max(from, last.level);
      let coins = this.coins;
      let k = 0;
      const applyEvent = (ev: PlanEvent) => {
        coins = Math.max(0, coins - ev.cost);
        this.ranks = { ...this.ranks, [ev.cardId]: clampRank(ev.toRank) };
      };
      while (k <= index && events[k].level <= from) applyEvent(events[k++]);
      for (let n = from + 1; n <= target; n++) {
        coins += incomeForLevel(n, this.assumptions, from);
        while (k <= index && events[k].level === n) applyEvent(events[k++]);
      }
      this.coins = coins;
      this.level = target;
      const auto = slotsUnlockedAtLevel(this.level);
      if (this.slots < auto) this.slots = auto;
    });
  }

  /** one level: gain coin income only — spending is a human decision in REGULAR mode */
  levelUp() {
    if (this.level >= MAX_LEVEL) return;
    const next = this.level + 1;
    this.coins += incomeForLevel(next, this.assumptions, this.level);
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
  }

  swap(i: number, j: number) {
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

  /** clears the plan but keeps level, slots and faction. Unlike regular edits
   *  (replaceState), reset pushes a fresh history entry so Back restores the
   *  pre-reset plan. */
  reset() {
    this.#undoStack = [];
    this.#redoStack = [];
    this.#syncDepths();
    this.#persistHistory();
    this.order = [];
    this.ranks = {};
    this.coins = 0;
    clearTimeout(this.#timer);
    if (typeof history === 'undefined') return;
    const hash = `#s=${encodeState(this.snapshot())}`;
    this.#lastWritten = hash;
    history.pushState(null, '', hash);
  }

  currentUrl(): string {
    return `${location.origin}${location.pathname}#s=${encodeState(this.snapshot())}`;
  }
}

export const urlState = new UrlState();
