import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REPO_ROOT,
  checkClientBundleRoots,
  checkPackageRuntimes,
  clientImports,
  exportEntries,
} from './check-package-runtimes.mjs';

const roots = [];

function workspace(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-package-runtimes-'));
  roots.push(root);
  for (const [relative, source] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const SHARED = {
  dir: 'packages/shared',
  name: '@agiworkforce/shared',
  manifest: {
    name: '@agiworkforce/shared',
    exports: { '.': './src/index.ts', './node': './src/node.ts', './theme.css': './src/theme.css' },
  },
};
const CLIENT = {
  dir: 'packages/client',
  name: '@agiworkforce/client',
  manifest: { name: '@agiworkforce/client', exports: { '.': './src/index.ts' } },
};

function files(overrides = {}) {
  return {
    'packages/shared/src/index.ts': "export * from './format';\n",
    'packages/shared/src/format.ts': 'export const format = (value: number) => value.toFixed(2);\n',
    'packages/shared/src/node.ts':
      "import { readFile } from 'node:fs/promises';\nexport const load = (file: string) => readFile(file, 'utf8');\n",
    'packages/shared/src/theme.css': ':root {}\n',
    'packages/client/src/index.ts':
      "import { format } from '@agiworkforce/shared';\nexport const price = (value: number) => format(value);\n",
    ...overrides,
  };
}

const REGISTRY = {
  'packages/shared': { '.': 'universal', './node': 'server', './theme.css': 'asset' },
  'packages/client': { '.': 'universal' },
};

test('the tree as it stands keeps every entry inside its declared runtime', () => {
  assert.deepEqual(checkPackageRuntimes(REPO_ROOT), []);
});

test('no client bundle root in the tree reaches a server entry or the crypto envelope', () => {
  assert.deepEqual(checkClientBundleRoots(REPO_ROOT), []);
});

test('a synthetic workspace that honours its declarations passes', () => {
  const root = workspace(files());
  assert.deepEqual(
    checkPackageRuntimes(root, { registry: REGISTRY, packages: [SHARED, CLIENT] }),
    [],
  );
});

test('a universal entry that reaches a Node built-in fails', () => {
  const root = workspace(
    files({
      'packages/shared/src/format.ts':
        "import { createHash } from 'node:crypto';\nexport const format = (value: number) => createHash('sha256').update(String(value)).digest('hex');\n",
    }),
  );
  assert.ok(
    checkPackageRuntimes(root, { registry: REGISTRY, packages: [SHARED, CLIENT] }).some((entry) =>
      /@agiworkforce\/shared is declared universal but reaches a Node built-in: .*node:crypto/.test(
        entry,
      ),
    ),
  );
});

test('a universal entry that imports a server entry of another package fails', () => {
  const root = workspace(
    files({
      'packages/client/src/index.ts':
        "import { load } from '@agiworkforce/shared/node';\nexport const read = load;\n",
    }),
  );
  assert.ok(
    checkPackageRuntimes(root, { registry: REGISTRY, packages: [SHARED, CLIENT] }).some((entry) =>
      /@agiworkforce\/client is declared universal but .* imports @agiworkforce\/shared\/node, which is declared server/.test(
        entry,
      ),
    ),
  );
});

test('an undeclared entry and a declaration for a removed entry both fail', () => {
  const root = workspace(files());
  const registry = {
    'packages/shared': { '.': 'universal', './theme.css': 'asset', './gone': 'universal' },
    'packages/client': { '.': 'universal' },
  };
  const failures = checkPackageRuntimes(root, { registry, packages: [SHARED, CLIENT] });
  assert.ok(failures.some((entry) => /shared\/node .* declares no runtime/.test(entry)));
  assert.ok(failures.some((entry) => /\.\/gone, which the package no longer exports/.test(entry)));
});

test('only React Native entries may reach react-native', () => {
  const root = workspace(
    files({
      'packages/shared/src/format.ts':
        "import { Platform } from 'react-native';\nexport const format = () => Platform.OS;\n",
    }),
  );
  assert.ok(
    checkPackageRuntimes(root, { registry: REGISTRY, packages: [SHARED, CLIENT] }).some((entry) =>
      /declared universal but reaches React Native/.test(entry),
    ),
  );
});

test('export maps are read in their string, object and main forms', () => {
  assert.deepEqual(exportEntries({ main: './src/index.ts' }), { '.': './src/index.ts' });
  assert.deepEqual(exportEntries({ exports: './src/index.ts' }), { '.': './src/index.ts' });
  assert.deepEqual(
    exportEntries({ exports: { '.': { import: './src/index.ts', types: './src/index.d.ts' } } }),
    { '.': './src/index.ts' },
  );
});

const WEB_ROOT = {
  name: 'web client components',
  app: 'apps/web',
  runtime: 'browser',
  tsconfig: 'apps/web/tsconfig.json',
  directive: 'use client',
};
const MOBILE_ROOT = {
  name: 'mobile app',
  app: 'apps/mobile',
  runtime: 'native',
  entries: ['apps/mobile/index.ts'],
};
const NATIVE = {
  dir: 'packages/native',
  name: '@agiworkforce/native',
  manifest: {
    name: '@agiworkforce/native',
    exports: { '.': './src/index.ts', './web': './src/web.ts' },
  },
};
const CLIENT_REGISTRY = {
  ...REGISTRY,
  'packages/native': { '.': 'native', './web': 'browser' },
};

function clientFiles(overrides = {}) {
  return files({
    'packages/native/src/index.ts': 'export const haptic = () => undefined;\n',
    'packages/native/src/web.ts': 'export const vibrate = () => navigator.vibrate(10);\n',
    'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: {} }),
    'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
    'apps/web/app/page.tsx':
      "'use client';\nimport { helper } from '@/lib/helper';\nimport { save } from '@/lib/actions';\nexport default function Page() { return helper(save); }\n",
    'apps/web/lib/helper.ts': 'export const helper = (value: unknown) => String(value);\n',
    'apps/web/lib/actions.ts':
      "'use server';\nimport { sealEnvelope } from './crypto/envelope';\nexport async function save() { return sealEnvelope; }\n",
    'apps/web/lib/crypto/envelope.ts':
      "import { createCipheriv } from 'node:crypto';\nexport const sealEnvelope = createCipheriv;\n",
    'apps/mobile/package.json': JSON.stringify({
      name: 'mobile',
      dependencies: { buffer: '6.0.3' },
    }),
    'apps/mobile/index.ts':
      "import { Buffer } from 'buffer';\nimport './widget';\nexport const bytes = Buffer.from('x');\n",
    'apps/mobile/widget.ios.tsx':
      "import { haptic } from '@agiworkforce/native';\nexport const tap = haptic;\n",
    ...overrides,
  });
}

function clientCheck(root, roots = [WEB_ROOT, MOBILE_ROOT]) {
  return checkClientBundleRoots(root, {
    registry: CLIENT_REGISTRY,
    packages: [SHARED, CLIENT, NATIVE],
    roots,
  });
}

test('client roots that stop at server actions and import only type declarations pass', () => {
  const root = workspace(
    clientFiles({
      'apps/web/lib/helper.ts':
        "import type { load } from '@agiworkforce/shared/node';\nimport { type load as read } from '@agiworkforce/shared/node';\nexport const helper = (value: unknown): ReturnType<typeof load> | typeof read | string => String(value);\n",
    }),
  );
  assert.deepEqual(clientCheck(root), []);
});

test('a client component that reaches the crypto envelope through an alias fails', () => {
  const root = workspace(
    clientFiles({
      'apps/web/lib/helper.ts':
        "import { sealEnvelope } from '@/lib/crypto/envelope';\nexport const helper = (value: unknown) => String(value ?? sealEnvelope);\n",
    }),
  );
  assert.ok(
    clientCheck(root).some((entry) =>
      /web client components: apps\/web\/lib\/crypto\/envelope\.ts is the crypto envelope.*reached from apps\/web\/app\/page\.tsx/.test(
        entry,
      ),
    ),
  );
});

test('a client component that imports a server package entry or a Node built-in fails', () => {
  const root = workspace(
    clientFiles({
      'apps/web/lib/helper.ts':
        "import { load } from '@agiworkforce/shared/node';\nimport { readFile } from 'fs';\nexport const helper = async () => (await import('node:path')).join(String(load), String(readFile));\n",
    }),
  );
  const failures = clientCheck(root);
  assert.ok(
    failures.some((entry) =>
      /imports @agiworkforce\/shared\/node, which is declared server/.test(entry),
    ),
  );
  assert.ok(failures.some((entry) => /imports the Node built-in fs\b/.test(entry)));
  assert.ok(failures.some((entry) => /imports the Node built-in node:path/.test(entry)));
});

test('a native root follows platform files and refuses a browser entry', () => {
  const root = workspace(
    clientFiles({
      'apps/mobile/widget.ios.tsx':
        "import { vibrate } from '@agiworkforce/native/web';\nexport const tap = vibrate;\n",
    }),
  );
  assert.ok(
    clientCheck(root).some((entry) =>
      /mobile app: apps\/mobile\/widget\.ios\.tsx imports @agiworkforce\/native\/web, which is declared browser/.test(
        entry,
      ),
    ),
  );
});

test('a browser root refuses a native entry and a named entry must exist', () => {
  const root = workspace(
    clientFiles({
      'apps/web/lib/helper.ts':
        "import { haptic } from '@agiworkforce/native';\nexport const helper = () => haptic;\n",
    }),
  );
  const failures = clientCheck(root, [
    WEB_ROOT,
    { ...MOBILE_ROOT, entries: ['apps/mobile/index.ts', 'apps/mobile/gone.ts'] },
  ]);
  assert.ok(
    failures.some((entry) => /imports @agiworkforce\/native, which is declared native/.test(entry)),
  );
  assert.ok(
    failures.some((entry) =>
      /names the entry apps\/mobile\/gone\.ts, which no longer exists/.test(entry),
    ),
  );
});

test('client imports read static, side-effect, re-export and dynamic forms and skip type-only ones', () => {
  assert.deepEqual(
    clientImports(
      "import { type A, type B } from 'types-only';\nimport { type C, d } from 'mixed';\nimport type E from 'typed';\nimport './side';\nexport * from './again';\nexport type { F } from './declared';\nconst lazy = () => import('./lazy');\n",
    ),
    ['mixed', './side', './again', './lazy'],
  );
});
