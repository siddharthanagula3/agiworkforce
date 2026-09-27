import { build } from 'esbuild';
// Imported rather than used as globals: the repo eslint config does not grant
// Node globals to plain .mjs files.
import console from 'node:console';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readShellTokens } from './shellTokens.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shellTokens = readShellTokens(path.join(__dirname, '..', '..', '..'));

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
  define: {
    AGI_PAGE_BACKGROUND_LIGHT: JSON.stringify(shellTokens.pageBackgroundLight),
    AGI_PAGE_BACKGROUND_DARK: JSON.stringify(shellTokens.pageBackgroundDark),
    AGI_TITLE_STRIP_HEIGHT: JSON.stringify(shellTokens.titleStripHeight),
  },
};

await build({
  ...shared,
  entryPoints: [path.join(__dirname, 'main.ts'), path.join(__dirname, 'preload.ts')],
});

// The native messaging host runs as a plain Node program under
// ELECTRON_RUN_AS_NODE, so it is bundled separately and must not pull in the
// electron module.
await build({
  ...shared,
  entryPoints: [path.join(__dirname, 'browser', 'nativeHostMain.ts')],
  external: [],
  outdir: path.join(__dirname, 'dist'),
  entryNames: 'native-host',
});

const assetsSrc = path.join(__dirname, 'assets');
if (existsSync(assetsSrc)) {
  const assetsOut = path.join(__dirname, 'dist', 'assets');
  cpSync(assetsSrc, assetsOut, { recursive: true });
  console.log(`  copied assets -> ${path.relative(process.cwd(), assetsOut)}`);
} else {
  console.warn('  no electron/assets directory; tray will fall back to a text-only icon');
}
