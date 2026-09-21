import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { contextBoundOpens } from './check-crypto-context-binding.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-crypto-context-binding.mjs',
);

const MODULE = `
export interface EnvelopeContext { value: string; acceptUnbound: boolean }
function decryptWithContext(key, parts, context) {
  if (context === undefined) return decrypt(key, parts, undefined);
  try {
    cipher.setAAD(Buffer.from(context.value, 'utf8'));
    return decrypt(key, parts, context.value);
  } catch (boundError) {
    if (!context.acceptUnbound) throw boundError;
    return decrypt(key, parts, undefined);
  }
}
`;

const CALL_SITE = (body) => `
import { openEnvelope } from '@/lib/crypto/envelope';
export function read(value) {
  return openEnvelope(ring(), value, 'hex-triple', ${body}).plaintext;
}
`;

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crypto-context-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const BASELINE = {
  'apps/web/lib/crypto/envelope.ts': MODULE,
  'apps/web/lib/crypto/connector-secret-reseal.ts': CALL_SITE(
    '{ value: purpose, acceptUnbound: true }',
  ),
  'apps/web/lib/crypto/cmek-lifecycle.ts': CALL_SITE(
    '{ value: entry.context, acceptUnbound: true }',
  ),
};

test('passes when every context-bound open states its answer and the admitting ones are declared', () => {
  const result = run(fixture(BASELINE));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /2 still admitting unbound/u);
});

test('fails a new call site that admits an unbound ciphertext', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/lib/services/audit-streaming-service.ts': CALL_SITE(
        '{ value: contextFor(organizationId), acceptUnbound: true }',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(
    result.out,
    /audit-streaming-service\.ts admits a ciphertext with no associated data/u,
  );
});

test('fails a context-bound open that states nothing', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/lib/services/audit-streaming-service.ts': CALL_SITE(
        '{ value: contextFor(organizationId) }',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /states no acceptUnbound/u);
});

test('fails a baseline entry whose call site has stopped admitting one', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/lib/crypto/connector-secret-reseal.ts': CALL_SITE(
        '{ value: purpose, acceptUnbound: false }',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no longer admits an unbound ciphertext/u);
});

test('fails when the envelope module stops refusing an unbound ciphertext', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/lib/crypto/envelope.ts': MODULE.replace(
        'if (!context.acceptUnbound) throw boundError;',
        '',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no longer refuses an unbound ciphertext/u);
});

test('fails when the envelope module stops requiring the answer at all', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/lib/crypto/envelope.ts': MODULE.replace(
        'acceptUnbound: boolean',
        'context: string',
      ),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no longer requires every bound open to state/u);
});

test('fails when the module stops binding the context into the tag', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/lib/crypto/envelope.ts': MODULE.replace('cipher.setAAD(', 'cipher.noop('),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no longer binds the context into the authentication tag/u);
});

test('counts an unbound open as out of scope and a bound one as in scope', () => {
  assert.deepEqual(contextBoundOpens("openEnvelope(ring, value, 'hex-triple')"), []);
  assert.deepEqual(
    contextBoundOpens(
      "openEnvelope(ring, value, 'hex-triple', { value: c, acceptUnbound: false })",
    ),
    [{ admits: false, refuses: true, stated: true }],
  );
});

test('reads a call whose argument list nests parentheses', () => {
  const opens = contextBoundOpens(
    "openEnvelope(ring(db), value, 'hex-triple', { value: contextFor(orgId), acceptUnbound: true })",
  );
  assert.deepEqual(opens, [{ admits: true, refuses: false, stated: true }]);
});
