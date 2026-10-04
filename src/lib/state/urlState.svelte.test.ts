import { describe, expect, it } from 'vitest';
import { urlState } from './urlState.svelte';

describe('urlState', () => {
  it('defaults: level 1, slots 6, empty plan', () => {
    expect(urlState.level).toBeGreaterThan(0);
    expect([0, 1, 2, 3, 4, 5, 6]).toContain(urlState.slots);
  });

  it('levelUp adds income and auto-buys planned upgrades', () => {
    urlState.level = 49;
    urlState.slots = 6;
    urlState.coins = 0;
    urlState.order = ['ammo-factory'];
    urlState.ranks = {};
    urlState.levelUp();
    expect(urlState.level).toBe(50);
    expect(urlState.coins).toBe(10);
    expect(urlState.rankOf('ammo-factory')).toBe(2);
  });

  it('levelUp applies the stat-card first-up before finishing', () => {
    urlState.level = 74;
    urlState.slots = 6;
    urlState.coins = 40;
    urlState.order = ['legendary-luck', 'ammo-factory'];
    urlState.ranks = {};
    urlState.levelUp();
    expect(urlState.level).toBe(75);
    expect(urlState.coins).toBe(0);
    expect(urlState.rankOf('legendary-luck')).toBe(2);
    expect(urlState.rankOf('ammo-factory')).toBe(1);
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
});
