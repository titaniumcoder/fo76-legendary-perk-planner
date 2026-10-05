import { describe, expect, it } from 'vitest';
import {
  computePlan,
  spendAtLevel,
  equippedCardIds,
  fullPoolProjection,
  DEFAULT_ASSUMPTIONS,
  type PlannerInput,
} from './planner';

const base: PlannerInput = {
  level: 34,
  slotsUnlocked: 6,
  coinsOwned: 0,
  cards: [],
  assumptions: { ...DEFAULT_ASSUMPTIONS },
};

const cards = (...defs: Array<string | [string, number?]>) =>
  defs.map((d) => (Array.isArray(d) ? { id: d[0], rank: d[1] ?? 1 } : { id: d, rank: 1 }));

describe('slot gating', () => {
  it('no slots: first card activates at level 50', () => {
    const plan = computePlan({ ...base, slotsUnlocked: 0, cards: cards(['ammo-factory']) });
    expect(plan.availableSlotsNow).toBe(0);
    expect(plan.cardPlans[0].activateAtLevel).toBe(50);
    expect(plan.nextSlotUnlock).toEqual({ level: 50, slotIndex: 1 });
    expect(plan.events.every((e) => e.level >= 50)).toBe(true);
  });

  it('account-wide slots are usable below level 50', () => {
    const plan = computePlan({ ...base, level: 34, slotsUnlocked: 2, cards: cards(['ammo-factory'], ['legendary-luck']) });
    expect(plan.availableSlotsNow).toBe(2);
    expect(plan.cardPlans[0].activateAtLevel).toBe(34);
    expect(plan.cardPlans[1].activateAtLevel).toBe(34);
    expect(plan.events.filter((e) => e.level === 34)).toHaveLength(0);
  });

  it('a maxed card frees its slot for the next card (rank memory + swap)', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: cards('ammo-factory', 'legendary-luck', 'retribution', 'funky-duds', 'power-sprinter', 'follow-through', 'what-rads'),
    });
    const finishes = plan.cardPlans.slice(0, 6).map((c) => c.finishAtLevel!);
    expect(plan.cardPlans[6].activateAtLevel).toBe(Math.min(...finishes));
  });

  it('a card waiting on a slot can come online via a freed slot before its milestone', () => {
    const plan = computePlan({
      ...base,
      level: 34,
      slotsUnlocked: 0,
      coinsOwned: 0,
      cards: cards(['ammo-factory'], ['legendary-luck']),
    });
    const act = plan.cardPlans[1].activateAtLevel!;
    expect(act).toBeGreaterThanOrEqual(50);
    expect(act).toBeLessThanOrEqual(75);
  });
});

describe('spending phases', () => {
  it('stat cards get their first-ups before any card is finished', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 350,
      cards: cards(['ammo-factory'], ['legendary-luck'], ['retribution']),
    });
    const at300 = plan.events.filter((e) => e.level === 300);
    expect(at300.map((e) => `${e.cardId}:${e.fromRank}>${e.toRank}`)).toEqual([
      'legendary-luck:1>2',
      'ammo-factory:1>2',
      'ammo-factory:2>3',
      'ammo-factory:3>4',
    ]);
    expect(at300[at300.length - 1].coinsAfter).toBe(0);
    const luck23 = plan.events.findIndex((e) => e.cardId === 'legendary-luck' && e.toRank === 3);
    const ammo4 = plan.events.findIndex((e) => e.cardId === 'ammo-factory' && e.toRank === 4);
    expect(luck23).toBeGreaterThan(ammo4);
  });

  it('strict queue: an unaffordable priority card blocks later cards', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 100,
      cards: cards(['ammo-factory'], ['legendary-luck']),
    });
    const at300 = plan.events.filter((e) => e.level === 300);
    expect(at300.map((e) => `${e.cardId}:${e.fromRank}>${e.toRank}`)).toEqual(['legendary-luck:1>2', 'ammo-factory:1>2']);
    expect(at300[at300.length - 1].coinsAfter).toBe(0);
  });

  it('non-stat cards are finished one after another', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 900,
      cards: cards(['ammo-factory'], ['retribution'], ['funky-duds']),
    });
    const at300 = plan.events.filter((e) => e.level === 300);
    expect(at300.map((e) => `${e.cardId}:${e.fromRank}>${e.toRank}`)).toEqual([
      'ammo-factory:1>2',
      'ammo-factory:2>3',
      'ammo-factory:3>4',
      'retribution:1>2',
      'retribution:2>3',
      'retribution:3>4',
      'funky-duds:1>2',
      'funky-duds:2>3',
      'funky-duds:3>4',
    ]);
    const f1 = plan.cardPlans[0].finishAtLevel!;
    const f2 = plan.cardPlans[1].finishAtLevel!;
    const f3 = plan.cardPlans[2].finishAtLevel!;
    expect(f1).toBeLessThanOrEqual(f2);
    expect(f2).toBeLessThanOrEqual(f3);
    expect(plan.finishedAtLevel).toBe(f3);
  });

  it('no first-up spread among non-stat cards', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 50,
      cards: cards(['ammo-factory'], ['retribution']),
    });
    const at300 = plan.events.filter((e) => e.level === 300);
    expect(at300.map((e) => `${e.cardId}:${e.fromRank}>${e.toRank}`)).toEqual(['ammo-factory:1>2']);
    const retribFirst = plan.events.findIndex((e) => e.cardId === 'retribution');
    const ammoFinish = plan.events.findIndex((e) => e.cardId === 'ammo-factory' && e.toRank === 4);
    expect(retribFirst).toBeGreaterThan(ammoFinish);
  });
});

