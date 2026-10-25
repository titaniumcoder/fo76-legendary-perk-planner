import { describe, expect, it, vi } from 'vitest';
import { urlState, UrlState } from './urlState.svelte';
import { decodeState, encodeState, type AppState } from '../utils/codec';
import { loadCurrent, saveCurrent } from './storage';
import { computePlan, type PlanEvent } from '../planner/planner';
import { DEFAULT_ASSUMPTIONS, MAX_LEVEL } from '../planner/rules';

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

/** a state that arrives via a shared link in the startup tests */
const linkState: AppState = {
  level: 10,
  slots: 2,
  coins: 40,
  order: ['ammo-factory'],
  ranks: { 'ammo-factory': 1 },
  assumptions: { ...DEFAULT_ASSUMPTIONS },
  faction: 'human',
  mode: 'setup',
};

/** a different state that already lives in localStorage */
const localState: AppState = { ...linkState, level: 20, coins: 90 };

describe('urlState', () => {
  it('defaults: level 1, slots 6, empty plan', () => {
    expect(urlState.level).toBeGreaterThan(0);
    expect([0, 1, 2, 3, 4, 5, 6]).toContain(urlState.slots);
  });

  it('levelUp adds income only — ranks untouched (spending is manual)', () => {
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 0;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    urlState.levelUp();
    expect(urlState.level).toBe(50);
    expect(urlState.coins).toBe(60);
    expect(urlState.rankOf('ammo-factory')).toBe(1);
  });

  it('levelUp at a pack level adds pick + pack income', () => {
    urlState.level = 74;
    urlState.slots = 6;
    urlState.coins = 40;
    urlState.order = ['legendary-luck', 'ammo-factory'];
    urlState.ranks = {};
    urlState.levelUp();
    expect(urlState.level).toBe(75);
    expect(urlState.coins).toBe(50);
    expect(urlState.rankOf('legendary-luck')).toBe(1);
    expect(urlState.rankOf('ammo-factory')).toBe(1);
  });

  it('levelDown reverses the income of entering the level — including the LVL 50 bonus', () => {
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 10;
    urlState.order = [];
    urlState.levelUp();
    expect(urlState.level).toBe(50);
    const coinsAt50 = urlState.coins;
    expect(coinsAt50).toBe(70); // 10 on hand + 60 income for entering LVL 50 (pick + 50 bonus)
    urlState.levelDown();
    expect(urlState.level).toBe(49);
    expect(urlState.coins).toBe(10);
  });

  it('levelDown clamps coins at 0 and is a no-op at level 1', () => {
    urlState.level = 20;
    urlState.coins = 0;
    urlState.order = [];
    urlState.levelUp(); // gains income
    urlState.coins = 0; // then drop the coins by hand
    urlState.levelDown();
    expect(urlState.level).toBe(20);
    expect(urlState.coins).toBe(0);
    urlState.level = 1;
    urlState.levelDown();
    expect(urlState.level).toBe(1);
  });

  it('canBuy: affordable + equipped + not maxed', () => {
    urlState.level = 300;
    urlState.slots = 6;
    urlState.coins = 50;
    urlState.order = ['ammo-factory', 'legendary-luck'];
    urlState.ranks = {};
    expect(urlState.canBuy('ammo-factory')).toBe(true);
    expect(urlState.canBuy('legendary-luck')).toBe(true);
    urlState.buy('ammo-factory');
    expect(urlState.rankOf('ammo-factory')).toBe(2);
    expect(urlState.coins).toBe(0);
    expect(urlState.canBuy('legendary-luck')).toBe(false);
  });

  it('canBuy: card waiting for a slot is not buyable even with coins', () => {
    urlState.level = 34;
    urlState.slots = 1;
    urlState.coins = 500;
    urlState.order = ['ammo-factory', 'legendary-luck'];
    urlState.ranks = {};
    expect(urlState.canBuy('legendary-luck')).toBe(false);
    urlState.buy('legendary-luck');
    expect(urlState.rankOf('legendary-luck')).toBe(1);
  });

  it('buy is a no-op when unaffordable and on maxed cards', () => {
    urlState.level = 300;
    urlState.slots = 6;
    urlState.coins = 20;
    urlState.order = ['ammo-factory'];
    urlState.ranks = {};
    urlState.buy('ammo-factory');
    expect(urlState.rankOf('ammo-factory')).toBe(1);
    expect(urlState.coins).toBe(20);
    urlState.coins = 5000;
    urlState.ranks = { 'ammo-factory': 4 };
    expect(urlState.canBuy('ammo-factory')).toBe(false);
    urlState.buy('ammo-factory');
    expect(urlState.rankOf('ammo-factory')).toBe(4);
    expect(urlState.coins).toBe(5000);
  });

  it('setMode persists in snapshot', () => {
    urlState.mode = 'regular';
    expect(urlState.snapshot().mode).toBe('regular');
    urlState.mode = 'setup';
    expect(urlState.snapshot().mode).toBe('setup');
  });

  it('rank is remembered when a card is removed and re-added', () => {
    urlState.order = [];
    urlState.ranks = {};
    urlState.toggleCard('ammo-factory');
    urlState.setRank('ammo-factory', 3);
    urlState.toggleCard('ammo-factory');
    expect(urlState.order).toEqual([]);
    urlState.toggleCard('ammo-factory');
    expect(urlState.order).toEqual(['ammo-factory']);
    expect(urlState.rankOf('ammo-factory')).toBe(3);
  });

  it('swap reorders the priority', () => {
    urlState.order = ['a', 'b', 'c'];
    urlState.swap(0, 2);
    expect(urlState.order).toEqual(['c', 'b', 'a']);
    urlState.moveTo(2, 0);
    expect(urlState.order).toEqual(['a', 'c', 'b']);
    urlState.order = [];
  });

  it('reset clears the plan but keeps level, slots and faction', () => {
    urlState.level = 100;
    urlState.slots = 4;
    urlState.faction = 'ghoul';
    urlState.coins = 500;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 2 };
    urlState.reset();
    expect(urlState.order).toEqual([]);
    expect(urlState.ranks).toEqual({});
    expect(urlState.coins).toBe(0);
    expect(urlState.level).toBe(100);
    expect(urlState.slots).toBe(4);
    expect(urlState.faction).toBe('ghoul');
    urlState.faction = 'human';
  });

  it('toggleCard is a no-op once 6 cards are selected', () => {
    urlState.order = ['ammo-factory', 'legendary-luck', 'retribution', 'funky-duds', 'power-sprinter', 'follow-through'];
    urlState.ranks = {};
    urlState.toggleCard('what-rads');
    expect(urlState.order).toHaveLength(6);
    expect(urlState.order.includes('what-rads')).toBe(false);
    urlState.toggleCard('ammo-factory');
    expect(urlState.order).toHaveLength(5);
    urlState.toggleCard('what-rads');
    expect(urlState.order).toHaveLength(6);
    urlState.order = [];
  });

  it('persist saves to localStorage and never writes the URL', () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: push, replaceState: replace });
    vi.stubGlobal('localStorage', fakeStorage());
    try {
      urlState.level = 123;
      urlState.persist();
      vi.advanceTimersByTime(250);
      expect(push).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(loadCurrent(localStorage as unknown as Storage)?.level).toBe(123);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('persist is a no-op when nothing changed', () => {
    vi.useFakeTimers();
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    try {
      const saved = loadCurrent(ls);
      urlState.persist();
      vi.advanceTimersByTime(250);
      // unchanged snapshot → nothing new written (the encoded state matches the
      // last persisted one, or the singleton was never edited in this test run)
      expect(loadCurrent(ls) ?? null).toEqual(saved);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('first edit after loading a link strips the hash and saves locally', () => {
    vi.useFakeTimers();
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: replace });
    vi.stubGlobal('location', { pathname: '/planner', search: '', hash: `#s=${encodeState(linkState)}` });
    vi.stubGlobal('localStorage', fakeStorage());
    try {
      const fromLink = new UrlState();
      expect(fromLink.origin).toBe('link');
      fromLink.level = 100; // first edit
      fromLink.persist();
      vi.advanceTimersByTime(250);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(String(replace.mock.calls[0][2])).toBe('/planner'); // clean URL, no hash
      expect(fromLink.origin).toBe('local');
      expect(loadCurrent(localStorage as unknown as Storage)?.level).toBe(100);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('a link-only load keeps the hash until the first edit', () => {
    vi.stubGlobal('location', { pathname: '/planner', search: '', hash: `#s=${encodeState(linkState)}` });
    vi.stubGlobal('localStorage', fakeStorage());
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: replace });
    try {
      const fromLink = new UrlState();
      expect(fromLink.origin).toBe('link');
      expect(fromLink.level).toBe(linkState.level);
      expect(replace).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reset clears the plan and never touches the URL', () => {
    const push = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: push, replaceState: replace });
    try {
      urlState.level = 100;
      urlState.order = ['ammo-factory'];
      urlState.ranks = { 'ammo-factory': 2 };
      urlState.coins = 100;
      urlState.reset();
      expect(push).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      const state = urlState.snapshot();
      expect(state.order).toEqual([]);
      expect(state.coins).toBe(0);
      expect(state.level).toBe(100);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resolveConflict(true) adopts the local state and clears the URL', () => {
    vi.stubGlobal('location', { pathname: '/planner', search: '', hash: `#s=${encodeState(linkState)}` });
    const ls = fakeStorage();
    saveCurrent(ls as unknown as Storage, localState);
    vi.stubGlobal('localStorage', ls);
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: replace });
    try {
      const s = new UrlState();
      expect(s.pendingConflict).not.toBeNull();
      s.resolveConflict(true);
      expect(s.pendingConflict).toBeNull();
      expect(s.origin).toBe('local');
      expect(s.level).toBe(localState.level);
      expect(String(replace.mock.calls[0][2])).toBe('/planner');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resolveConflict(false) keeps the link state and overwrites the local slot', () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { pathname: '/planner', search: '', hash: `#s=${encodeState(linkState)}` });
    const ls = fakeStorage();
    saveCurrent(ls as unknown as Storage, localState);
    vi.stubGlobal('localStorage', ls);
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: replace });
    try {
      const s = new UrlState();
      expect(s.pendingConflict).not.toBeNull();
      s.resolveConflict(false);
      vi.advanceTimersByTime(250);
      expect(s.pendingConflict).toBeNull();
      expect(s.level).toBe(linkState.level);
      expect(loadCurrent(ls as unknown as Storage)?.level).toBe(linkState.level); // local overwritten
      expect(replace).not.toHaveBeenCalled(); // hash stays until the first edit
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('named saves round-trip through the state', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    try {
      urlState.level = 250;
      urlState.order = ['ammo-factory'];
      urlState.ranks = { 'ammo-factory': 3 };
      expect(urlState.listSaves()).toEqual([]);
      const first = urlState.saveAs('main');
      expect(first.replaced).toBe(false);
      expect(urlState.listSaves()).toHaveLength(1);

      const second = urlState.saveAs('main');
      expect(second.replaced).toBe(true);
      expect(urlState.listSaves()).toHaveLength(1);

      // scramble the working state, then restore from the save
      urlState.level = 1;
      urlState.order = [];
      urlState.ranks = {};
      expect(urlState.loadSave('main')).toBe(true);
      expect(urlState.level).toBe(250);
      expect(urlState.rankOf('ammo-factory')).toBe(3);
      expect(urlState.undoDepth).toBe(0); // loading a save clears the log

      expect(urlState.loadSave('missing')).toBe(false);
      urlState.deleteSave('main');
      expect(urlState.listSaves()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  const eventsAt = (level: number, cardId = 'ammo-factory', cost = 50): PlanEvent[] => [
    { cardId, cardName: cardId, fromRank: 1, toRank: 2, cost, coinsAfter: 0, level },
  ];

  it('applyPlanUpTo jumps the level, applies rank-ups and keeps the remainder', () => {
    urlState.reset();
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 0;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    const plan = computePlan({
      level: 49,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: [{ id: 'ammo-factory', rank: 1 }],
      assumptions: { ...DEFAULT_ASSUMPTIONS },
    });
    expect(plan.events.length).toBeGreaterThan(0);
    urlState.applyPlanUpTo(plan.events, 0);
    expect(urlState.level).toBe(plan.events[0].level);
    expect(urlState.level).toBe(50);
    expect(urlState.rankOf('ammo-factory')).toBe(2);
    expect(urlState.coins).toBe(plan.events[0].coinsAfter);
  });

  it('applyPlanUpTo keeps every coin — spends at the scheduled level', () => {
    urlState.reset();
    urlState.level = 100;
    urlState.slots = 6;
    urlState.coins = 4990;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    urlState.applyPlanUpTo(eventsAt(103, 'ammo-factory', 150), 0);
    expect(urlState.level).toBe(103);
    expect(urlState.coins).toBe(4990 + 6 - 150);
  });

  it('applyPlanUpTo accrues income past the old 5000 cap without loss', () => {
    urlState.reset();
    urlState.level = 100;
    urlState.slots = 6;
    urlState.coins = 4990;
    urlState.order = [];
    urlState.ranks = {};
    urlState.applyPlanUpTo(eventsAt(115, 'legendary-luck', 0), 0);
    expect(urlState.level).toBe(115);
    expect(urlState.coins).toBe(4990 + 30 + 24);
    expect(urlState.coins).toBeGreaterThan(5000);
  });

  it('applyPlanUpTo bumps slots when the level crosses a milestone', () => {
    urlState.reset();
    urlState.level = 74;
    urlState.slots = 1;
    urlState.coins = 50;
    urlState.order = ['legendary-luck'];
    urlState.ranks = {};
    urlState.applyPlanUpTo(eventsAt(75, 'legendary-luck'), 0);
    expect(urlState.level).toBe(75);
    expect(urlState.slots).toBe(2);
    expect(urlState.coins).toBe(10);
  });

  it('applyPlanUpTo is undoable and redoable', () => {
    urlState.reset();
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 0;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    const plan = computePlan({
      level: 49,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: [{ id: 'ammo-factory', rank: 1 }],
      assumptions: { ...DEFAULT_ASSUMPTIONS },
    });
    expect(urlState.canUndo).toBe(false);
    urlState.applyPlanUpTo(plan.events, 0);
    expect(urlState.canUndo).toBe(true);
    expect(urlState.canRedo).toBe(false);
    expect(urlState.nextUndoLabel()).toContain('LVL 50');

    urlState.undo();
    expect(urlState.level).toBe(49);
    expect(urlState.coins).toBe(0);
    expect(urlState.rankOf('ammo-factory')).toBe(1);
    expect(urlState.canRedo).toBe(true);

    urlState.redo();
    expect(urlState.level).toBe(50);
    expect(urlState.coins).toBe(plan.events[0].coinsAfter);
    expect(urlState.rankOf('ammo-factory')).toBe(2);
  });

  it('a new action invalidates redo', () => {
    urlState.reset();
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 100;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    urlState.applyPlanUpTo(eventsAt(49), 0);
    urlState.undo();
    expect(urlState.canRedo).toBe(true);
    urlState.applyPlanUpTo(eventsAt(49), 0);
    expect(urlState.canRedo).toBe(false);
  });

  it('the undo log caps at 50 entries', () => {
    urlState.reset();
    const events = eventsAt(1, 'legendary-luck', 0);
    for (let i = 0; i < 51; i++) urlState.applyPlanUpTo(events, 0);
    expect(urlState.undoDepth).toBe(50);
    expect(urlState.canUndo).toBe(true);
  });

  it('reset clears the undo/redo log', () => {
    urlState.reset();
    urlState.applyPlanUpTo(eventsAt(1, 'legendary-luck', 0), 0);
    expect(urlState.canUndo).toBe(true);
    urlState.reset();
    expect(urlState.canUndo).toBe(false);
    expect(urlState.canRedo).toBe(false);
  });

  it('the action log never changes the URL encoding', () => {
    urlState.reset();
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 0;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    const before = encodeState(urlState.snapshot());
    urlState.applyPlanUpTo(eventsAt(50), 0);
    urlState.undo();
    expect(encodeState(urlState.snapshot())).toBe(before);
  });

  it('the undo/redo log survives a reload via sessionStorage', () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    try {
      urlState.reset();
      urlState.level = 49;
      urlState.slots = 6;
      urlState.coins = 0;
      urlState.order = ['ammo-factory'];
      urlState.ranks = { 'ammo-factory': 1 };
      urlState.applyPlanUpTo(eventsAt(50), 0);
      expect(urlState.undoDepth).toBe(1);

      const fresh = new UrlState();
      expect(fresh.undoDepth).toBe(1);
      expect(fresh.redoDepth).toBe(0);
      fresh.undo();
      expect(fresh.level).toBe(49);
      expect(fresh.coins).toBe(0);
      expect(fresh.rankOf('ammo-factory')).toBe(1);
      expect(fresh.canRedo).toBe(true);
      fresh.redo();
      expect(fresh.level).toBe(50);
      expect(fresh.rankOf('ammo-factory')).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('levelUp is undoable and redoable', () => {
    urlState.reset();
    urlState.level = 49;
    urlState.coins = 0;
    urlState.assumptions = { ...DEFAULT_ASSUMPTIONS };
    urlState.levelUp();
    expect(urlState.level).toBe(50);
    expect(urlState.coins).toBe(60);
    urlState.undo();
    expect(urlState.level).toBe(49);
    expect(urlState.coins).toBe(0);
    urlState.redo();
    expect(urlState.level).toBe(50);
    expect(urlState.coins).toBe(60);
  });

  it('setLevel is undoable, clamped and ignores no-ops', () => {
    urlState.reset();
    urlState.level = 100;
    urlState.setLevel(120);
    expect(urlState.level).toBe(120);
    urlState.undo();
    expect(urlState.level).toBe(100);
    urlState.redo();
    expect(urlState.level).toBe(120);

    urlState.undo();
    urlState.setLevel(120);
    expect(urlState.level).toBe(120);
    urlState.setLevel(120);
    expect(urlState.undoDepth).toBe(1);
    urlState.setLevel(0);
    expect(urlState.level).toBe(1);
    urlState.setLevel(MAX_LEVEL * 2);
    expect(urlState.level).toBe(MAX_LEVEL);
  });

  it('setCoins is undoable and clamped at 0', () => {
    urlState.reset();
    urlState.coins = 100;
    urlState.setCoins(250);
    expect(urlState.coins).toBe(250);
    urlState.undo();
    expect(urlState.coins).toBe(100);
    urlState.setCoins(-5);
    expect(urlState.coins).toBe(0);
    urlState.undo();
    expect(urlState.coins).toBe(100);
  });

  it('addCoins records an undoable action and skips no-ops', () => {
    urlState.reset();
    urlState.coins = 100;
    urlState.addCoins(25);
    expect(urlState.coins).toBe(125);
    urlState.undo();
    expect(urlState.coins).toBe(100);
    expect(urlState.canUndo).toBe(false);
    urlState.addCoins(0);
    expect(urlState.canUndo).toBe(false);
  });

  it('buy is undoable and redoable', () => {
    urlState.reset();
    urlState.mode = 'regular';
    urlState.level = 300;
    urlState.slots = 6;
    urlState.coins = 150;
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 2 };
    urlState.buy('ammo-factory');
    expect(urlState.rankOf('ammo-factory')).toBe(3);
    expect(urlState.coins).toBe(50);
    urlState.undo();
    expect(urlState.rankOf('ammo-factory')).toBe(2);
    expect(urlState.coins).toBe(150);
    urlState.redo();
    expect(urlState.rankOf('ammo-factory')).toBe(3);
    expect(urlState.coins).toBe(50);
  });

  it('setRank in setup mode is undoable and ignores no-ops', () => {
    urlState.reset();
    urlState.mode = 'setup';
    urlState.order = ['ammo-factory'];
    urlState.ranks = { 'ammo-factory': 1 };
    urlState.setRank('ammo-factory', 1);
    expect(urlState.canUndo).toBe(false);
    urlState.setRank('ammo-factory', 3);
    expect(urlState.rankOf('ammo-factory')).toBe(3);
    urlState.undo();
    expect(urlState.rankOf('ammo-factory')).toBe(1);
    urlState.redo();
    expect(urlState.rankOf('ammo-factory')).toBe(3);
  });
});
