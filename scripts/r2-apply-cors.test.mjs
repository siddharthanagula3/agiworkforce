import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALLOWED_ORIGINS, CORS_RULES, matchesExpected } from './r2-apply-cors.mjs';

const UPLOAD_HEADERS_SOURCE = fileURLToPath(
  new URL('../packages/platform/object-storage/src/upload-headers.ts', import.meta.url),
);

function readBack(overrides = {}) {
  const rule = CORS_RULES[0];
  return [
    {
      allowed: {
        origins: [...ALLOWED_ORIGINS],
        methods: [...rule.allowed.methods],
        headers: [...rule.allowed.headers],
      },
      exposeHeaders: [...rule.exposeHeaders],
      maxAgeSeconds: rule.maxAgeSeconds,
      ...overrides,
    },
  ];
}

test('allows every header a direct upload must send under server-side encryption', () => {
  const declared = [...readFileSync(UPLOAD_HEADERS_SOURCE, 'utf8').matchAll(/= '(x-amz-[a-z-]+)'/g)]
    .map((match) => match[1])
    .sort();
  assert.equal(declared.length, 2);
  const allowed = CORS_RULES[0].allowed.headers.map((name) => name.toLowerCase());
  for (const name of declared) assert.ok(allowed.includes(name), `${name} is not allowed`);
});

test('allows no amz header that no upload client sends', () => {
  const declared = [...readFileSync(UPLOAD_HEADERS_SOURCE, 'utf8').matchAll(/= '(x-amz-[a-z-]+)'/g)]
    .map((match) => match[1])
    .sort();
  const checksumHeaders = ['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm'];
  const allowedAmz = CORS_RULES[0].allowed.headers
    .map((name) => name.toLowerCase())
    .filter((name) => name.startsWith('x-amz-'))
    .sort();
  assert.deepEqual(allowedAmz, [...declared, ...checksumHeaders].sort());
});

test('accepts the policy it applied', () => {
  assert.equal(matchesExpected(readBack()), true);
});

test('accepts a read-back that changes only the case of header names', () => {
  const headers = CORS_RULES[0].allowed.headers.map((name) => name.toUpperCase());
  assert.equal(matchesExpected(readBack({ allowed: { ...readBack()[0].allowed, headers } })), true);
});

test('refuses a read-back that is missing an upload header', () => {
  const headers = CORS_RULES[0].allowed.headers.filter(
    (name) => name !== 'x-amz-server-side-encryption',
  );
  assert.equal(
    matchesExpected(readBack({ allowed: { ...readBack()[0].allowed, headers } })),
    false,
  );
});

test('refuses a read-back with a different exposed header or max age', () => {
  assert.equal(matchesExpected(readBack({ exposeHeaders: [] })), false);
  assert.equal(matchesExpected(readBack({ maxAgeSeconds: 0 })), false);
});

test('refuses a read-back with a missing origin, a missing method or no rule', () => {
  const base = readBack()[0].allowed;
  assert.equal(
    matchesExpected(readBack({ allowed: { ...base, origins: base.origins.slice(1) } })),
    false,
  );
  assert.equal(
    matchesExpected(readBack({ allowed: { ...base, methods: base.methods.slice(1) } })),
    false,
  );
  assert.equal(matchesExpected([]), false);
  assert.equal(matchesExpected(undefined), false);
});
