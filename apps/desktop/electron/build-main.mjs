/**
 * Bundle the Electron main process and preload with esbuild.
 *
 * Both are emitted as CJS: Electron requires a CommonJS preload when the
 * renderer is sandboxed, and keeping main.ts in the same format avoids a
 * dual-module setup. `electron` stays external (provided at runtime).
 */
import { build } from 'esbuild';
// Imported rather than used as globals: the repo eslint config does not grant
// Node globals to plain .mjs files.
import console from 'node:console';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
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

// Runtime assets (tray template icons) are loaded relative to the bundled
// main process, so they have to sit next to it in dist/. esbuild only emits
// modules; copying is ours to do.
const assetsSrc = path.join(__dirname, 'assets');
if (existsSync(assetsSrc)) {
  const assetsOut = path.join(__dirname, 'dist', 'assets');
  cpSync(assetsSrc, assetsOut, { recursive: true });
  console.log(`  copied assets -> ${path.relative(process.cwd(), assetsOut)}`);
} else {
  console.warn('  no electron/assets directory; tray will fall back to a text-only icon');
}
