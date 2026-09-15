import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compareLocales, flattenKeys } from './check-i18n-parity.mjs';

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-parity-'));
  for (const [file, value] of Object.entries(files)) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return dir;
}

test('flattens nested keys with dotted paths', () => {
  const keys = flattenKeys({ a: 'x', nav: { one: 'y', deep: { two: 'z' } } });
  assert.deepEqual([...keys].sort(), ['a', 'nav.deep.two', 'nav.one']);
});

test('passes when every locale carries the reference keys', () => {
  const dir = fixture({
    'en/common.json': { yes: 'Yes', nav: { chat: 'Chat' } },
    'es/common.json': { yes: 'Sí', nav: { chat: 'Chat' } },
  });
  const result = compareLocales(dir);
  assert.deepEqual(result.findings, []);
  assert.equal(result.keyCount, 2);
});

test('names missing keys, extra keys, absent namespaces and unparsable files', () => {
  const dir = fixture({
    'en/common.json': { yes: 'Yes', no: 'No' },
    'en/chat.json': { send: 'Send' },
    'fr/common.json': { yes: 'Oui', maybe: 'Peut-être' },
    'de/common.json': { yes: 'Ja', no: 'Nein' },
    'de/chat.json': '{ not json',
  });
  const { findings } = compareLocales(dir);
  assert.ok(findings.some((line) => line.startsWith('fr/common.json: missing no')));
  assert.ok(findings.some((line) => line.startsWith('fr/common.json: extra maybe')));
  assert.ok(findings.includes('fr/chat.json: namespace missing'));
  assert.ok(findings.some((line) => line.startsWith('de/chat.json: ')));
});
