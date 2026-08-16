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

const assetsSrc = path.join(__dirname, 'assets');
if (existsSync(assetsSrc)) {
  const assetsOut = path.join(__dirname, 'dist', 'assets');
  cpSync(assetsSrc, assetsOut, { recursive: true });
  console.log(`  copied assets -> ${path.relative(process.cwd(), assetsOut)}`);
} else {
  console.warn('  no electron/assets directory; tray will fall back to a text-only icon');
}
