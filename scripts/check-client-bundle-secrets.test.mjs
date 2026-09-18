import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-client-bundle-secrets.mjs');

function runOnSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), 'client-bundle-secrets-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(sandbox, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents, 'utf8');
    }
    return spawnSync(process.execPath, [GUARD], { cwd: sandbox, encoding: 'utf8' });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `guard failed on the real repo:\n${result.stderr}`);
  assert.match(result.stdout, /check:client-bundle-secrets passed/);
});

test('a secret literal in web source fails the guard', () => {
  const result = runOnSandbox({
    'apps/web/app/page.tsx': `export const key = 'sk_live_${'A'.repeat(24)}';\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /secret literal in web source/);
});

test('a secret literal in the built client bundle fails the guard', () => {
  const result = runOnSandbox({
    'apps/web/.next/static/chunks/main.js': `var t="AKIAABCDEFGHIJKLMNOP";\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /built client bundle/);
});

test('a client env var named like a secret fails the guard', () => {
  const result = runOnSandbox({
    'apps/web/app/page.tsx': 'export const v = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY;\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /named like a secret/);
});

test('a publishable key by design passes', () => {
  const result = runOnSandbox({
    'apps/web/app/page.tsx': 'export const v = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;\n',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('a PKCS#8 header with no key material is library code, not a secret', () => {
  const result = runOnSandbox({
    'apps/web/.next/static/chunks/jose.js':
      'if(0!==e.indexOf("-----BEGIN PRIVATE KEY-----"))throw TypeError("pkcs8");\n',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('a real private key block in the bundle fails the guard', () => {
  const result = runOnSandbox({
    'apps/web/.next/static/chunks/main.js': `var k="-----BEGIN PRIVATE KEY-----\\n${'MIIEvQIBADANBg'.repeat(4)}";\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private key block/);
});
