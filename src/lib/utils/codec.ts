import { DEFAULT_ASSUMPTIONS, type PlannerAssumptions } from '../planner/rules';
import { PERK_BY_ID } from '../data/legendaryPerks';

export type Faction = 'human' | 'ghoul';

export interface AppState {
  level: number;
  slots: number;
  coins: number;
  /** card ids in priority order */
  order: string[];
  /** remembered rank per card id (persists when cards are swapped or removed) */
  ranks: Record<string, number>;
  assumptions: PlannerAssumptions;
  faction: Faction;
}

const VERSION = 2;

/** v2 wire: [level, slots, coins, order[], ranks{}, assumptions(pick, pack, bonus), faction] */
type Wire2 = [number, number, number, string[], Record<string, number>, [number, number, number], number];

/** v1 wire: [level, slots, coins, cards[[id, rank]], assumptions] */
type Wire1 = [number, number, number, Array<[string, number]>, [number, number, number]];

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64urlDecode(s: string): Uint8Array {
  let b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeState(state: AppState): string {
  const wire: Wire2 = [
    state.level,
    state.slots,
    state.coins,
    state.order,
    state.ranks,
    [state.assumptions.coinsPerPick, state.assumptions.coinsPerPack, state.assumptions.level50Bonus],
    state.faction === 'ghoul' ? 1 : 0,
  ];
  return base64urlEncode(new TextEncoder().encode(JSON.stringify([VERSION, wire])));
}

export function decodeState(hash: string): AppState | null {
  try {
    const raw = hash.startsWith('#s=') ? hash.slice(3) : hash;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64urlDecode(raw)));
    if (!Array.isArray(parsed)) return null;
    if (parsed[0] === 1) return migrateV1(parsed[1]);
    if (parsed[0] !== VERSION) return null;
    const wire = parsed[1] as Wire2;
    if (!Array.isArray(wire) || wire.length !== 7) return null;
    const [level, slots, coins, order, ranks, assump, faction] = wire;
    if (!Array.isArray(order) || !assumpArrayOk(assump) || typeof ranks !== 'object' || ranks === null) return null;
    return {
      level: numOr(level, 1),
      slots: numOr(slots, 0),
      coins: numOr(coins, 0),
      order: order.filter((id) => typeof id === 'string' && PERK_BY_ID.has(id)),
      ranks: sanitizeRanks(ranks as Record<string, unknown>),
      assumptions: assumptionsFrom(assump),
      faction: faction === 1 ? 'ghoul' : 'human',
    };
  } catch {
    return null;
  }
}

function migrateV1(wire: unknown): AppState | null {
  if (!Array.isArray(wire) || wire.length !== 5) return null;
  const [level, slots, coins, cardList, assump] = wire as Wire1;
  if (!Array.isArray(cardList) || !assumpArrayOk(assump)) return null;
  const order: string[] = [];
  const ranks: Record<string, number> = {};
  for (const c of cardList) {
    if (!Array.isArray(c) || typeof c[0] !== 'string' || !PERK_BY_ID.has(c[0])) continue;
    order.push(c[0]);
    ranks[c[0]] = numOr(c[1], 1);
  }
  return {
    level: numOr(level, 1),
    slots: numOr(slots, 0),
    coins: numOr(coins, 0),
    order,
    ranks,
    assumptions: assumptionsFrom(assump),
    faction: 'human',
  };
}

const numOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function assumpArrayOk(a: unknown): boolean {
  return Array.isArray(a) && a.length === 3;
}

function assumptionsFrom(a: [number, number, number]): PlannerAssumptions {
  return {
    coinsPerPick: numOr(a[0], DEFAULT_ASSUMPTIONS.coinsPerPick),
    coinsPerPack: numOr(a[1], DEFAULT_ASSUMPTIONS.coinsPerPack),
    level50Bonus: numOr(a[2], DEFAULT_ASSUMPTIONS.level50Bonus),
  };
}

function sanitizeRanks(ranks: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    if (PERK_BY_ID.has(id)) out[id] = clampRank(numOr(rank, 1));
  }
  return out;
}

export function clampRank(rank: number): number {
  return Math.min(4, Math.max(1, Math.floor(rank) || 1));
}
