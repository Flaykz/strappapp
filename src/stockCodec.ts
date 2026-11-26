import type { Preparation, Stock } from './stock.ts';

const MAX_ITEMS = 500;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function decodePreparation(value: unknown): Preparation | null {
  if (!isObj(value) || typeof value.key !== 'string' || !isObj(value.passes)) return null;
  const entries = Object.entries(value.passes);
  if (entries.length > MAX_ITEMS) return null;
  const passes: Preparation['passes'] = {};
  for (const [index, pass] of entries) {
    if (!/^\d{1,6}$/.test(index) || !isObj(pass) || !isNum(pass.recordedAt) || !Array.isArray(pass.consumed) || pass.consumed.length > MAX_ITEMS) return null;
    const consumed = [];
    for (const c of pass.consumed) {
      if (!isObj(c) || typeof c.rollId !== 'string' || !isNum(c.length) || c.length < 0) return null;
      consumed.push({ rollId: c.rollId, length: c.length });
    }
    passes[index] = { recordedAt: pass.recordedAt, consumed };
  }
  return { key: value.key, passes };
}

/**
 * Validates and rebuilds a stock coming from the local storage or from the server (unknown fields dropped).
 * Widths and lengths of 0 are tolerated: they exist transiently while a number field is being edited.
 */
export function decodeStock(value: unknown): Stock | null {
  if (!isObj(value) || !Array.isArray(value.types) || !Array.isArray(value.rolls) || typeof value.selectedTypeId !== 'string') return null;
  if (value.types.length > MAX_ITEMS || value.rolls.length > MAX_ITEMS) return null;
  if (value.brands !== undefined && (!Array.isArray(value.brands) || value.brands.length > MAX_ITEMS || value.brands.some(brand => typeof brand !== 'string'))) return null;
  const types: Stock['types'] = [];
  for (const t of value.types) {
    if (!isObj(t) || typeof t.id !== 'string' || typeof t.name !== 'string' || (t.brand !== undefined && typeof t.brand !== 'string') || !isNum(t.width) || t.width < 0 || !isNum(t.length) || t.length < 0) return null;
    types.push({ id: t.id, name: t.name, width: t.width, length: t.length, ...(typeof t.brand === 'string'?{brand:t.brand}:{}) });
  }
  const rolls: Stock['rolls'] = [];
  for (const r of value.rolls) {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.typeId !== 'string' || typeof r.name !== 'string' || !isNum(r.remaining) || r.remaining < 0) return null;
    rolls.push({ id: r.id, typeId: r.typeId, name: r.name, remaining: r.remaining });
  }
  if (new Set(types.map(t => t.id)).size !== types.length || new Set(rolls.map(r => r.id)).size !== rolls.length) return null;
  const stock: Stock = { types, rolls, selectedTypeId: value.selectedTypeId, ...(Array.isArray(value.brands)?{brands:[...new Set(value.brands as string[])]}:{}) };
  if (value.preparation !== undefined && value.preparation !== null) {
    // An invalid remote preparation only loses the pass tracking, not the whole stock.
    const preparation = decodePreparation(value.preparation);
    if (preparation) stock.preparation = preparation;
  }
  return stock;
}
