import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATE = join(REPO_ROOT, 'scripts', 'check-audit-progress.mjs');

function runOnLedger(ledger) {
  const dir = mkdtempSync(join(tmpdir(), 'base009-'));
  try {
    if (ledger !== undefined) {
      mkdirSync(join(dir, 'docs', 'work'), { recursive: true });
      writeFileSync(join(dir, 'docs/work/audit-remediation-ledger.md'), ledger, 'utf8');
    }
    return spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const closedLedger = [
  '# Ledger',
  '',
  '### CRIT-001, A closed task',
  '',
  '- [x] Did the thing.',
  '- [x] Proved the thing.',
  '',
  '- [x] **BASE-009, A closed phase-0 task.** Evidence recorded.',
  '',
].join('\n');

test('passes on an intact ledger with every box checked', () => {
  const result = runOnLedger(closedLedger);
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
  assert.match(result.stdout, /3 ledger tasks, all closed/);
});

test('fails while any box is unchecked, attributing it to its task', () => {
  const result = runOnLedger(closedLedger.replace('- [x] Proved the thing.', '- [ ] Prove it.'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1 of 3 tasks/);
  assert.match(result.stderr, /CRIT-001: 1 unchecked item/);
});

test('fails closed when the ledger is missing', () => {
  const result = runOnLedger(undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read/);
});

test('fails closed when the ledger carries no checkboxes at all', () => {
  const result = runOnLedger('# Ledger\n\nProse only.\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no task checkboxes/);
});

test('fails on an unclosed code fence instead of reporting the hidden tasks closed', () => {
  const ledger = [
    '# Ledger',
    '',
    '### CRIT-001, A closed task',
    '',
    '- [x] Did the thing.',
    '',
    '```text',
    'a fence someone forgot to close',
    '',
    '### CRIT-002, Everything below is invisible',
    '',
    '- [ ] This open task must not vanish.',
    '- [ ] Neither must this one.',
    '',
  ].join('\n');
  const result = runOnLedger(ledger);
  assert.equal(result.status, 1, 'an unclosed fence must not read as a clean ledger');
  assert.match(result.stderr, /unclosed ``` code fence opened at line 7/);
});

test('does not let a ``` line inside a ~~~ block close that block', () => {
  const ledger = [
    '# Ledger',
    '',
    '~~~text',
    'a sample that shows fenced markdown:',
    '```',
    '- [ ] this example task is not a real task',
    '```',
    '~~~',
    '',
    '### CRIT-003, A real task after the sample',
    '',
    '- [ ] This open task must be counted.',
    '',
  ].join('\n');
  const result = runOnLedger(ledger);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /1 of 1 tasks/, 'the sample inside the fence must not be counted');
  assert.match(result.stderr, /CRIT-003: 1 unchecked item/);
});

test('fails when a task ID is declared by two headings (a duplicated ledger)', () => {
  const result = runOnLedger(`${closedLedger}\n${closedLedger}`);
  assert.equal(result.status, 1, 'a doubled ledger must not report a doubled count as fact');
  assert.match(result.stderr, /declared more than once/);
  assert.match(result.stderr, /CRIT-001 \(lines 3, 12\)/);
  assert.match(result.stderr, /BASE-009 \(lines 8, 17\)/);
});

test('treats a heading that merely mentions an ID as a reference, not a declaration', () => {
  const ledger = [
    '# Ledger',
    '',
    '### CRIT-001, A closed task',
    '',
    '- [x] Did the thing.',
    '',
    '#### Evidence for CRIT-001',
    '',
    '- [x] Recorded.',
    '',
  ].join('\n');
  const result = runOnLedger(ledger);
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('returns a coherent verdict when run against the real ledger', () => {
  const result = spawnSync(process.execPath, [GATE], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.ok(result.status === 0 || result.status === 1, `unexpected exit ${result.status}`);
  if (result.status === 0) {
    assert.match(result.stdout, /all closed/);
    assert.equal(result.stderr.trim(), '');
  } else {
    assert.notEqual(result.stderr.trim(), '', 'a failing gate must say why');
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
  assert.deepEqual(wired, [], 'BASE-009 requires the gate stay out of lint/typecheck/test/CI');

  const workflowDir = join(REPO_ROOT, '.github', 'workflows');
  const wiredWorkflows = readdirSync(workflowDir).filter((file) =>
    readFileSync(join(workflowDir, file), 'utf8').includes('check-audit-progress.mjs'),
  );
  assert.deepEqual(
    wiredWorkflows,
    [],
    'a gate that exits 1 by design would make CI permanently red',
  );
});
