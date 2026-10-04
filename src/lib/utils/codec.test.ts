import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, type AppState } from './codec';
import { DEFAULT_ASSUMPTIONS } from '../planner/rules';

const state: AppState = {
  level: 275,
  slots: 5,
  coins: 1234,
  order: ['ammo-factory', 'legendary-luck'],
  ranks: { 'ammo-factory': 2, 'legendary-luck': 1, 'what-rads': 3 },
  assumptions: { coinsPerPick: 2, coinsPerPack: 8, level50Bonus: 50 },
  faction: 'ghoul',
  mode: 'regular',
};

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

describe('codec v2', () => {
  it('roundtrips state through the URL hash format', () => {
    const encoded = encodeState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeState(`#s=${encoded}`)).toEqual(state);
  });

  it('is URL-safe (no +, /, =)', () => {
    expect(encodeState(state)).not.toMatch(/[+/=]/);
  });

  it('keeps defaults distinguishable and stable', () => {
    const s: AppState = {
      level: 1,
      slots: 6,
      coins: 0,
      order: [],
      ranks: {},
      assumptions: { ...DEFAULT_ASSUMPTIONS },
      faction: 'human',
      mode: 'setup',
    };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it('drops unknown card ids from order and ranks', () => {
    const s: AppState = { ...state, order: ['ammo-factory', 'nope'], ranks: { 'ammo-factory': 2, nope: 2 } };
    const out = decodeState(encodeState(s))!;
    expect(out.order).toEqual(['ammo-factory']);
    expect(out.ranks).toEqual({ 'ammo-factory': 2 });
  });

  it('returns null for garbage', () => {
    expect(decodeState('#s=!!!not-base64!!!')).toBeNull();
    expect(decodeState('#s=eyJ2ZXJzaW9uIjp9')).toBeNull();
  });

  it('returns null for unknown versions', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([99, [1, 0, 0, [], {}, [2, 8, 50], 0]]));
    expect(decodeState(b64url(bytes))).toBeNull();
  });
});

describe('codec migrations', () => {
  it('migrates v2 links: order + ranks, faction, mode → setup', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify([2, [42, 3, 77, ['ammo-factory', 'legendary-luck'], { 'ammo-factory': 2 }, [2, 8, 50], 1]]),
    );
    const out = decodeState(b64url(bytes))!;
    expect(out).toMatchObject({
      level: 42,
      slots: 3,
      coins: 77,
      order: ['ammo-factory', 'legendary-luck'],
      ranks: { 'ammo-factory': 2 },
      faction: 'ghoul',
      mode: 'setup',
    });
  });

  it('migrates v1 card-pair lists to order + ranks', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify([1, [42, 3, 77, [['ammo-factory', 2], ['legendary-luck', 1]], [2, 8, 50]]]),
    );
    const out = decodeState(b64url(bytes))!;
    expect(out).toMatchObject({
      level: 42,
      slots: 3,
      coins: 77,
      order: ['ammo-factory', 'legendary-luck'],
      ranks: { 'ammo-factory': 2, 'legendary-luck': 1 },
      faction: 'human',
      mode: 'setup',
    });
    expect(out.assumptions).toEqual({ coinsPerPick: 2, coinsPerPack: 8, level50Bonus: 50 });
  });

  it('migrated v1 state re-encodes as v2', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([1, [42, 3, 77, [['ammo-factory', 2]], [2, 8, 50]]]));
    const out = decodeState(b64url(bytes))!;
    const re = decodeState(encodeState(out))!;
    expect(re).toEqual(out);
    expect(decodeState(encodeState(out))!.faction).toBe('human');
  });

  it('returns null for malformed v1', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([1, [42, 3]]));
    expect(decodeState(b64url(bytes))).toBeNull();
  });
});
