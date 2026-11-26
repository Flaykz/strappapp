import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from './syncDecision.ts';
import type { Protocol } from '../planner.ts';

const proto: Protocol = { sessions: 1, roll: 5, bandWidth: 2.5, boardLength: 43, boardWidth: 23, bands: [{ id: 'a', name: 'A1', length: 5, side: 'both' }] };
const remote = (clientUpdatedAt: number, data: unknown = proto) => ({ id: 'r1', data, clientUpdatedAt });

test('no remote record: create', () => {
  assert.deepEqual(decide({ clientUpdatedAt: 5, pending: false }, null), { action: 'create' });
});
test('remote newer: pull the decoded protocol', () => {
  assert.deepEqual(decide({ clientUpdatedAt: 5, pending: false }, remote(10)), { action: 'pull', protocol: proto });
});
test('remote newer than pending local: remote still wins (caller backs up the local copy)', () => {
  assert.equal(decide({ clientUpdatedAt: 5, pending: true }, remote(10)).action, 'pull');
});
test('local newer: push', () => {
  assert.deepEqual(decide({ clientUpdatedAt: 10, pending: false }, remote(5)), { action: 'push' });
});
test('pending with equal timestamps: push', () => {
  assert.deepEqual(decide({ clientUpdatedAt: 10, pending: true }, remote(10)), { action: 'push' });
});
test('equal timestamps and nothing pending: noop', () => {
  assert.deepEqual(decide({ clientUpdatedAt: 10, pending: false }, remote(10)), { action: 'noop' });
});
test('never-modified local device takes a remote record', () => {
  assert.equal(decide({ clientUpdatedAt: 0, pending: false }, remote(1)).action, 'pull');
});
test('invalid remote data is never applied; overwritten only when local was modified', () => {
  assert.deepEqual(decide({ clientUpdatedAt: 0, pending: false }, remote(99, { bands: 'x' })), { action: 'invalid-remote' });
  assert.deepEqual(decide({ clientUpdatedAt: 3, pending: false }, remote(99, null)), { action: 'push' });
});
test('non numeric remote timestamp is treated as 0', () => {
  assert.equal(decide({ clientUpdatedAt: 1, pending: false }, remote(Number.NaN)).action, 'push');
});
