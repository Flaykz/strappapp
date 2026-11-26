import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeStock } from './stockCodec.ts';

const base = () => ({ types: [{ id: 't', name: 'T', width: 4, length: 1000 }], rolls: [{ id: 'r', typeId: 't', name: 'R1', remaining: 500 }], selectedTypeId: 't' });

test('a valid stock is accepted and rebuilt without unknown fields', () => {
  const decoded = decodeStock({ ...base(), extra: 1, rolls: [{ ...base().rolls[0], junk: true }] });
  assert.deepEqual(decoded, base());
});
test('preparation tracking is decoded', () => {
  const preparation = { key: 'abc', passes: { 0: { recordedAt: 5, consumed: [{ rollId: 'r', length: 40 }] } } };
  assert.deepEqual(decodeStock({ ...base(), preparation })?.preparation, preparation);
  assert.equal(decodeStock({ ...base(), preparation: null })?.preparation, undefined);
});
test('invalid stocks are rejected', () => {
  assert.equal(decodeStock(null), null);
  assert.equal(decodeStock({ ...base(), types: 'x' }), null);
  assert.equal(decodeStock({ ...base(), selectedTypeId: 3 }), null);
  assert.equal(decodeStock({ ...base(), rolls: [{ id: 'r', typeId: 't', name: 'R', remaining: -1 }] }), null);
  assert.equal(decodeStock({ ...base(), rolls: [{ id: 'r', typeId: 't', name: 'R', remaining: Number.NaN }] }), null);
  assert.equal(decodeStock({ ...base(), types: [{ id: 't', name: 'T', width: -1, length: 10 }] }), null);
  assert.equal(decodeStock({ ...base(), rolls: [base().rolls[0], base().rolls[0]] }), null);
});
test('invalid preparation is dropped but types and rolls are kept, including prototype-style keys', () => {
  const dropped = (preparation: unknown) => assert.deepEqual(decodeStock({ ...base(), preparation }), base());
  dropped({ key: 1, passes: {} });
  dropped({ key: 'k', passes: { x: { recordedAt: 1, consumed: [] } } });
  dropped(JSON.parse('{"key":"k","passes":{"__proto__":{"recordedAt":1,"consumed":[]}}}'));
  dropped({ key: 'k', passes: { 0: { recordedAt: 1, consumed: [{ rollId: 'r', length: -3 }] } } });
});
test('a width of 0 (number field being edited) is tolerated', () => {
  assert.notEqual(decodeStock({ ...base(), types: [{ id: 't', name: 'T', width: 0, length: 1000 }] }), null);
});
