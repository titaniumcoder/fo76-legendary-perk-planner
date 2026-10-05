import { describe, expect, it, vi } from 'vitest';
import { urlState, UrlState } from './urlState.svelte';
import { decodeState, encodeState } from '../utils/codec';
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

  it('syncToUrl replaces the current history entry — it never pushes', () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: push, replaceState: replace });
    try {
      urlState.level = 123;
      urlState.syncToUrl();
      vi.advanceTimersByTime(250);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      expect(String(replace.mock.calls[0][2])).toMatch(/^#s=/);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('reset pushes a fresh history entry so Back restores the pre-reset plan', () => {
    const push = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('history', { pushState: push, replaceState: replace });
    try {
      urlState.level = 100;
      urlState.order = ['ammo-factory'];
      urlState.ranks = { 'ammo-factory': 2 };
      urlState.coins = 100;
      urlState.reset();
      expect(push).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();
      const state = decodeState(String(push.mock.calls[0][2]));
      expect(state?.order).toEqual([]);
      expect(state?.coins).toBe(0);
      expect(state?.level).toBe(100);
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
