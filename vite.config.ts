import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';

function versionServiceWorker():Plugin {
  return {
    name: 'version-service-worker',
    apply: 'build',
    async closeBundle() {
      const output = new URL('./dist/sw.js', import.meta.url);
      const worker = await readFile(output, 'utf8');
      const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile(output, worker.replace('__STRAPP_BUILD_ID__', buildId));
    }
  };
}

export default defineConfig({ plugins: [versionServiceWorker()] });
