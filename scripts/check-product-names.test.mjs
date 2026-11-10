import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MANIFEST_FIELDS,
  REGISTRY_PATH,
  readInstalledNames,
  readRegistry,
  runProductNamesCheck,
} from './check-product-names.mjs';

const NAMES = {
  chat: 'Chat',
  mobile: 'Mobile',
  desktop: 'Desktop',
  cli: 'CLI',
  extension: 'Extension',
  code: 'Code',
  work: 'Work',
};

const INSTALLED_NAMES = {
  mobile: 'AGI Mobile',
  desktop: 'AGI Desktop',
  extension: 'AGI Extension',
  code: 'AGI Code',
};

function registrySource(installed) {
  const block = (name, entries) =>
    `export const ${name} = {\n${Object.entries(entries)
      .map(([key, value]) => `  ${key}: '${value}',`)
      .join('\n')}\n} as const;\n`;
  return `${block('PRODUCT_NAMES', NAMES)}\n${block('PRODUCT_INSTALLED_NAMES', installed)}`;
}

function fixture({ desktop = 'AGI Desktop', source = '', installed = INSTALLED_NAMES } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-names-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  write(REGISTRY_PATH, registrySource(installed));
  write('apps/mobile/app.config.js', "const config = {\n  name: 'AGI Mobile',\n};\n");
  write('apps/desktop/electron-builder.yml', `appId: x\nproductName: ${desktop}\n`);
  write('apps/extension/manifest.json', JSON.stringify({ name: 'AGI Extension' }));
  write('apps/extension-vscode/package.json', JSON.stringify({ displayName: 'AGI Code' }));
  write('apps/web/app/page.tsx', source);
  return root;
}

test('reads every product from the registry', () => {
  assert.deepEqual(readRegistry(fixture()), NAMES);
});

test('reads every installed name from the registry', () => {
  assert.deepEqual(readInstalledNames(fixture()), INSTALLED_NAMES);
});

test('checks one display field per app that cannot import the registry', () => {
  assert.deepEqual(MANIFEST_FIELDS.map((field) => field.product).sort(), [
    'code',
    'desktop',
    'extension',
    'mobile',
  ]);
});

test('passes when every app shows its registry installed name', () => {
  assert.deepEqual(runProductNamesCheck(fixture()), []);
});

test('fails when an app manifest drifts from the registry', () => {
  const failures = runProductNamesCheck(fixture({ desktop: 'AGI Cloud' }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /electron-builder\.yml: shows "AGI Cloud"/);
});

test('fails when the registry installed name differs from the manifest', () => {
  const failures = runProductNamesCheck(
    fixture({ installed: { ...INSTALLED_NAMES, desktop: 'AGI Desktop Pro' } }),
  );
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /electron-builder\.yml: shows "AGI Desktop", the registry installs this app as "AGI Desktop Pro"/,
  );
});

test('fails when a manifest shows the in-product name instead of the installed name', () => {
  const failures = runProductNamesCheck(fixture({ desktop: 'Desktop' }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /electron-builder\.yml: shows "Desktop"/);
});

test('fails when an installed name has no in-product counterpart', () => {
  const failures = runProductNamesCheck(
    fixture({ installed: { ...INSTALLED_NAMES, studio: 'AGI Studio' } }),
  );
  assert.deepEqual(failures, [
    `${REGISTRY_PATH}: PRODUCT_INSTALLED_NAMES names "studio", which PRODUCT_NAMES does not`,
  ]);
});

test('fails on a retired product spelling in shipped source', () => {
  const failures = runProductNamesCheck(fixture({ source: "const label = 'Open AGI Web';\n" }));
  assert.deepEqual(failures, ['apps/web/app/page.tsx:1: retired product spelling "AGI Web"']);
});

test('does not flag a longer word that merely starts with a retired spelling', () => {
  assert.deepEqual(runProductNamesCheck(fixture({ source: "const host = 'AGI Website';\n" })), []);
});
