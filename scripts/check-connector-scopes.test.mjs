import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = join(REPO_ROOT, 'scripts', 'check-connector-scopes.mjs');

const VALID_MANIFEST = `
export const SCOPE_REVIEW_PENDING = 'needs-vendor-specific-review';
export const CONNECTOR_OAUTH_SCOPE_CEILINGS = {
  widgets: ['widgets:read', 'widgets:write'],
  pendingco: SCOPE_REVIEW_PENDING,
};
export const FORBIDDEN_CONNECTOR_OAUTH_SCOPES = ['admin', 'full'];
`;

const VALID_DESCRIPTIONS = `
export const SCOPE_DESCRIPTIONS = {
  'widgets:read': { sentence: 'Reads widgets.', access: READ },
  'widgets:write': { sentence: 'Writes widgets.', access: WRITE },
};
`;

function runOnSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), 'connector-scopes-'));
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

const MANIFEST_REL = 'apps/web/lib/connectors/oauth-scope-allowlist.ts';
const DESCRIPTIONS_REL = 'apps/web/lib/connectors/scope-descriptions.ts';

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `guard failed on the real repo:\n${result.stderr}`);
  assert.match(result.stdout, /check:connector-scopes passed/);
});

test('a described, undeclared-elsewhere manifest passes', () => {
  const result = runOnSandbox({
    [MANIFEST_REL]: VALID_MANIFEST,
    [DESCRIPTIONS_REL]: VALID_DESCRIPTIONS,
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /2 connectors, 1 with an enforced ceiling/);
});

test('a ceiling scope with no description fails', () => {
  const result = runOnSandbox({
    [MANIFEST_REL]: VALID_MANIFEST,
    [DESCRIPTIONS_REL]: `export const SCOPE_DESCRIPTIONS = {
      'widgets:read': { sentence: 'Reads widgets.', access: READ },
    };`,
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /MISSING PURPOSE/);
  assert.match(result.stderr, /widgets:write/);
});

test('a forbidden scope admitted into a ceiling fails', () => {
  const result = runOnSandbox({
    [MANIFEST_REL]: `
      export const SCOPE_REVIEW_PENDING = 'needs-vendor-specific-review';
      export const CONNECTOR_OAUTH_SCOPE_CEILINGS = {
        widgets: ['widgets:read', 'admin'],
      };
      export const FORBIDDEN_CONNECTOR_OAUTH_SCOPES = ['admin', 'full'];
    `,
    [DESCRIPTIONS_REL]: VALID_DESCRIPTIONS,
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /FORBIDDEN SCOPE IN CEILING/);
  assert.match(result.stderr, /widgets: "admin"/);
});

test('a manifest scope literal duplicated in another connector file fails', () => {
  const result = runOnSandbox({
    [MANIFEST_REL]: VALID_MANIFEST,
    [DESCRIPTIONS_REL]: VALID_DESCRIPTIONS,
    'apps/web/lib/connectors/widgets-client.ts': "export const SCOPE = 'widgets:read';",
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /SCOPE DECLARED OUTSIDE THE MANIFEST/);
  assert.match(result.stderr, /widgets-client\.ts:1\s+"widgets:read"/);
});

test('a bare, non-distinctive forbidden word is not flagged as a code duplicate', () => {
  const result = runOnSandbox({
    [MANIFEST_REL]: VALID_MANIFEST,
    [DESCRIPTIONS_REL]: VALID_DESCRIPTIONS,
    'apps/web/app/api/connectors/unrelated/route.ts': "export const RATE_LIMIT_BUCKET = 'admin';",
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});

test('a test fixture under __tests__ is not scanned', () => {
  const result = runOnSandbox({
    [MANIFEST_REL]: VALID_MANIFEST,
    [DESCRIPTIONS_REL]: VALID_DESCRIPTIONS,
    'apps/web/lib/connectors/__tests__/widgets.test.ts': "const s = 'widgets:read';",
  });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});
