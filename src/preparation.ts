import type { Protocol, Strip } from './planner.ts';
import { consumptionOf, type PassRecord, type Stock } from './stock.ts';

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Stable fingerprint of what determines the cutting plan (protocol with the effective roll width, board).
 * Band names do not change the plan, so they are left out. Roll remainders are not part of it either.
 */
export function planKey(p: Protocol): string {
  const text = JSON.stringify([p.sessions, p.roll,p.boardLength, p.boardWidth, p.bands.map(b => [b.id, b.length, b.side, !!b.fullWidth])]);
  // cyrb53: compact 53-bit hash, plenty to tell two plans apart.
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Recorded passes of the preparation matching `key` (none if the plan changed since). */
export function recordedPasses(stock: Stock, key: string): Record<string, PassRecord> {
  return stock.preparation?.key === key ? stock.preparation.passes : {};
}
export function passRecord(stock: Stock, key: string, index: number): PassRecord | undefined {
  const passes = recordedPasses(stock, key);
  return Object.hasOwn(passes, index) ? passes[index] : undefined;
}
/** Number of recorded passes of an older plan: still deducted from the stock, but no longer tracked. */
export function staleCount(stock: Stock, key: string): number {
  return stock.preparation && stock.preparation.key !== key ? Object.keys(stock.preparation.passes).length : 0;
}
export function clearPreparation(stock: Stock): Stock {
  const { preparation: _dropped, ...rest } = stock;
  return rest;
}

export type RecordResult = { ok: true; stock: Stock } | { ok: false; reason: 'already' | 'empty' | 'missing'; missing: number };

/**
 * Deducts the lines of one pass from the rolls. The stock given already reflects the passes recorded before,
 * so the allocation naturally accounts for them. A pass is recorded once: a second call is refused.
 * If the plan changed, the tracking restarts from this pass (older passes stay deducted).
 */
export function recordPass(stock: Stock, key: string, strips: Strip[], index: number, now: number): RecordResult {
  if (passRecord(stock, key, index)) return { ok: false, reason: 'already', missing: 0 };
  const { consumed, missing } = consumptionOf(strips, stock);
  if (missing.length) return { ok: false, reason: 'missing', missing: missing.length };
  if (!consumed.length) return { ok: false, reason: 'empty', missing: 0 };
  const taken = new Map(consumed.map(c => [c.rollId, c.length]));
  const rolls = stock.rolls.map(r => taken.has(r.id) ? { ...r, remaining: Math.max(0, round6(r.remaining - taken.get(r.id)!)) } : r);
  const passes = { ...recordedPasses(stock, key), [index]: { recordedAt: now, consumed: consumed.map(({ rollId, length }) => ({ rollId, length })) } };
  return { ok: true, stock: { ...stock, rolls, preparation: { key, passes } } };
}

/**
 * Gives back exactly the recorded lengths to the same rolls. A roll removed in the meantime is reported in `lost`
 * (its length cannot be restored) and the cancellation still goes through. Null if the pass is not recorded.
 */
export function cancelPass(stock: Stock, key: string, index: number): { stock: Stock; lost: { rollId: string; length: number }[] } | null {
  const record = passRecord(stock, key, index);
  if (!record) return null;
  const known = new Set(stock.rolls.map(r => r.id));
  const lost = record.consumed.filter(c => !known.has(c.rollId));
  const back = new Map(record.consumed.map(c => [c.rollId, c.length]));
  const rolls = stock.rolls.map(r => back.has(r.id) ? { ...r, remaining: round6(r.remaining + back.get(r.id)!) } : r);
  const passes = { ...recordedPasses(stock, key) };
  delete passes[index];
  return { stock: { ...stock, rolls, preparation: { key, passes } }, lost };
}
