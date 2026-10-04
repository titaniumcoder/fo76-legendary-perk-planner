import { DEFAULT_ASSUMPTIONS, type PlannerAssumptions, type PlannerCard } from '../planner/planner';
import { PERK_BY_ID } from '../data/legendaryPerks';
import { decodeState, encodeState, type AppState } from '../utils/codec';

const DEBOUNCE_MS = 200;

/** drop unknown ids, clamp ranks, cap at 6 — protects against stale hand-edited URLs */
function normalize(s: AppState): AppState {
  return {
    ...s,
    cards: s.cards
      .filter((c) => PERK_BY_ID.has(c.id))
      .slice(0, 6)
      .map((c) => ({ id: c.id, rank: Math.min(4, Math.max(1, Math.floor(c.rank) || 1)) })),
  };
}

function initialState(): AppState {
  const fromUrl = typeof location !== 'undefined' ? decodeState(location.hash) : null;
  if (fromUrl) return normalize(fromUrl);
  return {
    level: 34,
    slots: 0,
    coins: 0,
    cards: [],
    assumptions: { ...DEFAULT_ASSUMPTIONS },
  };
}

class UrlState {
  level = $state(1);
  slots = $state(0);
  coins = $state(0);
  cards = $state<PlannerCard[]>([]);
  assumptions = $state<PlannerAssumptions>({ ...DEFAULT_ASSUMPTIONS });

  #timer: ReturnType<typeof setTimeout> | undefined;
  #lastWritten = '';
  #adopting = false;

  constructor() {
    const s = initialState();
    this.level = s.level;
    this.slots = s.slots;
    this.coins = s.coins;
    this.cards = s.cards;
    this.assumptions = s.assumptions;

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
    this.cards = n.cards;
    this.assumptions = n.assumptions;
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
      cards: this.cards.map((c) => ({ ...c })),
      assumptions: { ...this.assumptions },
    };
  }

  currentUrl(): string {
    return `${location.origin}${location.pathname}#s=${encodeState(this.snapshot())}`;
  }
}

export const urlState = new UrlState();
