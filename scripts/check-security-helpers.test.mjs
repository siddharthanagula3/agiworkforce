import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CIPHER_EXEMPTIONS,
  RECORDED_COPIES,
  REPO_ROOT,
  SHARED_HELPERS,
  checkSecurityHelpers,
  declaredHelpers,
} from './check-security-helpers.mjs';

const roots = [];

function fixture(added = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-security-helpers-'));
  roots.push(root);
  const files = new Set([
    ...Object.values(SHARED_HELPERS),
    ...Object.keys(RECORDED_COPIES).map((key) => key.split('#')[0]),
    ...Object.keys(CIPHER_EXEMPTIONS),
  ]);
  for (const relative of files) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  for (const [relative, source] of Object.entries(added)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands keeps each security helper in one place', () => {
  assert.deepEqual(checkSecurityHelpers(REPO_ROOT), []);
  assert.deepEqual(checkSecurityHelpers(fixture()), []);
});

test('a new copy of a shared helper fails', () => {
  const root = fixture({
    'apps/extension/src/features/logs.ts':
      "export function redactSecrets(value: string): string {\n  return value.replace(/sk-[a-z0-9]+/g, '[REDACTED]');\n}\n",
  });
  assert.ok(
    checkSecurityHelpers(root).some((entry) =>
      /features\/logs\.ts declares its own redactSecrets/.test(entry),
    ),
  );
});

test('a raw cipher outside the crypto module fails', () => {
  const root = fixture({
    'apps/web/lib/services/vault.ts':
      "import { createCipheriv } from 'node:crypto';\nexport const seal = (key: Buffer, iv: Buffer) => createCipheriv('aes-256-gcm', key, iv);\n",
  });
  assert.ok(
    checkSecurityHelpers(root).some((entry) => /vault\.ts calls a raw cipher outside/.test(entry)),
  );
});

test('a recorded copy that goes away fails until its record goes', () => {
  const key = 'apps/mobile/lib/redact.ts#redactSecrets';
  const copies = {
    ...RECORDED_COPIES,
    [key]: 'mobile: import redactSecrets from @agiworkforce/utils',
  };
  const before = fixture({
    'apps/mobile/lib/redact.ts': 'export const redactSecrets = (value: string) => value;\n',
  });
  assert.deepEqual(checkSecurityHelpers(before, { copies }), []);
  const after = fixture({
    'apps/mobile/lib/redact.ts': "export { redactSecrets } from '@agiworkforce/utils';\n",
  });
  assert.ok(
    checkSecurityHelpers(after, { copies }).some((entry) =>
      /redact\.ts#redactSecrets is no longer a second copy/.test(entry),
    ),
  );
});

test('only a declaration counts as a copy, not a call or an import', () => {
  assert.deepEqual(declaredHelpers('const clean = redactSecrets(value);'), []);
  assert.deepEqual(declaredHelpers("import { redactSecrets } from '@agiworkforce/utils';"), []);
  assert.deepEqual(declaredHelpers('export async function openEnvelope<T>(value: T) {}'), [
    'openEnvelope',
  ]);
});
