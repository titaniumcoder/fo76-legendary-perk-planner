import { decodeState, encodeState, type AppState } from '../utils/codec';

/**
 * Local-first persistence: the working state lives in localStorage, the URL is
 * only written on demand (Share). Framework-free so tests can inject storage.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface NamedSave {
  name: string;
  state: AppState;
  savedAt: number;
}

/** localStorage key of the autosaved working state (encoded `#s=` wire). */
export const CURRENT_KEY = 'fo76-perk-current';
/** localStorage key of the named-save list (JSON). */
export const SAVES_KEY = 'fo76-perk-saves';

/** states are equal iff their canonical encoded wires match */
export function stateEquals(a: AppState, b: AppState): boolean {
  return encodeState(a) === encodeState(b);
}

// --- autosaved working state -------------------------------------------------

export function loadCurrent(s: StorageLike): AppState | null {
  try {
    const raw = s.getItem(CURRENT_KEY);
    if (!raw) return null;
    return decodeState(raw);
  } catch {
    return null;
  }
}

export function saveCurrent(s: StorageLike, state: AppState): boolean {
  try {
    s.setItem(CURRENT_KEY, encodeState(state));
    return true;
  } catch {
    return false;
  }
}

// --- named saves -------------------------------------------------------------

export function loadSaves(s: StorageLike): NamedSave[] {
  try {
    const raw = s.getItem(SAVES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: NamedSave[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== 'object') continue;
      const { name, savedAt, state } = e as Partial<NamedSave>;
      const decoded = typeof state === 'string' ? decodeState(state) : null;
      if (typeof name !== 'string' || !name.trim() || !decoded) continue;
      out.push({ name, state: decoded, savedAt: typeof savedAt === 'number' ? savedAt : 0 });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveSaves(s: StorageLike, saves: NamedSave[]): boolean {
  try {
    s.setItem(SAVES_KEY, JSON.stringify(saves.map((v) => ({ name: v.name, savedAt: v.savedAt, state: encodeState(v.state) }))));
    return true;
  } catch {
    return false;
  }
}

/** pure: insert or replace by (trimmed) name; reports whether an entry was replaced */
export function upsertSave(
  saves: NamedSave[],
  name: string,
  state: AppState,
  now = Date.now(),
): { saves: NamedSave[]; replaced: boolean } {
  const trimmed = name.trim();
  const entry: NamedSave = { name: trimmed, state, savedAt: now };
  const existing = saves.some((sv) => sv.name === trimmed);
  return {
    saves: existing ? saves.map((sv) => (sv.name === trimmed ? entry : sv)) : [...saves, entry],
    replaced: existing,
  };
}

/** pure: drop the save with this name */
export function removeSave(saves: NamedSave[], name: string): NamedSave[] {
  return saves.filter((sv) => sv.name !== name);
}

// --- startup resolution ------------------------------------------------------

export type StartupResolution =
  | { action: 'default' }
  | { action: 'load-url'; state: AppState }
  | { action: 'load-local'; state: AppState }
  | { action: 'ask'; link: AppState; local: AppState };

/**
 * Decide what to load at startup:
 * - neither link nor local state → defaults
 * - only one of them → load it
 * - both, identical → load the link (hash stays until the first edit)
 * - both, different → ask: use the local state, or load the link (overwriting
 *   the local state with it)
 */
export function resolveStartup(input: { link: AppState | null; local: AppState | null }): StartupResolution {
  const { link, local } = input;
  if (!link && !local) return { action: 'default' };
  if (link && !local) return { action: 'load-url', state: link };
  if (!link && local) return { action: 'load-local', state: local };
  return stateEquals(link!, local!) ? { action: 'load-url', state: link! } : { action: 'ask', link: link!, local: local! };
}