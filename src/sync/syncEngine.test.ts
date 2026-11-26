import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from './syncEngine.ts';
import { appSyncDocs } from './syncDocs.ts';
import { SyncError } from './syncErrors.ts';
import { BACKUP_KEY, META_KEY, PROTOCOL_KEY, STOCK_BACKUP_KEY, STOCK_KEY, STOCK_META_KEY } from './syncMeta.ts';
import type { Remote, SyncApi } from './pbApi.ts';
import type { Protocol } from '../planner.ts';
import type { Stock } from '../stock.ts';

const mk = (length: number): Protocol => ({ sessions: 1, roll: 5, bandWidth: 2.5, boardLength: 43, boardWidth: 23, bands: [{ id: 'a', name: 'A1', length, side: 'both' }] });
const mkStock = (remaining: number): Stock => ({ types: [{ id: 't', name: 'T', width: 4, length: 1000 }], rolls: [{ id: 'r', typeId: 't', name: 'R1', remaining }], selectedTypeId: 't' });
const lengthOf = (data: unknown) => (data as Protocol).bands[0].length;
const remainingOf = (data: unknown) => (data as Stock).rolls[0].remaining;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Par défaut seul le protocole est synchronisé (`calls` et `server.record` concernent la collection `protocols`) ;
// `withStock` ajoute le document stock (collection `stocks`, appels préfixés `stocks:`).
type Meta = { clientUpdatedAt: number; pending: boolean };
type Opts = { remote?: Remote | null; local?: Protocol; meta?: Meta; loggedIn?: boolean; backup?: unknown; withStock?: boolean; stockRemote?: Remote | null; stockLocal?: Stock; stockMeta?: Meta; stockMissing?: boolean };
function setup(opts: Opts = {}) {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  let local = opts.local ?? mk(5);
  let stockLocal = opts.stockLocal ?? mkStock(500);
  store.set(PROTOCOL_KEY, JSON.stringify(local));
  store.set(STOCK_KEY, JSON.stringify(stockLocal));
  if (opts.backup) store.set(BACKUP_KEY, JSON.stringify(opts.backup));
  if (opts.meta) store.set(META_KEY, JSON.stringify(opts.meta));
  if (opts.stockMeta) store.set(STOCK_META_KEY, JSON.stringify(opts.stockMeta));
  const records: Record<string, Remote | null> = { protocols: opts.remote === undefined ? null : opts.remote, stocks: opts.stockRemote === undefined ? null : opts.stockRemote };
  const server = { get record() { return records.protocols; }, set record(r) { records.protocols = r; } };
  const calls: string[] = [];
  const stockCalls: string[] = [];
  const hooks: { updateErrors: SyncError[]; stockUpdateErrors: SyncError[]; beforeCreate?: () => void; duringUpdate?: () => void; duringStockUpdate?: () => void } = { updateErrors: [], stockUpdateErrors: [] };
  let loggedIn = opts.loggedIn ?? true;
  const log = (col: string, name: string) => { if (col === 'protocols') calls.push(name); else stockCalls.push(`stocks:${name}`); };
  const missing = (col: string) => { if (col === 'stocks' && opts.stockMissing) throw new SyncError('unavailable', 'x'); };
  const api: SyncApi = {
    isLoggedIn: () => loggedIn, email: () => 'a@b.c', login: async () => { loggedIn = true; }, logout: () => { loggedIn = false; }, refreshSession: async () => {},
    async fetchRemote(col) { log(col, 'fetch'); missing(col); return records[col]; },
    async create(col, data, at) {
      log(col, 'create'); missing(col);
      if (col === 'protocols') { hooks.beforeCreate?.(); hooks.beforeCreate = undefined; }
      if (records[col]) throw new SyncError('conflict', 'dup');
      return (records[col] = { id: 'r1', data, clientUpdatedAt: at });
    },
    async update(col, id, data, at) {
      log(col, 'update');
      const failure = (col === 'protocols' ? hooks.updateErrors : hooks.stockUpdateErrors).shift();
      if (failure) { if (failure.kind === 'conflict') records[col] = null; throw failure; }
      if (col === 'protocols') { hooks.duringUpdate?.(); hooks.duringUpdate = undefined; }
      else { hooks.duringStockUpdate?.(); hooks.duringStockUpdate = undefined; }
      return (records[col] = { id, data, clientUpdatedAt: at });
    },
  };
  const applied: Protocol[] = [];
  const appliedStock: Stock[] = [];
  let clock = 1000;
  const all = appSyncDocs({ getProtocol: () => local, applyProtocol: p => { applied.push(p); local = p; }, getStock: () => stockLocal, applyStock: s => { appliedStock.push(s); stockLocal = s; } });
  const docs = opts.withStock ? all : all.filter(d => d.name === 'protocol');
  const engine = createSyncEngine({ api, storage, docs, now: () => ++clock, debounceMs: 5 });
  const meta = () => JSON.parse(store.get(META_KEY)!);
  const stockMeta = () => JSON.parse(store.get(STOCK_META_KEY)!);
  return { engine, store, server, records, calls, stockCalls, hooks, applied, appliedStock, meta, stockMeta, expire: () => { loggedIn = false; }, setLocal: (p: Protocol) => { local = p; }, setStockLocal: (s: Stock) => { stockLocal = s; } };
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
  t.hooks.duringUpdate = () => { t.setLocal(mk(7)); t.engine.localChanged('protocol'); };
  await t.engine.resume();
  assert.deepEqual(t.calls.filter(c => c === 'update').length, 2);
  assert.equal(lengthOf(t.server.record!.data), 7);
  assert.equal(t.meta().pending, false);
});

