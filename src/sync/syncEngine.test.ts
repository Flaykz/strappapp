import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from './syncEngine.ts';
import { SyncError } from './syncErrors.ts';
import { BACKUP_KEY, META_KEY, PROTOCOL_KEY } from './syncMeta.ts';
import type { Remote, SyncApi } from './pbApi.ts';
import type { Protocol } from '../planner.ts';

const mk = (length: number): Protocol => ({ sessions: 1, roll: 5, bandWidth: 2.5, boardLength: 43, boardWidth: 23, bands: [{ id: 'a', name: 'A1', length, side: 'both' }] });
const lengthOf = (data: unknown) => (data as Protocol).bands[0].length;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function setup(opts: { remote?: Remote | null; local?: Protocol; meta?: { clientUpdatedAt: number; pending: boolean }; loggedIn?: boolean; backup?: unknown } = {}) {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  let local = opts.local ?? mk(5);
  store.set(PROTOCOL_KEY, JSON.stringify(local));
  if (opts.backup) store.set(BACKUP_KEY, JSON.stringify(opts.backup));
  if (opts.meta) store.set(META_KEY, JSON.stringify(opts.meta));
  const server = { record: opts.remote === undefined ? null : opts.remote };
  const calls: string[] = [];
  const hooks: { updateErrors: SyncError[]; beforeCreate?: () => void; duringUpdate?: () => void } = { updateErrors: [] };
  let loggedIn = opts.loggedIn ?? true;
  const api: SyncApi = {
    isLoggedIn: () => loggedIn, email: () => 'a@b.c', login: async () => { loggedIn = true; }, logout: () => { loggedIn = false; }, refreshSession: async () => {},
    async fetchRemote() { calls.push('fetch'); return server.record; },
    async create(data, at) {
      calls.push('create');
      hooks.beforeCreate?.(); hooks.beforeCreate = undefined;
      if (server.record) throw new SyncError('conflict', 'dup');
      return (server.record = { id: 'r1', data, clientUpdatedAt: at });
    },
    async update(id, data, at) {
      calls.push('update');
      const failure = hooks.updateErrors.shift();
      if (failure) { if (failure.kind === 'conflict') server.record = null; throw failure; }
      hooks.duringUpdate?.(); hooks.duringUpdate = undefined;
      return (server.record = { id, data, clientUpdatedAt: at });
    },
  };
  const applied: Protocol[] = [];
  let clock = 1000;
  const engine = createSyncEngine({ api, storage, getProtocol: () => local, applyRemote: p => { applied.push(p); local = p; }, now: () => ++clock, debounceMs: 5 });
  const meta = () => JSON.parse(store.get(META_KEY)!);
  return { engine, store, server, calls, hooks, applied, meta, expire: () => { loggedIn = false; }, setLocal: (p: Protocol) => { local = p; } };
}

test('no remote record: creates it and ends synced', async () => {
  const t = setup({ meta: { clientUpdatedAt: 50, pending: true } });
  await t.engine.resume();
  assert.equal(t.server.record?.clientUpdatedAt, 50);
  assert.equal(t.engine.getState().status, 'synced');
});

test('remote newer replaces local and keeps a backup of the overwritten pending local copy', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 500 }, meta: { clientUpdatedAt: 10, pending: true } });
  await t.engine.resume();
  assert.equal(t.applied[0].bands[0].length, 9);
  const backup = JSON.parse(t.store.get(BACKUP_KEY)!);
  assert.equal(typeof backup.savedAt, 'number');
  assert.equal(backup.protocol.bands[0].length, 5);
  assert.deepEqual(t.meta(), { clientUpdatedAt: 500, pending: false });
  assert.equal(t.calls.includes('update'), false);
});

test('invalid remote data is not applied and surfaces an error', async () => {
  const t = setup({ remote: { id: 'r1', data: { nope: 1 }, clientUpdatedAt: 500 } });
  await t.engine.resume();
  assert.equal(t.applied.length, 0);
  assert.equal(t.engine.getState().status, 'error');
  t.engine.dispose();
});