describe('spendAtLevel', () => {
  it('applies phase A then strict phase B in one call', () => {
    const res = spendAtLevel(350, cards(['ammo-factory'], ['legendary-luck'], ['retribution']));
    expect(res.coins).toBe(0);
    expect(res.ranks).toEqual({ 'ammo-factory': 4, 'legendary-luck': 2, retribution: 1 });
    expect(res.events.map((e) => e.cardId)).toEqual(['legendary-luck', 'ammo-factory', 'ammo-factory', 'ammo-factory']);
  });

  it('returns unchanged ranks when nothing is affordable', () => {
    const res = spendAtLevel(10, cards(['ammo-factory']));
    expect(res.coins).toBe(10);
    expect(res.ranks).toEqual({ 'ammo-factory': 1 });
    expect(res.events).toHaveLength(0);
  });
});

describe('equippedCardIds', () => {
  it('fills slots in priority order', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(equippedCardIds(order, {}, 6)).toEqual(['a', 'b', 'c', 'd']);
    expect(equippedCardIds(order, {}, 2)).toEqual(['a', 'b']);
    expect(equippedCardIds(order, {}, 0)).toEqual([]);
  });

  it('maxed cards free slots for later cards', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = { a: 4, b: 4 };
    expect(equippedCardIds(order, ranks, 6)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(equippedCardIds(['a', 'b'], { a: 4 }, 1)).toEqual(['a', 'b']);
    expect(equippedCardIds(['a', 'b', 'c'], { a: 4 }, 1)).toEqual(['a', 'b']);
  });
});

describe('income', () => {
  it('pack income at levels 4, 6, 8, 10 and every 5th from 15', () => {
    const plan = computePlan({ ...base, level: 49, slotsUnlocked: 1, cards: cards(['ammo-factory']) });
    const at50 = plan.events.filter((e) => e.level === 50);
    expect(at50).toHaveLength(1);
    expect(at50[0]).toMatchObject({ fromRank: 1, toRank: 2, coinsAfter: 10 });
  });

  it('adds the one-time level-50 bonus when crossing 50', () => {
    const plan = computePlan({ ...base, level: 49, slotsUnlocked: 1, cards: cards(['ammo-factory']) });
    expect(plan.events[0].level).toBe(50);
    expect(plan.events[0].coinsAfter).toBe(10);
  });

  it('no level-50 bonus when already at 50+', () => {
    const plan = computePlan({ ...base, level: 50, slotsUnlocked: 1, coinsOwned: 0, cards: cards(['ammo-factory']) });
    expect(plan.events.every((e) => e.level !== 51)).toBe(true);
  });
});

