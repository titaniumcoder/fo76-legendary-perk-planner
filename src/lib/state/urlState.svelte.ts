import { DEFAULT_ASSUMPTIONS, MAX_LEVEL, MAX_RANK, RANK_UP_COSTS, incomeForLevel, slotsUnlockedAtLevel, type PlannerAssumptions } from '../planner/rules';
import { equippedCardIds, type PlanEvent, type PlannerCard } from '../planner/planner';
import { PERK_BY_ID } from '../data/legendaryPerks';
import { clampRank, decodeState, encodeState, type AppState, type Faction, type Mode } from '../utils/codec';
import {
  loadCurrent,
  loadSaves,
  removeSave,
  resolveStartup,
  saveCurrent,
  saveSaves,
  upsertSave,
  type NamedSave,
} from './storage';

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

function defaultState(): AppState {
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

  /** where the active state came from: a shared link or local storage */
  origin = $state<'link' | 'local'>('local');
  /** set at startup when a link and a differing local state both exist */
  pendingConflict = $state<{ link: AppState; local: AppState } | null>(null);

  #undoStack: SessionAction[] = [];
  #redoStack: SessionAction[] = [];
  undoDepth = $state(0);
  redoDepth = $state(0);

  #timer: ReturnType<typeof setTimeout> | undefined;
  /** encoded snapshot as last written to localStorage — skips no-op persists */
  #lastPersisted = '';
  /** true while the active state came from a link; the hash is stripped on the first edit */
  #fromLink = false;
  #adopting = false;

  constructor() {
    const link = typeof location !== 'undefined' ? decodeState(location.hash) : null;
    const local = typeof localStorage !== 'undefined' ? loadCurrent(localStorage) : null;
    const res = resolveStartup({ link: link ? normalize(link) : null, local });
    let s: AppState;
    if (res.action === 'default') {
      s = defaultState();
    } else if (res.action === 'ask') {
      // preview the link state; the modal decides what is kept
      s = res.link;
      this.origin = 'link';
      this.#fromLink = true;
      this.pendingConflict = { link: res.link, local: res.local };
    } else {
      s = res.state;
      this.origin = res.action === 'load-url' ? 'link' : 'local';
      this.#fromLink = res.action === 'load-url';
    }
    this.#adopt(s);
    this.#lastPersisted = encodeState(s);
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
    this.#adopt(normalize(s));
    this.#fromLink = true;
    this.origin = 'link';
    this.#lastPersisted = encodeState(this.snapshot());
  }

  #clearHash() {
    if (typeof history === 'undefined' || typeof location === 'undefined') return;
    history.replaceState(null, '', location.pathname + location.search);
  }

  /** persist edits to localStorage (debounced); strips a link hash on the first edit */
  persist() {
    if (this.#adopting || typeof localStorage === 'undefined') return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (typeof localStorage === 'undefined') return;
      const s = this.snapshot();
      const encoded = encodeState(s);
      if (encoded === this.#lastPersisted) return;
      if (this.#fromLink) {
        this.#fromLink = false;
        this.#clearHash();
      }
      saveCurrent(localStorage, s);
      this.#lastPersisted = encoded;
      this.origin = 'local';
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
    this.#record(`Level → ${next}`, () => {
      this.coins += incomeForLevel(next, this.assumptions, this.level);
      this.level = next;
    });
  }

  /** one level down: correction for a misclick — takes back the income that
   *  entering this level granted (clamped at 0 coins) */
  levelDown() {
    if (this.level <= 1) return;
    const prev = this.level - 1;
    this.#record(`Level → ${prev}`, () => {
      this.coins = Math.max(0, this.coins - incomeForLevel(this.level, this.assumptions, prev));
      this.level = prev;
    });
  }

  /** hand-entered level (committed on blur), clamped to 1..MAX_LEVEL */
  setLevel(level: number) {
    const n = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));
    if (n === this.level) return;
    this.#record(`Level → ${n}`, () => {
      this.level = n;
    });
  }

  /** hand-entered coins (committed on blur), clamped at 0 */
  setCoins(coins: number) {
    const n = Math.max(0, Math.floor(coins) || 0);
    if (n === this.coins) return;
    this.#record(`Coins → ${n}`, () => {
      this.coins = n;
    });
  }

  /** typical scoreboard/challenge reward */
  addCoins(amount: number) {
    this.setCoins(this.coins + amount);
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
    const rank = this.rankOf(id);
    const cost = RANK_UP_COSTS[rank - 1];
    const name = PERK_BY_ID.get(id)?.name ?? id;
    this.#record(`${name} → ${rank + 1}★`, () => {
      this.coins -= cost;
      this.#setRankRaw(id, rank + 1);
    });
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

  /** SETUP mode: set a rank freely */
  setRank(id: string, rank: number) {
    const r = clampRank(rank);
    if ((this.ranks[id] ?? 1) === r) return;
    const name = PERK_BY_ID.get(id)?.name ?? id;
    this.#record(`${name} → ${r}★`, () => this.#setRankRaw(id, r));
  }

  #setRankRaw(id: string, rank: number) {
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

  /** clears the plan but keeps level, slots and faction; persistence (and
   *  hash stripping when link-loaded) happens via persist(). Also clears the
   *  undo/redo log, like loading a save. */
  reset() {
    this.#undoStack = [];
    this.#redoStack = [];
    this.#syncDepths();
    this.#persistHistory();
    this.order = [];
    this.ranks = {};
    this.coins = 0;
  }

  /** startup conflict: use the saved local state, or adopt the link (and
   *  overwrite the local state with it) */
  resolveConflict(useLocal: boolean) {
    const c = this.pendingConflict;
    if (!c) return;
    this.pendingConflict = null;
    if (useLocal) {
      this.#adopt(c.local);
      this.#fromLink = false;
      this.origin = 'local';
      this.#lastPersisted = encodeState(c.local);
      this.#clearHash();
    } else {
      // the link state is already adopted; overwrite the local slot with it.
      // the hash stays until the first edit (this overwrite is not an edit).
      const s = this.snapshot();
      this.origin = 'local';
      if (typeof localStorage !== 'undefined') saveCurrent(localStorage, s);
      this.#lastPersisted = encodeState(s);
    }
  }

  // --- named saves ----------------------------------------------------------

  listSaves(): NamedSave[] {
    if (typeof localStorage === 'undefined') return [];
    return loadSaves(localStorage);
  }

  /** save the current state under a name; returns the list and whether an existing save was replaced */
  saveAs(name: string): { replaced: boolean; saves: NamedSave[] } {
    if (typeof localStorage === 'undefined' || !name.trim()) return { replaced: false, saves: this.listSaves() };
    const up = upsertSave(loadSaves(localStorage), name, this.snapshot());
    saveSaves(localStorage, up.saves);
    return { replaced: up.replaced, saves: up.saves };
  }

  /** adopt a named save; not undoable (clears the log, like reset) */
  loadSave(name: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    const save = loadSaves(localStorage).find((sv) => sv.name === name);
    if (!save) return false;
    this.#undoStack = [];
    this.#redoStack = [];
    this.#syncDepths();
    this.#persistHistory();
    this.#adopt(normalize(save.state));
    this.#fromLink = false;
    this.origin = 'local';
    this.#lastPersisted = encodeState(save.state);
    this.#clearHash();
    return true;
  }

  deleteSave(name: string): NamedSave[] {
    if (typeof localStorage === 'undefined') return [];
    const saves = removeSave(loadSaves(localStorage), name);
    saveSaves(localStorage, saves);
    return saves;
  }

  currentUrl(): string {
    return `${location.origin}${location.pathname}#s=${encodeState(this.snapshot())}`;
  }
}

export const urlState = new UrlState();
