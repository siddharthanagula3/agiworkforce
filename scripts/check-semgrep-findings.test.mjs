import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATE = join(REPO_ROOT, 'scripts', 'check-semgrep-findings.mjs');
const REPO_ALLOWLIST = join(REPO_ROOT, 'scripts', 'semgrep-allowlist.json');

const FAR_FUTURE = '2099-01-01';
const LONG_PAST = '2000-01-01';
const RULE = 'javascript.express.security.audit.express-cookie-session-no-httponly';

function finding(overrides = {}) {
  return {
    check_id: RULE,
    path: 'apps/web/lib/session.ts',
    start: { line: 42 },
    extra: { severity: 'ERROR', message: 'Cookie missing HttpOnly' },
    ...overrides,
  };
}

function runGate({ results, allowlist, omitReport = false, flags = [] }) {
  const sandbox = mkdtempSync(join(tmpdir(), 'sec36-'));
  try {
    const reportPath = join(sandbox, 'semgrep-results.json');
    const allowlistPath = join(sandbox, 'allowlist.json');
    if (!omitReport) writeFileSync(reportPath, JSON.stringify({ results }), 'utf8');
    writeFileSync(allowlistPath, JSON.stringify(allowlist), 'utf8');
    return spawnSync(process.execPath, [GATE, reportPath, allowlistPath, ...flags], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

const ACCEPTED = {
  entries: [{ rule: RULE, owner: '@siddhartha', expires: FAR_FUTURE, reason: 'fixture' }],
};

test('a finding with no allowlist entry fails the gate', () => {
  const result = runGate({ results: [finding()], allowlist: { entries: [] } });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /unaccepted: apps\/web\/lib\/session\.ts:42/);
  assert.match(result.stderr, /express-cookie-session-no-httponly/);
});

test('a finding covered by an unexpired allowlist entry passes', () => {
  const result = runGate({ results: [finding()], allowlist: ACCEPTED });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
});

test('an expired allowlist entry stops covering its finding', () => {
  const result = runGate({
    results: [finding()],
    allowlist: { entries: [{ ...ACCEPTED.entries[0], expires: LONG_PAST }] },
  });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /expired on 2000-01-01/);
  assert.match(result.stderr, /@siddhartha/);
});

test('an allowlist entry without an owner or an expiry is rejected', () => {
  const noOwner = runGate({
    results: [],
    allowlist: { entries: [{ rule: RULE, expires: FAR_FUTURE, reason: 'fixture' }] },
  });
  assert.equal(noOwner.status, 1);
  assert.match(noOwner.stderr, /must set "owner"/);

  const noExpiry = runGate({
    results: [],
    allowlist: { entries: [{ rule: RULE, owner: '@siddhartha', reason: 'fixture' }] },
  });
  assert.equal(noExpiry.status, 1);
  assert.match(noExpiry.stderr, /must set "expires"/);
});

test('a path-scoped entry does not cover the same rule elsewhere', () => {
  const scoped = { entries: [{ ...ACCEPTED.entries[0], paths: ['apps/web/lib/session.ts'] }] };
  assert.equal(runGate({ results: [finding()], allowlist: scoped }).status, 0);

  const elsewhere = runGate({
    results: [finding({ path: 'services/api-gateway/src/session.ts' })],
    allowlist: scoped,
  });
  assert.equal(elsewhere.status, 1);
  assert.match(elsewhere.stderr, /services\/api-gateway\/src\/session\.ts/);
});

test('an allowlist entry that matches nothing is stale and fails', () => {
  const result = runGate({ results: [], allowlist: ACCEPTED });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /stale: the allowlist entry for/);
});

test('--allowlist-only validates the acceptances without needing a report', () => {
  const result = runGate({ results: [], allowlist: ACCEPTED, flags: ['--allowlist-only'] });
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /1 unexpired entry/);
});

test('a missing report is not a clean scan', () => {
  const result = runGate({ results: [], allowlist: ACCEPTED, omitReport: true });
  assert.equal(result.status, 1, `expected failure, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /A missing report is not a clean scan/);
});

test('the repository allowlist is well formed and unexpired', () => {
  const allowlist = JSON.parse(readFileSync(REPO_ALLOWLIST, 'utf8'));
  const result = runGate({ results: [], allowlist, flags: ['--allowlist-only'] });
  assert.equal(result.status, 0, `repo allowlist rejected:\n${result.stdout}${result.stderr}`);
  assert.ok(allowlist.entries.length > 0, 'the repo allowlist must record its accepted findings');
});

test('CI runs the gate after the Semgrep step and dismisses nothing inline', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const semgrepIndex = workflow.indexOf('- name: Semgrep (security audit)');
  const gateIndex = workflow.indexOf('node scripts/check-semgrep-findings.mjs');
  assert.ok(semgrepIndex !== -1, 'ci.yml lost its Semgrep step');
  assert.ok(gateIndex > semgrepIndex, 'ci.yml must run the Semgrep gate after the scan');
  assert.ok(
    !workflow.includes('--exclude-rule'),
    'dismissals belong in scripts/semgrep-allowlist.json, not in --exclude-rule flags',
  );
});
