import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  DEPROVISION,
  REPO_ROOT,
  ROUTE_GATE,
  checkMembershipRevocation,
  credentialVerifiers,
} from './check-membership-revocation.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-membership-revocation.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** The real gate and the real offboarding path, so a pass here is a real pass. */
function sandbox({ gate = null, deprovision = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'membership-revocation-'));
  sandboxes.push(dir);
  for (const [relativePath, edit] of [
    [ROUTE_GATE, gate],
    [DEPROVISION, deprovision],
  ]) {
    const source = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    mkdirSync(path.join(dir, path.dirname(relativePath)), { recursive: true });
    writeFileSync(path.join(dir, relativePath), edit === null ? source : edit(source), 'utf8');
  }
  return dir;
}

function run(options = {}) {
  return checkMembershipRevocation(sandbox(options));
}

function mentions(failures, needle) {
  return failures.some((failure) => failure.includes(needle));
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('a credential the offboarding path stops revoking is reported', () => {
  const { failures } = run({
    deprovision: (source) =>
      source.replace(
        'update public.api_keys\n          set revoked_at = now()',
        'update public.api_keys\n          set last_used_at = now()',
      ),
  });
  assert.ok(mentions(failures, 'an API key'), failures.join('\n'));
  assert.ok(mentions(failures, 'revokes nothing there'), failures.join('\n'));
});

test('a revocation that forgets the workspace would reach another tenant', () => {
  const { failures } = run({
    deprovision: (source) =>
      source.replace(
        'where user_id = $1 and organization_id = $2 and revoked_at is null',
        'where user_id = $1 and revoked_at is null',
      ),
  });
  assert.ok(mentions(failures, 'names no workspace'), failures.join('\n'));
});

test('a credential class the gate stops authenticating fails as a stale entry', () => {
  const { failures } = run({
    gate: (source) => source.replace(/ApiKeyService\.verifyKey\(/g, 'ApiKeyService.lookUp('),
  });
  assert.ok(mentions(failures, 'drop the entry'), failures.join('\n'));
});

test('a fifth way in has to be classified before it can pass', () => {
  const { failures } = run({
    gate: (source) => `${source}\nexport const probe = async (t) => verifyProbeToken(t);\n`,
  });
  assert.ok(mentions(failures, 'verifyProbeToken'), failures.join('\n'));
});

test('an identity-provider credential is ended by the provider call, not a statement', () => {
  const { failures } = run({
    deprovision: (source) => source.replace(/identity\.revokeSession\(/g, 'identity.touchSession('),
  });
  assert.ok(mentions(failures, 'no longer ends'), failures.join('\n'));
});

test('a gate with no verifier at all cannot be read as a clean pass', () => {
  const { failures } = run({ gate: () => 'export const nothing = 1;\n' });
  assert.ok(mentions(failures, 'no credential verifier found'), failures.join('\n'));
});

test('the credential classes come out of the gate', () => {
  const verifiers = credentialVerifiers(readFileSync(path.join(REPO_ROOT, ROUTE_GATE), 'utf8'));
  assert.ok(verifiers.includes('verifyKey'), verifiers.join(', '));
  assert.ok(verifiers.includes('getRequestIdentity'), verifiers.join(', '));
});
