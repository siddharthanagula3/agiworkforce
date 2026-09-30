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

function scanReport(results = [], overrides = {}) {
  return {
    version: '1.172.0',
    results,
    errors: [],
    paths: { scanned: ['apps/web/lib/session.ts'] },
    ...overrides,
  };
}

function runGate({
  results,
  report = scanReport(results),
  rawReport,
  allowlist,
  omitReport = false,
  flags = [],
}) {
  const sandbox = mkdtempSync(join(tmpdir(), 'sec36-'));
  try {
    const reportPath = join(sandbox, 'semgrep-results.json');
    const allowlistPath = join(sandbox, 'allowlist.json');
    if (!omitReport) writeFileSync(reportPath, rawReport ?? JSON.stringify(report), 'utf8');
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
  const result = runGate({ allowlist: ACCEPTED, omitReport: true, flags: ['--allowlist-only'] });
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

const WARNING = {
  code: 2,
  level: 'warn',
  type: 'Timeout',
  message: 'Synthetic fixture timeout detail',
  path: 'apps/web/lib/session.ts',
  rule_id: RULE,
};

test('a complete report with no findings and no acceptances passes', () => {
  const result = runGate({ report: scanReport(), allowlist: { entries: [] } });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /0 finding\(s\)/);
});

test('unconsumed formatter fields and position offsets are optional', () => {
  const result = runGate({
    report: scanReport([
      finding({ start: { line: 42, col: 1, offset: -1 }, end: { line: 42, col: 2 } }),
    ]),
    allowlist: ACCEPTED,
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

for (const [name, errors] of [
  ['warning timeout', [WARNING]],
  ['informational diagnostic', [{ ...WARNING, level: 'info' }]],
  ['engine error', [{ ...WARNING, level: 'error', type: 'ParseError' }]],
  ['malformed error entry', [null]],
]) {
  test(`${name} fails even when every finding is accepted`, () => {
    const result = runGate({
      report: scanReport([finding()], { errors }),
      allowlist: ACCEPTED,
    });
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /report contains 1 scanner error/);
    assert.doesNotMatch(result.stdout, /gate passed/);
  });
}

test('a warning timeout fails a report with no findings or acceptances', () => {
  const result = runGate({
    report: scanReport([], { errors: [WARNING] }),
    allowlist: { entries: [] },
  });
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /report contains 1 scanner error/);
});

for (const [name, report] of [
  ['null envelope', null],
  ['array envelope', []],
  ['string envelope', 'fixture'],
  ['missing results', { version: '1.172.0', errors: [], paths: { scanned: ['fixture.ts'] } }],
  ['null results', scanReport(null)],
  ['object results', scanReport({})],
]) {
  test(`${name} is rejected instead of becoming a clean scan`, () => {
    const result = runGate({ report, allowlist: { entries: [] } });
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /Semgrep report/);
    assert.doesNotMatch(result.stdout, /gate passed/);
  });
}

for (const [name, overrides] of [
  ['missing version', { version: undefined }],
  ['empty version', { version: ' ' }],
  ['numeric version', { version: 1 }],
  ['missing errors', { errors: undefined }],
  ['null errors', { errors: null }],
  ['object errors', { errors: {} }],
  ['missing paths', { paths: undefined }],
  ['null paths', { paths: null }],
  ['array paths', { paths: [] }],
  ['missing targets', { paths: {} }],
  ['null targets', { paths: { scanned: null } }],
  ['string targets', { paths: { scanned: 'fixture.ts' } }],
  ['empty targets', { paths: { scanned: [] } }],
  ['invalid target', { paths: { scanned: [null] } }],
  ['blank target', { paths: { scanned: [' '] } }],
]) {
  test(`${name} fails even when every finding is accepted`, () => {
    const result = runGate({ report: scanReport([finding()], overrides), allowlist: ACCEPTED });
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /Semgrep report/);
    assert.doesNotMatch(result.stdout, /gate passed/);
  });
}

test('zero selected targets cannot pass with zero findings', () => {
  const result = runGate({
    report: scanReport([], { paths: { scanned: [] } }),
    allowlist: { entries: [] },
  });
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /paths.scanned/);
});

for (const [name, overrides] of [
  ['missing start', { start: undefined }],
  ['null start', { start: null }],
  ['array start', { start: [] }],
  ['string line', { start: { line: '42' } }],
  ['null line', { start: { line: null } }],
  ['zero line', { start: { line: 0 } }],
  ['negative line', { start: { line: -1 } }],
  ['fractional line', { start: { line: 1.5 } }],
  ['unsafe line', { start: { line: Number.MAX_SAFE_INTEGER + 1 } }],
  ['missing extra', { extra: undefined }],
  ['null extra', { extra: null }],
  ['array extra', { extra: [] }],
  ['invalid message', { extra: { severity: 'ERROR', message: null } }],
  ['invalid severity', { extra: { severity: null, message: 'fixture' } }],
  ['blank severity', { extra: { severity: ' ', message: 'fixture' } }],
  ['missing path', { path: undefined }],
  ['invalid path', { path: null }],
  ['blank path', { path: ' ' }],
  ['missing rule', { check_id: undefined }],
  ['invalid rule', { check_id: null }],
  ['blank rule', { check_id: ' ' }],
]) {
  test(`an accepted finding with ${name} is rejected before allowlist matching`, () => {
    const result = runGate({ results: [finding(overrides)], allowlist: ACCEPTED });
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /Semgrep report results\[0\]/);
    assert.doesNotMatch(result.stdout, /gate passed/);
  });
}

for (const [name, value] of [
  ['null', null],
  ['array', []],
  ['string', 'fixture'],
]) {
  test(`a ${name} finding produces a controlled schema failure`, () => {
    const result = runGate({ results: [value], allowlist: { entries: [] } });
    assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /Semgrep report results\[0\]/);
    assert.doesNotMatch(result.stderr, /TypeError|file:\/\//);
  });
}

test('scanner error messages stay out of gate diagnostics', () => {
  const marker = 'synthetic-private-source-marker';
  const errored = runGate({
    report: scanReport([finding()], { errors: [{ ...WARNING, message: marker }] }),
    allowlist: ACCEPTED,
  });
  assert.equal(errored.status, 1, `${errored.stdout}${errored.stderr}`);
  assert.ok(!`${errored.stdout}${errored.stderr}`.includes(marker));
});

test('finding snippets stay out of gate diagnostics', () => {
  const marker = 'synthetic-private-source-marker';
  const blocked = runGate({
    results: [finding({ extra: { severity: 'ERROR', message: marker } })],
    allowlist: { entries: [] },
  });
  assert.equal(blocked.status, 1, `${blocked.stdout}${blocked.stderr}`);
  assert.match(blocked.stderr, /unaccepted: apps\/web\/lib\/session\.ts:42/);
  assert.ok(!`${blocked.stdout}${blocked.stderr}`.includes(marker));
});

test('invalid JSON diagnostics do not echo report contents', () => {
  const marker = 'fixture';
  const result = runGate({ rawReport: marker, allowlist: { entries: [] } });
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /not valid JSON/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(marker));
});