describe('plan results', () => {
  it('spends coins on hand immediately at the current level', () => {
    const plan = computePlan({ ...base, coinsOwned: 50, slotsUnlocked: 1, cards: cards(['ammo-factory']) });
    expect(plan.events[0]).toMatchObject({ level: 34, cardId: 'ammo-factory', fromRank: 1, toRank: 2, cost: 50, coinsAfter: 0 });
  });

  it('finishing follows priority order', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      cards: cards(['ammo-factory'], ['legendary-luck']),
    });
    expect(plan.cardPlans[0].finishAtLevel!).toBeLessThanOrEqual(plan.cardPlans[1].finishAtLevel!);
    expect(plan.finishedAtLevel).toBe(plan.cardPlans[1].finishAtLevel);
  });

  it('respects partial ranks: a 3★ card only needs the 150 step', () => {
    const plan = computePlan({ ...base, level: 300, slotsUnlocked: 6, coinsOwned: 150, cards: cards(['ammo-factory', 3]) });
    expect(plan.events).toHaveLength(1);
    expect(plan.events[0]).toMatchObject({ fromRank: 3, toRank: 4, cost: 150 });
    expect(plan.finishedAtLevel).toBe(300);
    expect(plan.totalCoinsNeeded).toBe(150);
  });

  it('already-maxed cards need no coins', () => {
    const plan = computePlan({ ...base, cards: cards(['ammo-factory', 4]) });
    expect(plan.finishedAtLevel).toBe(34);
    expect(plan.events).toHaveLength(0);
    expect(plan.totalCoinsNeeded).toBe(0);
    expect(plan.allDone).toBe(true);
  });

  it('empty selection does not claim completion', () => {
    const plan = computePlan({ ...base });
    expect(plan.finishedAtLevel).toBeNull();
    expect(plan.events).toHaveLength(0);
  });

  it('no cap: coins accumulate past 5000 without loss', () => {
    const plan = computePlan({ ...base, level: 34, slotsUnlocked: 0, coinsOwned: 4950, cards: cards(['ammo-factory']) });
    const first = plan.events.find((e) => e.cardId === 'ammo-factory')!;
    expect(first.coinsAfter).toBeGreaterThan(5000);
    expect(plan.finishedAtLevel).toBeGreaterThan(34);
  });

  it('stalls when all income assumptions are zeroed', () => {
    const plan = computePlan({
      ...base,
      level: 49,
      slotsUnlocked: 1,
      cards: cards(['ammo-factory']),
      assumptions: { coinsPerPick: 0, coinsPerPack: 0, level50Bonus: 0 },
    });
    expect(plan.stalled).toBe(true);
    expect(plan.finishedAtLevel).toBeNull();
  });

  it('a fresh 1★ card needs 300 coins', () => {
    const plan = computePlan({ ...base, level: 300, slotsUnlocked: 6, coinsOwned: 300, cards: cards(['ammo-factory']) });
    expect(plan.totalCoinsNeeded).toBe(300);
    expect(plan.finishedAtLevel).toBe(300);
  });

  it('six fresh cards need 1800 coins', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      cards: cards('ammo-factory', 'legendary-luck', 'retribution', 'funky-duds', 'power-sprinter', 'follow-through'),
    });
    expect(plan.totalCoinsNeeded).toBe(1800);
    expect(plan.finishedAtLevel).not.toBeNull();
    expect(plan.finishedAtLevel!).toBeLessThan(32767);
  });

  it('filters unknown ids and accepts more than 6 cards', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: [...cards('nope'), ...cards('ammo-factory', 'legendary-luck', 'retribution', 'funky-duds', 'power-sprinter', 'what-rads', 'follow-through', 'ammo-factory')],
    });
    expect(plan.cardPlans).toHaveLength(7);
    expect(plan.cardPlans.some((c) => c.cardId === 'nope')).toBe(false);
  });
});

describe('fullPoolProjection', () => {
  it('human pool is 26 cards, ghoul pool 27', () => {
    const human = fullPoolProjection({ ...base, level: 300, slotsUnlocked: 6 }, 'human');
    const ghoul = fullPoolProjection({ ...base, level: 300, slotsUnlocked: 6 }, 'ghoul');
    expect(human.finishedAtLevel).not.toBeNull();
    expect(ghoul.finishedAtLevel).not.toBeNull();
    expect(human.finishedAtLevel!).toBeLessThan(32767);
    expect(ghoul.totalCoinsNeeded).toBeGreaterThan(human.totalCoinsNeeded);
  });

  it('remembered ranks shorten the projection', () => {
    const fresh = fullPoolProjection({ ...base, level: 300, slotsUnlocked: 6, cards: cards(['ammo-factory']) }, 'human');
    const leveled = fullPoolProjection(
      { ...base, level: 300, slotsUnlocked: 6, cards: cards(['ammo-factory', 4]) },
      'human',
    );
    expect(leveled.totalCoinsNeeded).toBe(fresh.totalCoinsNeeded - 300);
  });

  it('respects the faction pools', () => {
    const human = fullPoolProjection({ ...base, level: 300, slotsUnlocked: 6, coinsOwned: 30000 }, 'human');
    const ghoul = fullPoolProjection({ ...base, level: 300, slotsUnlocked: 6, coinsOwned: 30000 }, 'ghoul');
    expect(human.finishedAtLevel).not.toBeNull();
    expect(ghoul.finishedAtLevel).not.toBeNull();
  });
});