test('debounced upload after a local change when signed in', async () => {
  const t = setup({ remote: { id: 'r1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false } });
  t.setLocal(mk(8)); t.engine.localChanged('protocol');
  assert.equal(t.engine.getState().status, 'pending');
  await sleep(40);
  assert.equal(lengthOf(t.server.record!.data), 8);
  assert.equal(t.engine.getState().status, 'synced');
});

test('signed out: change is recorded as pending locally with no network call', async () => {
  const t = setup({ loggedIn: false });
  t.engine.localChanged('protocol');
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
  t.setLocal(mk(8)); t.engine.localChanged('protocol');
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

// ---- Stock : même mécanique, document et collection séparés ----

test('stock: first sync of a fresh device creates both records; each has its own meta', async () => {
  const t = setup({ withStock: true, meta: { clientUpdatedAt: 50, pending: true }, stockMeta: { clientUpdatedAt: 70, pending: true } });
  await t.engine.resume();
  assert.equal(t.records.protocols?.clientUpdatedAt, 50);
  assert.equal(t.records.stocks?.clientUpdatedAt, 70);
  assert.equal(remainingOf(t.records.stocks!.data), 500);
  assert.deepEqual(t.stockMeta(), { clientUpdatedAt: 70, pending: false });
  assert.deepEqual(t.meta(), { clientUpdatedAt: 50, pending: false });
  assert.equal(t.engine.getState().status, 'synced');
});

test('stock: a local stock change pushes only the stock (debounced), the protocol is not touched', async () => {
  const t = setup({ withStock: true, remote: { id: 'p1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false }, stockRemote: { id: 's1', data: mkStock(500), clientUpdatedAt: 5 }, stockMeta: { clientUpdatedAt: 5, pending: false } });
  t.setStockLocal(mkStock(300)); t.engine.localChanged('stock');
  assert.equal(t.engine.getState().docs.stock?.status, 'pending');
  assert.equal(t.engine.getState().docs.protocol?.status, 'synced');
  await sleep(40);
  assert.equal(remainingOf(t.records.stocks!.data), 300);
  assert.deepEqual(t.calls, []);
  assert.deepEqual(t.stockCalls, ['stocks:fetch', 'stocks:update']);
  assert.equal(t.engine.getState().status, 'synced');
});

test('stock: newer remote stock replaces the local one; the overwritten local copy is saved under its own key', async () => {
  const t = setup({ withStock: true, remote: { id: 'p1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false }, stockRemote: { id: 's1', data: mkStock(100), clientUpdatedAt: 900 }, stockMeta: { clientUpdatedAt: 10, pending: true } });
  await t.engine.resume();
  assert.equal(t.appliedStock[0].rolls[0].remaining, 100);
  assert.equal(t.applied.length, 0);
  const backup = JSON.parse(t.store.get(STOCK_BACKUP_KEY)!);
  assert.equal(backup.stock.rolls[0].remaining, 500);
  assert.equal(t.store.has(BACKUP_KEY), false);
  assert.deepEqual(t.stockMeta(), { clientUpdatedAt: 900, pending: false });
});

test('stock: invalid remote stock is rejected with an error, without blocking the protocol sync', async () => {
  const t = setup({ withStock: true, remote: { id: 'p1', data: mk(9), clientUpdatedAt: 500 }, stockRemote: { id: 's1', data: { types: 'nope' }, clientUpdatedAt: 500 } });
  await t.engine.resume();
  assert.equal(t.applied[0].bands[0].length, 9);
  assert.equal(t.appliedStock.length, 0);
  const s = t.engine.getState();
  assert.equal(s.docs.protocol?.status, 'synced');
  assert.equal(s.docs.stock?.status, 'error');
  assert.match(s.message, /^Stock : .*invalides/);
  t.engine.dispose();
});

test('stock: missing collection fails cleanly with a clear message, the protocol still syncs, no retry is scheduled', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = setup({ withStock: true, stockMissing: true, meta: { clientUpdatedAt: 50, pending: true }, stockMeta: { clientUpdatedAt: 70, pending: true } });
    await t.engine.resume();
    assert.equal(t.records.protocols?.clientUpdatedAt, 50);
    const s = t.engine.getState();
    assert.equal(s.docs.protocol?.status, 'synced');
    assert.equal(s.docs.stock?.status, 'error');
    assert.match(s.docs.stock!.message, /Collection absente du serveur/);
    assert.match(s.message, /^Stock : Collection absente/);
    assert.equal(t.stockMeta().pending, true);
    const before = t.stockCalls.length;
    mock.timers.tick(600_000); await new Promise(r => setImmediate(r));
    assert.equal(t.stockCalls.length, before);
    t.engine.dispose();
  } finally { mock.timers.reset(); }
});

test('stock: a network failure puts the documents offline with a single message; the next resume sends both', async () => {
  const t = setup({ withStock: true, remote: { id: 'p1', data: mk(9), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 10, pending: true }, stockRemote: { id: 's1', data: mkStock(1), clientUpdatedAt: 5 }, stockMeta: { clientUpdatedAt: 10, pending: true } });
  t.hooks.updateErrors = [new SyncError('network', 'x')];
  await t.engine.resume();
  const s = t.engine.getState();
  assert.equal(s.status, 'offline');
  assert.equal(s.message.includes('Stock :'), false);
  assert.equal(t.meta().pending, true);
  assert.equal(t.stockMeta().pending, true);
  await t.engine.resume();
  assert.equal(t.engine.getState().status, 'synced');
  assert.equal(remainingOf(t.records.stocks!.data), 500);
});

test('stock: an edit made while the stock push is in flight stays pending and is pushed next', async () => {
  const t = setup({ withStock: true, stockRemote: { id: 's1', data: mkStock(1), clientUpdatedAt: 5 }, stockMeta: { clientUpdatedAt: 10, pending: true }, stockLocal: mkStock(400), remote: { id: 'p1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false } });
  t.hooks.duringStockUpdate = () => { t.setStockLocal(mkStock(350)); t.engine.localChanged('stock'); };
  await t.engine.resume();
  assert.equal(remainingOf(t.records.stocks!.data), 350);
  assert.equal(t.stockMeta().pending, false);
  assert.equal(t.stockCalls.filter(c => c === 'stocks:update').length, 2);
});

test('stock: expired session sends both documents to signed-out; changes stay pending and go out after login', async () => {
  const t = setup({ withStock: true, remote: { id: 'p1', data: mk(5), clientUpdatedAt: 5 }, meta: { clientUpdatedAt: 5, pending: false }, stockRemote: { id: 's1', data: mkStock(500), clientUpdatedAt: 5 }, stockMeta: { clientUpdatedAt: 5, pending: false } });
  await t.engine.resume();
  t.expire();
  t.setStockLocal(mkStock(10)); t.engine.localChanged('stock');
  const s = t.engine.getState();
  assert.equal(s.status, 'signed-out');
  assert.match(s.message, /reconnecte/);
  assert.equal(t.stockMeta().pending, true);
  assert.equal(t.stockCalls.filter(c => c === 'stocks:update').length, 0);
  await t.engine.login('a@b.c', 'x');
  assert.equal(remainingOf(t.records.stocks!.data), 10);
});
