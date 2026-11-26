import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, type Protocol } from './planner.ts';
import type { Stock } from './stock.ts';
import { cancelPass, clearPreparation, passRecord, planKey, recordPass, staleCount } from './preparation.ts';

// Plaque 43 x 8 : une seule ligne par passage, donc plusieurs passages à longueurs différentes.
const protocol: Protocol = { sessions: 1, roll: 5, bandWidth: 5, boardLength: 43, boardWidth: 5, bands: [{ id: 'a', name: 'A', length: 10, side: 'both' }, { id: 'b', name: 'B', length: 20, side: 'both' }] };
const p = plan(protocol);
const pass = (i: number) => p.pages[i].map(pl => pl.strip);
const mkStock = (...remaining: number[]): Stock => ({ types: [{ id: 't', name: 'T', width: 5, length: 1000 }], selectedTypeId: 't', rolls: remaining.map((r, i) => ({ id: `r${i}`, typeId: 't', name: `R${i + 1}`, remaining: r })) });
const key = planKey(protocol);
const rec = (s: Stock, i: number) => { const r = recordPass(s, key, pass(i), i, 100 + i); assert.equal(r.ok, true); return (r as { stock: Stock }).stock; };

test('plan fixture has several passes', () => assert.ok(p.pages.length >= 2));

test('recording a pass deducts only its lines and stores what was taken', () => {
  const s = mkStock(1000);
  const next = rec(s, 0);
  const taken = pass(0).reduce((n, st) => n + st.length, 0);
  assert.equal(next.rolls[0].remaining, 1000 - taken);
  assert.deepEqual(passRecord(next, key, 0), { recordedAt: 100, consumed: [{ rollId: 'r0', length: taken }] });
  assert.equal(passRecord(next, key, 1), undefined);
  assert.equal(s.rolls[0].remaining, 1000, 'input is not mutated');
});

test('no double counting: a recorded pass cannot be recorded again, even after a reload of the same stock', () => {
  const once = rec(mkStock(1000), 0);
  const again = recordPass(once, key, pass(0), 0, 999);
  assert.deepEqual(again, { ok: false, reason: 'already', missing: 0 });
  // same state coming back through JSON (page reload / sync pull)
  const reloaded = JSON.parse(JSON.stringify(once)) as Stock;
  assert.equal(recordPass(reloaded, key, pass(0), 0, 999).ok, false);
});

test('adjusting a roll remainder does not change the tracking', () => {
  const once = rec(mkStock(1000), 0);
  const adjusted = { ...once, rolls: once.rolls.map(r => ({ ...r, remaining: r.remaining + 7 })) };
  assert.ok(passRecord(adjusted, key, 0));
  assert.equal(planKey(protocol), key);
});

test('a later pass is allocated against the stock left by the passes recorded before', () => {
  const need0 = pass(0).reduce((n, st) => n + st.length, 0), need1 = pass(1).reduce((n, st) => n + st.length, 0);
  const s = mkStock(need0 + need1 - 1);
  const afterFirst = rec(s, 0);
  const second = recordPass(afterFirst, key, pass(1), 1, 5);
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.reason, 'missing');
  const enough = rec(rec(mkStock(need0 + need1), 0), 1);
  assert.equal(enough.rolls[0].remaining, 0);
  assert.deepEqual(Object.keys(enough.preparation!.passes), ['0', '1']);
});

test('cancel gives back exactly the consumed lengths to the same rolls', () => {
  const s = mkStock(1000, 15);
  const once = rec(s, 0);
  const result = cancelPass(once, key, 0)!;
  assert.deepEqual(result.lost, []);
  assert.deepEqual(result.stock.rolls, s.rolls);
  assert.equal(passRecord(result.stock, key, 0), undefined);
  assert.equal(cancelPass(result.stock, key, 0), null, 'cancelling twice does nothing');
});

test('cancel returns the lengths to the original roll even if another roll is now fitter', () => {
  const need0 = pass(0).reduce((n, st) => n + st.length, 0);
  const once = rec(mkStock(500, need0 + 1000), 0);
  const consumedRoll = passRecord(once, key, 0)!.consumed[0].rollId;
  const edited = { ...once, rolls: once.rolls.map(r => r.id === consumedRoll ? r : { ...r, remaining: 1 }) };
  const back = cancelPass(edited, key, 0)!.stock;
  assert.equal(back.rolls.find(r => r.id === consumedRoll)!.remaining, once.rolls.find(r => r.id === consumedRoll)!.remaining + need0);
});

test('cancel with a roll removed in the meantime reports it and still cancels', () => {
  const once = rec(mkStock(1000), 0);
  const without = { ...once, rolls: [] };
  const result = cancelPass(without, key, 0)!;
  assert.equal(result.lost.length, 1);
  assert.equal(result.lost[0].rollId, 'r0');
  assert.equal(result.stock.rolls.length, 0);
  assert.equal(passRecord(result.stock, key, 0), undefined);
});

test('fingerprint: protocol, roll width or board changes start a new preparation; names do not', () => {
  assert.notEqual(planKey({ ...protocol, sessions: 2 }), key);
  assert.notEqual(planKey({ ...protocol, roll: 6 }), key);
  assert.notEqual(planKey({ ...protocol, boardLength: 40 }), key);
  assert.notEqual(planKey({ ...protocol, bands: [protocol.bands[1], protocol.bands[0]] }), key);
  assert.equal(planKey({ ...protocol, bands: protocol.bands.map(b => ({ ...b, name: 'renamed' })) }), key);
});

test('changed fingerprint: old passes are not tracked but stay deducted, are counted as stale, and recording restarts the tracking', () => {
  const once = rec(mkStock(1000), 0);
  const changed = planKey({ ...protocol, sessions: 2 });
  assert.equal(staleCount(once, changed), 1);
  assert.equal(staleCount(once, key), 0);
  assert.equal(passRecord(once, changed, 0), undefined, 'button available again for the new plan');
  assert.equal(cancelPass(once, changed, 0), null);
  const p2 = plan({ ...protocol, sessions: 2 });
  const r = recordPass(once, changed, p2.pages[0].map(pl => pl.strip), 0, 7);
  assert.equal(r.ok, true);
  const next = (r as { stock: Stock }).stock;
  assert.equal(next.preparation!.key, changed);
  assert.deepEqual(Object.keys(next.preparation!.passes), ['0']);
  assert.ok(next.rolls[0].remaining < once.rolls[0].remaining, 'old pass consumption was kept');
  assert.equal(staleCount(next, changed), 0);
  assert.equal(clearPreparation(once).preparation, undefined);
});

test('an empty or unsatisfiable pass is refused without changing the stock', () => {
  assert.deepEqual(recordPass(mkStock(1000), key, [], 0, 1), { ok: false, reason: 'empty', missing: 0 });
  const r = recordPass(mkStock(1), key, pass(0), 0, 1);
  assert.equal(r.ok, false);
});

test('tracking survives a JSON round trip (stock sync) and keeps exact decimals', () => {
  const s = { ...mkStock(100.1) };
  const strips = [{ length: 0.2, segments: [], pieces: [] }];
  const r = recordPass(s, key, strips, 3, 1) as { ok: true; stock: Stock };
  const back = cancelPass(JSON.parse(JSON.stringify(r.stock)), key, 3)!;
  assert.equal(back.stock.rolls[0].remaining, 100.1);
});
