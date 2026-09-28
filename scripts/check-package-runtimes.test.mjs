import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { REPO_ROOT, checkPackageRuntimes, exportEntries } from './check-package-runtimes.mjs';

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
