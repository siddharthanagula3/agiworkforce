import { build } from 'esbuild';
// Imported rather than used as globals: the repo eslint config does not grant
// Node globals to plain .mjs files.
import console from 'node:console';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// The macOS input helper: Electron can capture a display but cannot synthesise
// a click, so the CGEvent half is a separate signed executable. It is built
// into electron/dist so electron-builder ships it as an extraResource, which
// puts it inside the bundle and under the same notarization.
if (process.platform === 'darwin') {
  const source = path.join(__dirname, 'native', 'macos', 'agi-input.swift');
  const output = path.join(__dirname, 'dist', 'agi-input');
  mkdirSync(path.dirname(output), { recursive: true });
  const built = spawnSync('swiftc', ['-O', source, '-o', output], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (built.error || built.status !== 0) {
    console.warn(
      '  swiftc could not build the input helper; computer use will report itself unavailable',
    );
  } else {
    console.log(`  built input helper -> ${path.relative(process.cwd(), output)}`);
  }
}
