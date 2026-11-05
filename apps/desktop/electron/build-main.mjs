import { build } from 'esbuild';
// Imported rather than used as globals: the repo eslint config does not grant
// Node globals to plain .mjs files.
import console from 'node:console';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  NOTICES_FILE_NAME,
  bundledModuleRoots,
  writeDesktopNotices,
} from './openSourceNotices.mjs';
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
  metafile: true,
  define: {
    AGI_PAGE_BACKGROUND_LIGHT: JSON.stringify(shellTokens.pageBackgroundLight),
    AGI_PAGE_BACKGROUND_DARK: JSON.stringify(shellTokens.pageBackgroundDark),
    AGI_PAGE_INK_LIGHT: JSON.stringify(shellTokens.pageInkLight),
    AGI_PAGE_INK_DARK: JSON.stringify(shellTokens.pageInkDark),
    AGI_PAGE_SECONDARY_INK_LIGHT: JSON.stringify(shellTokens.pageSecondaryInkLight),
    AGI_PAGE_SECONDARY_INK_DARK: JSON.stringify(shellTokens.pageSecondaryInkDark),
    AGI_TITLE_STRIP_HEIGHT: JSON.stringify(shellTokens.titleStripHeight),
  },
};

const mainBuild = await build({
  ...shared,
  entryPoints: [path.join(__dirname, 'main.ts'), path.join(__dirname, 'preload.ts')],
});

// The native messaging host is a separate bundle so host mode does not load
// the windowed shell (and its stdout). It must not pull in the electron module.
const nativeHostBuild = await build({
  ...shared,
  entryPoints: [path.join(__dirname, 'browser', 'nativeHostMain.ts')],
  external: [],
  outdir: path.join(__dirname, 'dist'),
  entryNames: 'native-host',
});

// package.json main. Host mode must require the host bundle directly: a dynamic
// import of the windowed shell would run too late, and loading that shell would
// write to stdout, which Chrome's native-messaging protocol cannot tolerate.
writeFileSync(
  path.join(__dirname, 'dist', 'bootstrap.cjs'),
  [
    "'use strict';",
    "if (process.env.AGI_NATIVE_MESSAGING_HOST === '1') {",
    "  require('./native-host.cjs');",
    '} else {',
    "  require('./main.cjs');",
    '}',
    '',
  ].join('\n'),
);

const assetsSrc = path.join(__dirname, 'assets');
if (existsSync(assetsSrc)) {
  const assetsOut = path.join(__dirname, 'dist', 'assets');
  cpSync(assetsSrc, assetsOut, { recursive: true });
  console.log(`  copied assets -> ${path.relative(process.cwd(), assetsOut)}`);
} else {
  console.warn('  no electron/assets directory; tray will fall back to a text-only icon');
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const electronPackage = path.dirname(
  createRequire(path.join(__dirname, '..', 'package.json')).resolve('electron/package.json'),
);
const noticesFile = path.join(__dirname, 'dist', NOTICES_FILE_NAME);
writeDesktopNotices(noticesFile, {
  moduleRoots: bundledModuleRoots([mainBuild.metafile, nativeHostBuild.metafile], process.cwd()),
  extraRoots: [electronPackage],
  bundledNoticesFiles: [path.join(repoRoot, 'apps', 'cli', 'assets', 'THIRD_PARTY_NOTICES.txt')],
});
console.log(`  wrote ${path.relative(process.cwd(), noticesFile)}`);
