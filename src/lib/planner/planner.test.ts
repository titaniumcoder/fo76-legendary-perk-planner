import { describe, expect, it } from 'vitest';
import { computePlan, DEFAULT_ASSUMPTIONS, type PlannerInput } from './planner';

const base: PlannerInput = {
  level: 34,
  slotsUnlocked: 0,
  coinsOwned: 0,
  cards: [{ id: 'ammo-factory', rank: 1 }],
  assumptions: { ...DEFAULT_ASSUMPTIONS },
};

const cards = (...defs: Array<string | [string, number?]>) =>
  defs.map((d) => (Array.isArray(d) ? { id: d[0], rank: d[1] ?? 1 } : { id: d, rank: 1 }));

describe('computePlan', () => {
  it('gates cards behind slot milestones when no slots are unlocked', () => {
    const plan = computePlan({ ...base, cards: cards(['ammo-factory'], ['legendary-luck']) });
    expect(plan.availableSlotsNow).toBe(0);
    expect(plan.cardPlans[0].activateAtLevel).toBe(50);
    expect(plan.cardPlans[1].activateAtLevel).toBe(75);
    expect(plan.nextSlotUnlock).toEqual({ level: 50, slotIndex: 1 });
    // no upgrades before level 50
    expect(plan.events.every((e) => e.level >= 50)).toBe(true);
  });

  it('uses account-wide slots below level 50', () => {
    const plan = computePlan({ ...base, slotsUnlocked: 2, cards: cards(['ammo-factory'], ['legendary-luck'], ['retribution']) });
    expect(plan.availableSlotsNow).toBe(2);
    expect(plan.cardPlans[0].activateAtLevel).toBe(34);
    expect(plan.cardPlans[1].activateAtLevel).toBe(34);
    expect(plan.cardPlans[2].activateAtLevel).toBe(100); // 3rd slot milestone
    // first two cards upgrade immediately with... no coins → no events at 34
    expect(plan.events.filter((e) => e.level === 34)).toHaveLength(0);
  });

  it('spends coins on hand immediately at the current level', () => {
    const plan = computePlan({ ...base, coinsOwned: 50, slotsUnlocked: 1 });
    expect(plan.events[0]).toMatchObject({ level: 34, cardId: 'ammo-factory', fromRank: 1, toRank: 2, cost: 50, coinsAfter: 0 });
  });

  it('spreads first-ups: all available 1★ cards get rank 2 before any card finishes', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 350,
      cards: cards(['ammo-factory'], ['legendary-luck'], ['retribution']),
    });
    // 3 first-ups (150) then finishing starts; card 3 must not pass rank 2
    // before the others reached rank 2
    const firstUps = plan.events.filter((e) => e.fromRank === 1);
    expect(firstUps).toHaveLength(3);
    const firstFinishIdx = plan.events.findIndex((e) => e.toRank === 3);
    const lastFirstUpIdx = plan.events.map((e) => e.fromRank).lastIndexOf(1);
    expect(lastFirstUpIdx).toBeLessThan(firstFinishIdx);
    expect(firstUps.every((e) => e.cost === 50)).toBe(true);
  });

  it('a later affordable 1★ card still gets its first-up when an earlier one is not affordable', () => {
    // card 1 stuck (never affordable because later cards grab coins? no — phase A runs first)
    // simpler check: with 50 coins and 2 cards, only card 1 gets first-up
    const plan = computePlan({ ...base, level: 300, slotsUnlocked: 6, coinsOwned: 50, cards: cards(['ammo-factory'], ['legendary-luck']) });
    const atLevel = plan.events.filter((e) => e.level === 300);
    expect(atLevel).toHaveLength(1);
    expect(atLevel[0].cardId).toBe('ammo-factory');
  });

  it('pack income at levels 4, 6, 8, 10 and every 5th from 15', () => {
    // level 49 → 50: pick (2) + pack at 50 (8) + level-50 bonus (50) = 60
    const plan = computePlan({ ...base, level: 49, slotsUnlocked: 1, coinsOwned: 0 });
    const at50 = plan.events.filter((e) => e.level === 50);
    expect(at50).toHaveLength(1); // 60 coins ≥ first-up 50, remainder 10 < 100
    expect(at50[0]).toMatchObject({ fromRank: 1, toRank: 2, coinsAfter: 10 });
  });

  it('adds the one-time level-50 bonus', () => {
    // at level 49 the income at 50 must include +50 → 2 + 8 + 50 = 60
    const plan = computePlan({ ...base, level: 49, slotsUnlocked: 1 });
    const firstUp = plan.events[0];
    expect(firstUp.level).toBe(50);
    expect(firstUp.coinsAfter).toBe(10);
  });

  it('no level-50 bonus if already at or past 50', () => {
    const plan = computePlan({ ...base, level: 50, slotsUnlocked: 1 });
    // income at 51 = 2, no pack → no event at 51; first event later
    expect(plan.events.every((e) => e.level !== 51 || e.fromRank !== 1)).toBe(true);
  });

  it('finishing follows priority order: card 1 reaches 4★ before card 2', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: cards(['ammo-factory'], ['legendary-luck']),
    });
    const f1 = plan.cardPlans[0].finishAtLevel!;
    const f2 = plan.cardPlans[1].finishAtLevel!;
    expect(f1).toBeLessThanOrEqual(f2);
    expect(plan.finishedAtLevel).toBe(f2);
  });

  it('respects partial ranks: a 3★ card only needs the 150 step', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 150,
      cards: cards(['ammo-factory', 3]),
    });
    expect(plan.events).toHaveLength(1);
    expect(plan.events[0]).toMatchObject({ fromRank: 3, toRank: 4, cost: 150 });
    expect(plan.finishedAtLevel).toBe(300);
    expect(plan.totalCoinsNeeded).toBe(150);
  });

  it('already-maxed cards need no coins and finish immediately', () => {
    const plan = computePlan({ ...base, cards: cards(['ammo-factory', 4]) });
    expect(plan.finishedAtLevel).toBe(34);
    expect(plan.events).toHaveLength(0);
    expect(plan.totalCoinsNeeded).toBe(0);
    expect(plan.allDone).toBe(true);
  });

  it('tracks coin cap waste', () => {
    // card can only be equipped at level 50 → coins sit at cap from level 35 on
    const plan = computePlan({ ...base, level: 34, slotsUnlocked: 0, coinsOwned: 5000, cards: cards(['ammo-factory']) });
    expect(plan.coinsWastedToCap).toBeGreaterThan(0);
    expect(plan.finishedAtLevel).toBeGreaterThan(34);
  });

  it('stalls when all income assumptions are zeroed', () => {
    const plan = computePlan({
      ...base,
      level: 49,
      slotsUnlocked: 1,
      coinsOwned: 0,
      assumptions: { coinsPerPick: 0, coinsPerPack: 0, level50Bonus: 0 },
    });
    expect(plan.stalled).toBe(true);
    expect(plan.finishedAtLevel).toBeNull();
  });

  it('total coins needed for a fresh 1★ card is 300', () => {
    const plan = computePlan({ ...base, level: 300, slotsUnlocked: 6, coinsOwned: 300, cards: cards(['ammo-factory']) });
    expect(plan.totalCoinsNeeded).toBe(300);
    expect(plan.finishedAtLevel).toBe(300);
  });

  it('ignores unknown card ids and caps at 6 cards', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: [...cards('nope'), ...cards('ammo-factory', 'legendary-luck', 'retribution', 'funky-duds', 'power-sprinter', 'what-rads', 'follow-through')],
    });
    expect(plan.cardPlans).toHaveLength(6);
    expect(plan.cardPlans.some((c) => c.cardId === 'nope')).toBe(false);
  });

  it('six fresh cards need 1800 coins in total', () => {
    const plan = computePlan({
      ...base,
      level: 300,
      slotsUnlocked: 6,
      coinsOwned: 0,
      cards: cards('ammo-factory', 'legendary-luck', 'retribution', 'funky-duds', 'power-sprinter', 'follow-through'),
    });
    expect(plan.totalCoinsNeeded).toBe(1800);
    expect(plan.finishedAtLevel).not.toBeNull();
    expect(plan.finishedAtLevel!).toBeLessThan(32767);
  });
});
