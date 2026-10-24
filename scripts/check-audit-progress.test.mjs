import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATE = join(REPO_ROOT, 'scripts', 'check-audit-progress.mjs');

function runOn({ register, blockers = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-progress-'));
  try {
    if (register !== undefined) {
      mkdirSync(join(dir, 'audit', 'registers'), { recursive: true });
      writeFileSync(join(dir, 'audit/registers/known-flaws.md'), register, 'utf8');
    }
    if (blockers.length > 0) {
      mkdirSync(join(dir, 'audit', 'blockers'), { recursive: true });
      for (const name of blockers) {
        writeFileSync(join(dir, 'audit/blockers', name), '# blocker\n', 'utf8');
      }
    }
    return spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const header = [
  '# Known flaws register',
  '',
  '## Web',
  '',
  '| id | severity | summary | where | first seen | owner | still open because |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];

const register = (...rows) => [...header, ...rows, ''].join('\n');
const row = (id, severity) => `| ${id} | ${severity} | s | w | 2026-10-23 | Web | r |`;

test('passes when the register has no open rows and no blocker file exists', () => {
  const result = runOn({ register: register() });
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
  assert.match(result.stdout, /all closed/);
  assert.equal(result.stderr.trim(), '');
});

test('fails while any row is open, with counts per severity', () => {
  const result = runOn({
    register: register(row('WEB-A-01', 'High'), row('WEB-B-01', 'Low'), row('WEB-C-01', 'Low')),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /3 open rows/);
  assert.match(result.stderr, /0 Critical, 1 High, 0 Medium, 2 Low/);
  assert.match(result.stderr, /WEB-A-01 \(High\)/);
  assert.doesNotMatch(result.stderr, /WEB-B-01/);
});

test('fails while a release blocker file remains, even with an empty register', () => {
  const result = runOn({ register: register(), blockers: ['14-cli.md'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1 release blocker file/);
  assert.match(result.stderr, /audit\/blockers\/14-cli\.md/);
});

test('fails closed when the register is missing', () => {
  const result = runOn({ register: undefined });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read/);
});

test('fails closed when the register carries no table header', () => {
  const result = runOn({ register: '# Known flaws\n\nProse only.\n' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no "\| id \| severity \|" table header/);
});

test('fails closed on a row whose severity it cannot read', () => {
  const result = runOn({ register: register(row('WEB-A-01', 'Severe')) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /severity outside Critical, High, Medium, Low/);
});

test('fails on an unclosed code fence instead of reporting the hidden rows closed', () => {
  const result = runOn({
    register: [...header, '', '```text', 'never closed', row('WEB-A-01', 'High'), ''].join('\n'),
  });
  assert.equal(result.status, 1, 'an unclosed fence must not read as a clean register');
  assert.match(result.stderr, /unclosed ``` code fence opened at line 8/);
});

test('does not count a sample row inside a fence', () => {
  const result = runOn({
    register: [...header, '', '~~~text', row('WEB-SAMPLE-01', 'High'), '~~~', ''].join('\n'),
  });
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('fails when a flaw ID is listed twice (a duplicated register)', () => {
  const result = runOn({ register: register(row('WEB-A-01', 'Low'), row('WEB-A-01', 'Low')) });
  assert.equal(result.status, 1, 'a doubled register must not report a doubled count as fact');
  assert.match(result.stderr, /listed more than once/);
  assert.match(result.stderr, /WEB-A-01 \(lines 7, 8\)/);
});

test('returns a coherent verdict when run against the real register', () => {
  const result = spawnSync(process.execPath, [GATE], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.ok(result.status === 0 || result.status === 1, `unexpected exit ${result.status}`);
  if (result.status === 0) {
    assert.match(result.stdout, /all closed/);
    assert.equal(result.stderr.trim(), '');
  } else {
    assert.notEqual(result.stderr.trim(), '', 'a failing gate must say why');
    assert.doesNotMatch(result.stderr, /not in a state this gate can measure/);
    assert.equal(result.stdout.trim(), '', 'a failing gate must not print a passing summary');
  }
});

test('the release-completion command invokes the gate', () => {
  const launch = readFileSync(join(REPO_ROOT, 'scripts', 'launch-readiness-check.sh'), 'utf8');
  assert.match(launch, /node scripts\/check-audit-progress\.mjs/);
});

test('no ordinary developer flow invokes the gate', () => {
  const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts ?? {};
  const wired = Object.entries(scripts).filter(([, body]) =>
    body.includes('check-audit-progress.mjs'),
  );
  assert.deepEqual(wired, [], 'the release gate must stay out of lint/typecheck/test/CI');

  const workflowDir = join(REPO_ROOT, '.github', 'workflows');
  const wiredWorkflows = readdirSync(workflowDir).filter((file) =>
    readFileSync(join(workflowDir, file), 'utf8').includes('check-audit-progress.mjs'),
  );
  assert.deepEqual(
    wiredWorkflows,
    [],
    'a gate that exits 1 while any flaw is open would make CI permanently red',
  );
});