test('local newer: update is sent', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true }, local: mk(6) });
  await t.engine.resume();
  assert.deepEqual(t.calls, ['fetch', 'update']);
  assert.equal(lengthOf(t.server.record!.data), 6);
});

test('create conflict (two devices): refetch then newest wins via update', async () => {
  const t = setup({ meta: { clientUpdatedAt: 100, pending: true }, local: mk(6) });
  t.hooks.beforeCreate = () => { t.server.record = { id: 'r1', data: mk(9), clientUpdatedAt: 50 }; };
  await t.engine.resume();
  assert.deepEqual(t.calls, ['fetch', 'create', 'fetch', 'update']);
  assert.equal(t.server.record!.clientUpdatedAt, 100);
  assert.equal(t.engine.getState().status, 'synced');
});

test('create conflict where the other device is newer: remote is pulled', async () => {
  const t = setup({ meta: { clientUpdatedAt: 100, pending: true } });
  t.hooks.beforeCreate = () => { t.server.record = { id: 'r1', data: mk(9), clientUpdatedAt: 900 }; };
  await t.engine.resume();
  assert.equal(t.applied[0].bands[0].length, 9);
});

test('network failure keeps changes pending and goes offline; next resume retries', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true } });
  t.hooks.updateErrors = [new SyncError('network', 'x')];
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'offline');
  assert.equal(t.meta().pending, true);
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'synced');
  assert.equal(t.meta().pending, false);
});

test('a local edit made while a push is in flight stays pending and is pushed next', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true }, local: mk(6) });
  t.hooks.duringUpdate = () => { t.setLocal(mk(7)); t.engine.localChanged(); };
  await t.engine.resume();
  assert.deepEqual(t.calls.filter(c => c === 'update').length, 2);
  assert.equal(lengthOf(t.server.record!.data), 7);
  assert.equal(t.meta().pending, false);
});

test('debounced upload after a local change when signed in', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false } });
  t.setLocal(mk(8)); t.engine.localChanged();
  assert.equal(t.engine.getState().status, 'pending');
  await sleep(40);
  assert.equal(lengthOf(t.server.record!.data), 8);
  assert.equal(t.engine.getState().status, 'synced');
});

test('signed out: change is recorded as pending locally with no network call', async () => {
  const t = setup({ loggedIn: false });
  t.engine.localChanged();
  await sleep(20);
  assert.deepEqual(t.calls, []);
  assert.equal(t.meta().pending, true);
});

test('backup: first pull on a never-synced device saves the pre-sync local data', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 500 } });
  await t.engine.resume();
  assert.equal(JSON.parse(t.store.get(BACKUP_KEY)!).protocol.bands[0].length, 5);
});

test('backup: no copy when local has no own changes, or when it equals the remote', async () => {
  const synced = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 500 }, meta: { clientUpdatedAt: 10, pending: false } });
  await synced.engine.resume();
  assert.equal(synced.store.has(BACKUP_KEY), false);
  const same = setup({ remote: { id: 'r1', data: mk(5), clientUpdatedAt: 500 }, meta: { clientUpdatedAt: 10, pending: true } });
  await same.engine.resume();
  assert.equal(same.store.has(BACKUP_KEY), false);
});

test('backup: an existing copy younger than 24 h is kept, an older one is replaced', async () => {
  const recent = { savedAt: 1000 - 3600_000, protocol: mk(1) };
  const a = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 500 }, meta: { clientUpdatedAt: 10, pending: true }, backup: recent });
  await a.engine.resume();
  assert.deepEqual(JSON.parse(a.store.get(BACKUP_KEY)!), recent);
  const b = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 500 }, meta: { clientUpdatedAt: 10, pending: true }, backup: { savedAt: 1000 - 25 * 3600_000, protocol: mk(1) } });
  await b.engine.resume();
  assert.equal(JSON.parse(b.store.get(BACKUP_KEY)!).protocol.bands[0].length, 5);
});

