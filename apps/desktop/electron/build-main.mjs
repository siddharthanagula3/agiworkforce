/**
 * Bundle the Electron main process and preload with esbuild.
 *
 * Both are emitted as CJS: Electron requires a CommonJS preload when the
 * renderer is sandboxed, and keeping main.ts in the same format avoids a
 * dual-module setup. `electron` stays external (provided at runtime).
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
  outdir: path.join(__dirname, 'dist'),
  outExtension: { '.js': '.cjs' },
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: [path.join(__dirname, 'main.ts'), path.join(__dirname, 'preload.ts')],
});
