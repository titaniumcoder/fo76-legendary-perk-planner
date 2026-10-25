import { describe, expect, it } from 'vitest';
import {
  CURRENT_KEY,
  SAVES_KEY,
  loadCurrent,
  loadSaves,
  removeSave,
  resolveStartup,
  saveCurrent,
  saveSaves,
  stateEquals,
  upsertSave,
  type NamedSave,
  type StorageLike,
} from './storage';
import { DEFAULT_ASSUMPTIONS, type PlannerAssumptions } from '../planner/rules';
import { encodeState, type AppState } from '../utils/codec';

function fakeStorage(): StorageLike & { dump(): Map<string, string> } {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    dump: () => store,
  };
}

function makeState(over: Partial<AppState> = {}): AppState {
  const assumptions: PlannerAssumptions = { ...DEFAULT_ASSUMPTIONS };
  return {
    level: 42,
    slots: 3,
    coins: 120,
    order: ['ammo-factory'],
    ranks: { 'ammo-factory': 2 },
    assumptions,
    faction: 'human',
    mode: 'setup',
    ...over,
  };
}

const makeSave = (name: string, state = makeState(), savedAt = 1000): NamedSave => ({ name, state, savedAt });

describe('current autosave slot', () => {
  it('round-trips a state', () => {
    const s = fakeStorage();
    expect(loadCurrent(s)).toBeNull();
    const st = makeState();
    expect(saveCurrent(s, st)).toBe(true);
    const back = loadCurrent(s);
    expect(back).not.toBeNull();
    expect(stateEquals(back!, st)).toBe(true);
  });

  it('stores the encoded wire, not raw JSON', () => {
    const s = fakeStorage();
    saveCurrent(s, makeState());
    expect(s.getItem(CURRENT_KEY)).toBe(encodeState(makeState()));
  });

  it('returns null on corrupted data', () => {
    const s = fakeStorage();
    s.setItem(CURRENT_KEY, 'not-a-valid-wire');
    expect(loadCurrent(s)).toBeNull();
  });
});

describe('named saves', () => {
  it('round-trips a save list', () => {
    const s = fakeStorage();
    expect(loadSaves(s)).toEqual([]);
    const saves = [makeSave('main', makeState({ level: 100 }), 1234), makeSave('ghoul', makeState({ faction: 'ghoul' }), 5678)];
    expect(saveSaves(s, saves)).toBe(true);
    const back = loadSaves(s);
    expect(back).toHaveLength(2);
    expect(back[0].name).toBe('main');
    expect(back[0].savedAt).toBe(1234);
    expect(stateEquals(back[0].state, saves[0].state)).toBe(true);
    expect(back[1].state.faction).toBe('ghoul');
  });

  it('drops corrupt entries instead of throwing', () => {
    const s = fakeStorage();
    s.setItem(SAVES_KEY, JSON.stringify([{ name: 'ok', savedAt: 5, state: encodeState(makeState()) }, { name: 'bad', state: 'xxx' }, 42, null]));
    const saves = loadSaves(s);
    expect(saves).toHaveLength(1);
    expect(saves[0].name).toBe('ok');
  });

  it('survives corrupt JSON', () => {
    const s = fakeStorage();
    s.setItem(SAVES_KEY, '{nope');
    expect(loadSaves(s)).toEqual([]);
  });

  it('upsertSave inserts and replaces by trimmed name', () => {
    const st = makeState({ level: 77 });
    const first = upsertSave([], '  main  ', st, 111);
    expect(first.replaced).toBe(false);
    expect(first.saves).toEqual([makeSave('main', st, 111)]);

    const second = upsertSave(first.saves, 'main', makeState({ level: 200 }), 222);
    expect(second.replaced).toBe(true);
    expect(second.saves).toHaveLength(1);
    expect(second.saves[0].state.level).toBe(200);
    expect(second.saves[0].name).toBe('main');
  });

  it('upsertSave keeps other entries', () => {
    const a = makeSave('a');
    const b = makeSave('b');
    const res = upsertSave([a, b], 'a', makeState({ level: 9 }), 9);
    expect(res.replaced).toBe(true);
    expect(res.saves).toHaveLength(2);
    expect(res.saves[0].state.level).toBe(9);
    expect(res.saves[1]).toEqual(b);
  });

  it('removeSave drops only the named entry', () => {
    const a = makeSave('a');
    const b = makeSave('b');
    expect(removeSave([a, b], 'a')).toEqual([b]);
    expect(removeSave([a, b], 'nope')).toEqual([a, b]);
  });
});

describe('stateEquals', () => {
  it('is true for identical states and false for differing ones', () => {
    expect(stateEquals(makeState(), makeState())).toBe(true);
    expect(stateEquals(makeState(), makeState({ level: 43 }))).toBe(false);
  });
});

describe('resolveStartup', () => {
  it('no link, no local → default', () => {
    expect(resolveStartup({ link: null, local: null })).toEqual({ action: 'default' });
  });

  it('link only → load-url (hash stays until first edit)', () => {
    const st = makeState();
    expect(resolveStartup({ link: st, local: null })).toEqual({ action: 'load-url', state: st });
  });

  it('local only → load-local', () => {
    const st = makeState();
    expect(resolveStartup({ link: null, local: st })).toEqual({ action: 'load-local', state: st });
  });

  it('both, identical → load-url without asking', () => {
    const st = makeState();
    expect(resolveStartup({ link: st, local: makeState() })).toEqual({ action: 'load-url', state: st });
  });

  it('both, different → ask with both states', () => {
    const link = makeState({ level: 10 });
    const local = makeState({ level: 20 });
    expect(resolveStartup({ link, local })).toEqual({ action: 'ask', link, local });
  });
});