test('expired session: change goes signed-out with a message, stays pending and is sent after login', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false } });
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'synced');
  t.expire();
  t.setLocal(mk(8)); t.engine.localChanged();
  assert.equal(t.engine.getState().status, 'signed-out');
  assert.match(t.engine.getState().message, /reconnecte/);
  assert.equal(t.meta().pending, true);
  assert.equal(t.calls.filter(c => c === 'update').length, 0);
  await t.engine.login('a@b.c', 'x');
  assert.equal(lengthOf(t.server.record!.data), 8);
  assert.equal(t.engine.getState().status, 'synced');
});

test('session expiring between two syncs: resume reports signed-out instead of staying synced', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false } });
  await t.engine.resume();
  t.expire();
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'signed-out');
  assert.match(t.engine.getState().message, /reconnecte/);
});

test('a 401 during a cycle ends signed-out with a reconnect message', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true } });
  t.hooks.updateErrors = [new SyncError('auth', 'x')];
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'signed-out');
  assert.match(t.engine.getState().message, /reconnecte/);
  assert.equal(t.meta().pending, true);
});

test('update on a deleted record (404 as conflict): refetch finds nothing, record is re-created', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true }, local: mk(6) });
  t.hooks.updateErrors = [new SyncError('conflict', 'gone')];
  await t.engine.resume();
  assert.deepEqual(t.calls, ['fetch', 'update', 'fetch', 'create']);
  assert.equal(lengthOf(t.server.record!.data), 6);
  assert.equal(t.engine.getState().status, 'synced');
});

test('create refused (400) with nothing to refetch: distinct message, not a conflict', async () => {
  const t = setup({ meta: { clientUpdatedAt: 100, pending: true } });
  t.hooks.beforeCreate = () => { throw new SyncError('conflict', 'bad request'); };
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'error');
  assert.match(t.engine.getState().message, /refusées par le serveur/);
  t.engine.dispose();
});

test('retry: failures reschedule with 30 s, 60 s, 2 min, 5 min backoff (capped); success resets', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true } });
    const flush = () => new Promise(r => setImmediate(r));
    t.hooks.updateErrors = [1, 2, 3, 4, 5].map(() => new SyncError('network', 'x'));
    await t.engine.resume();
    const updates = () => t.calls.filter(c => c === 'update').length;
    assert.equal(updates(), 1);
    for (const [ms, expected] of [[29_999, 1], [1, 2], [59_999, 2], [1, 3], [119_999, 3], [1, 4], [299_999, 4], [1, 5]] as const) {
      mock.timers.tick(ms); await flush();
      assert.equal(updates(), expected, 'after +' + ms);
    }
    // le 5e échec reprogramme à 5 min (plafond) ; cette reprise réussit
    mock.timers.tick(300_000); await flush();
    assert.equal(updates(), 6);
    assert.equal(t.engine.getState().status, 'synced');
    mock.timers.tick(600_000); await flush();
    assert.equal(updates(), 6);
    t.engine.dispose();
  } finally { mock.timers.reset(); }
});

test('retry: logout cancels it; a manual resume cancels it and resets the backoff; dispose cancels it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const flush = () => new Promise(r => setImmediate(r));
    const mkFailing = () => {
      const t = setup({ remote: { id: 'r1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true } });
      t.hooks.updateErrors = [new SyncError('server', 'x')];
      return t;
    };
    const a = mkFailing();
    await a.engine.resume();
    assert.equal(a.engine.getState().status, 'error');
    a.engine.logout();
    mock.timers.tick(600_000); await flush();
    assert.equal(a.calls.filter(c => c === 'update').length, 1);
    const b = mkFailing();
    await b.engine.resume();
    await b.engine.resume();
    assert.equal(b.engine.getState().status, 'synced');
    mock.timers.tick(600_000); await flush();
    assert.equal(b.calls.filter(c => c === 'update').length, 2);
    const c = mkFailing();
    await c.engine.resume();
    c.engine.dispose();
    mock.timers.tick(600_000); await flush();
    assert.equal(c.calls.filter(x => x === 'update').length, 1);
  } finally { mock.timers.reset(); }
});
