import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientResponseError } from 'pocketbase';
import { toSyncError } from './pbApi.ts';

const http = (status: number) => new ClientResponseError({ status, response: { message: 'Missing collection context.' } });

test('404 on list or create means the collection does not exist: unavailable, not retried as a conflict', () => {
  assert.equal(toSyncError(http(404), 'list').kind, 'unavailable');
  assert.equal(toSyncError(http(404), 'create').kind, 'unavailable');
});
test('404 on update stays a conflict (record deleted), 400 on create a conflict (unique owner)', () => {
  assert.equal(toSyncError(http(404), 'update').kind, 'conflict');
  assert.equal(toSyncError(http(400), 'create').kind, 'conflict');
});
test('403 is never a session error: list is unavailable (missing collection), a refused write is a server error', () => {
  assert.equal(toSyncError(http(403), 'list').kind, 'unavailable');
  assert.equal(toSyncError(http(403), 'create').kind, 'server');
  assert.equal(toSyncError(http(403), 'update').kind, 'server');
  assert.equal(toSyncError(http(403)).kind, 'server');
});
test('other statuses keep their meaning', () => {
  assert.equal(toSyncError(http(0), 'list').kind, 'network');
  assert.equal(toSyncError(http(401), 'list').kind, 'auth');
  assert.equal(toSyncError(http(500), 'list').kind, 'server');
});
