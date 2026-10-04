import { DEFAULT_ASSUMPTIONS, type PlannerAssumptions, type PlannerCard } from '../planner/planner';

export interface AppState {
  level: number;
  slots: number;
  coins: number;
  cards: PlannerCard[];
  assumptions: PlannerAssumptions;
}

const VERSION = 1;

/** compact wire format: [level, slots, coins, cards, assumptions(pick, pack, bonus)] */
type Wire = [number, number, number, Array<[string, number]>, [number, number, number]];

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
  const wire: Wire = [
    state.level,
    state.slots,
    state.coins,
    state.cards.map((c) => [c.id, c.rank]),
    [state.assumptions.coinsPerPick, state.assumptions.coinsPerPack, state.assumptions.level50Bonus],
  ];
  return base64urlEncode(new TextEncoder().encode(JSON.stringify([VERSION, wire])));
}

export function decodeState(hash: string): AppState | null {
  try {
    const raw = hash.startsWith('#s=') ? hash.slice(3) : hash;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64urlDecode(raw)));
    if (!Array.isArray(parsed) || parsed[0] !== VERSION) return null;
    const wire = parsed[1] as Wire;
    if (!Array.isArray(wire) || wire.length !== 5) return null;
    const [level, slots, coins, cardList, assump] = wire;
    if (!Array.isArray(cardList) || !Array.isArray(assump)) return null;
    return {
      level: Number(level) || 1,
      slots: Number(slots) || 0,
      coins: Number(coins) || 0,
      cards: cardList
        .filter((c) => Array.isArray(c) && typeof c[0] === 'string')
        .map((c) => ({ id: String(c[0]), rank: Number(c[1]) || 1 })),
      assumptions: {
        coinsPerPick: numOr(assump[0], DEFAULT_ASSUMPTIONS.coinsPerPick),
        coinsPerPack: numOr(assump[1], DEFAULT_ASSUMPTIONS.coinsPerPack),
        level50Bonus: numOr(assump[2], DEFAULT_ASSUMPTIONS.level50Bonus),
      },
    };
  } catch {
    return null;
  }
}

const numOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
