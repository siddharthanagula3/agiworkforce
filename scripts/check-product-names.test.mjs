import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MANIFEST_FIELDS,
  REGISTRY_PATH,
  readRegistry,
  runProductNamesCheck,
} from './check-product-names.mjs';

const NAMES = {
  chat: 'AGI Chat',
  mobile: 'AGI Mobile',
  desktop: 'AGI Desktop',
  cli: 'AGI CLI',
  extension: 'AGI Extension',
  code: 'AGI Code',
  work: 'AGI Work',
};

function fixture({ desktop = 'AGI Desktop', source = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-names-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  write(
    REGISTRY_PATH,
    `export const PRODUCT_NAMES = {\n${Object.entries(NAMES)
      .map(([key, value]) => `  ${key}: '${value}',`)
      .join('\n')}\n} as const;\n`,
  );
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

test('checks one display field per app that cannot import the registry', () => {
  assert.deepEqual(MANIFEST_FIELDS.map((field) => field.product).sort(), [
    'code',
    'desktop',
    'extension',
    'mobile',
  ]);
});

test('passes when every app shows its registry name', () => {
  assert.deepEqual(runProductNamesCheck(fixture()), []);
});

test('fails when an app manifest drifts from the registry', () => {
  const failures = runProductNamesCheck(fixture({ desktop: 'AGI Cloud' }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /electron-builder\.yml: shows "AGI Cloud"/);
});

test('fails on a retired product spelling in shipped source', () => {
  const failures = runProductNamesCheck(fixture({ source: "const label = 'Open AGI Web';\n" }));
  assert.deepEqual(failures, ['apps/web/app/page.tsx:1: retired product spelling "AGI Web"']);
});

test('does not flag a longer word that merely starts with a retired spelling', () => {
  assert.deepEqual(runProductNamesCheck(fixture({ source: "const host = 'AGI Website';\n" })), []);
});
