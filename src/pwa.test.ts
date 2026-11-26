import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function pngDimensions(path:string):Promise<[number,number]> {
  const png = await readFile(new URL(path, root));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test('PWA manifest references complete standard and maskable icon sets', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');

  const expected = [
    ['icons/icon-192.png', 192, 'any'],
    ['icons/icon-512.png', 512, 'any'],
    ['icons/icon-maskable-512.png', 512, 'maskable']
  ] as const;
  for (const [src, size, purpose] of expected) {
    assert.ok(manifest.icons.some((icon:{src:string;purpose:string}) => icon.src === src && icon.purpose === purpose));
    assert.deepEqual(await pngDimensions(`public/${src}`), [size, size]);
  }
});

test('HTML exposes install metadata and the service worker primes the generated app shell', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const worker = await readFile(new URL('public/sw.js', root), 'utf8');
  const registration = await readFile(new URL('src/registerServiceWorker.ts', root), 'utf8');
  assert.match(html, /rel="manifest" href="%BASE_URL%manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(worker, /primeAppShell/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /__STRAPP_BUILD_ID__/);
  assert.match(worker, /SKIP_WAITING/);
  assert.match(registration, /controllerchange/);
  assert.match(registration, /applyServiceWorkerUpdate/);
});
