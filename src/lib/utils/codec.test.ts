import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, type AppState } from './codec';
import { DEFAULT_ASSUMPTIONS } from '../planner/planner';

const state: AppState = {
  level: 275,
  slots: 5,
  coins: 1234,
  cards: [
    { id: 'ammo-factory', rank: 2 },
    { id: 'legendary-luck', rank: 1 },
  ],
  assumptions: { coinsPerPick: 2, coinsPerPack: 8, level50Bonus: 50 },
};

describe('codec', () => {
  it('roundtrips state through the URL hash format', () => {
    const encoded = encodeState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeState(`#s=${encoded}`)).toEqual(state);
  });

  it('is URL-safe (no +, /, =)', () => {
    const s = encodeState(state);
    expect(s).not.toMatch(/[+/=]/);
  });

  it('keeps defaults distinguishable and stable', () => {
    const s: AppState = { level: 1, slots: 0, coins: 0, cards: [], assumptions: { ...DEFAULT_ASSUMPTIONS } };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it('returns null for garbage', () => {
    expect(decodeState('#s=!!!not-base64!!!')).toBeNull();
    expect(decodeState('#s=eyJ2ZXJzaW9uIjp9')).toBeNull();
  });

  it('returns null for wrong version', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([99, [1, 0, 0, [], [2, 8, 50]]]));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const b64 = btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    expect(decodeState(b64)).toBeNull();
  });
});
