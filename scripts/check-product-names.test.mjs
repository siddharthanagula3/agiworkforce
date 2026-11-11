import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MANIFEST_FIELDS,
  REGISTRY_PATH,
  readCopyrightName,
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

const COPYRIGHT_NAME = 'AGI';

function registrySource(names) {
  return `export const PRODUCT_COPYRIGHT_NAME = '${COPYRIGHT_NAME}';\n\nexport const PRODUCT_NAMES = {\n${Object.entries(
    names,
  )
    .map(([key, value]) => `  ${key}: '${value}',`)
    .join('\n')}\n} as const;\n`;
}

function fixture({ desktop = NAMES.desktop, source = '', names = NAMES } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-names-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  write(REGISTRY_PATH, registrySource(names));
  write('apps/mobile/app.config.js', `const config = {\n  name: '${NAMES.mobile}',\n};\n`);
  write('apps/desktop/electron-builder.yml', `appId: x\nproductName: ${desktop}\n`);
  write(
    'apps/extension/manifest.json',
    JSON.stringify({ name: `${COPYRIGHT_NAME} ${names.extension}` }),
  );
  write('apps/extension-vscode/package.json', JSON.stringify({ displayName: NAMES.code }));
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

test('reads the copyright name from the registry', () => {
  assert.equal(readCopyrightName(fixture()), COPYRIGHT_NAME);
});

test('fails when the extension manifest shows the bare product name', () => {
  const root = fixture();
  fs.writeFileSync(
    path.join(root, 'apps/extension/manifest.json'),
    JSON.stringify({ name: NAMES.extension }),
  );
  assert.deepEqual(runProductNamesCheck(root), [
    'apps/extension/manifest.json: shows "Extension", the registry names this app "AGI Extension"',
  ]);
});

test('passes when every app shows its registry name', () => {
  assert.deepEqual(runProductNamesCheck(fixture()), []);
});

test('fails when an app manifest drifts from the registry', () => {
  const failures = runProductNamesCheck(fixture({ desktop: 'AGI Desktop' }));
  assert.deepEqual(failures, [
    'apps/desktop/electron-builder.yml: shows "AGI Desktop", the registry names this app "Desktop"',
  ]);
});

test('fails when the registry renames an app its manifest still shows by the old name', () => {
  const failures = runProductNamesCheck(fixture({ names: { ...NAMES, desktop: 'AGI Desktop' } }));
  assert.deepEqual(failures, [
    'apps/desktop/electron-builder.yml: shows "Desktop", the registry names this app "AGI Desktop"',
  ]);
});

test('fails when a manifest has lost its display field', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'apps/extension-vscode/package.json'), JSON.stringify({}));
  assert.deepEqual(runProductNamesCheck(root), [
    'apps/extension-vscode/package.json: shows "null", the registry names this app "Code"',
  ]);
});

test('fails on a retired product spelling in shipped source', () => {
  const failures = runProductNamesCheck(fixture({ source: "const label = 'Open AGI Web';\n" }));
  assert.deepEqual(failures, ['apps/web/app/page.tsx:1: retired product spelling "AGI Web"']);
});

test('does not flag a longer word that merely starts with a retired spelling', () => {
  assert.deepEqual(runProductNamesCheck(fixture({ source: "const host = 'AGI Website';\n" })), []);
});
