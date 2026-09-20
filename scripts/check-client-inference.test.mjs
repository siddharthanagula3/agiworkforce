import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  BASELINE_PATH,
  CLIENT_ROOTS,
  INFERENCE_FAMILIES,
  MIN_DISTINCT_MEMBERS,
  REPO_ROOT,
  applyBaseline,
  findLocalVocabularies,
  loadBaseline,
  readVocabulary,
} from './check-client-inference.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-client-inference.mjs');
const CONTRACT_ROOT = 'packages/contracts/types/src';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function sandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'client-inference-'));
  sandboxes.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), contents, 'utf8');
  }
  return dir;
}

const CONTRACT = `${CONTRACT_ROOT}/lifecycle-status.ts`;
const CONTRACT_SOURCE = `export const LIFECYCLE_STATUSES = ['queued', 'running', 'done', 'failed'] as const;\n`;
const CLIENT = `${CLIENT_ROOTS[0]}/StatusBadge.tsx`;

const FAMILY = [
  { name: 'lifecycle state names', file: 'lifecycle-status.ts', symbol: 'LIFECYCLE_STATUSES' },
];

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('every family reads a real vocabulary out of its contract', () => {
  for (const family of INFERENCE_FAMILIES) {
    const members = readVocabulary({ repoRoot: REPO_ROOT, ...family });
    assert.ok(
      Array.isArray(members) && members.length >= MIN_DISTINCT_MEMBERS,
      `${family.symbol} read ${members === null ? 'nothing' : members.length} members`,
    );
  }
});

test('a client that restates the vocabulary without importing it is flagged', () => {
  const dir = sandbox({
    [CONTRACT]: CONTRACT_SOURCE,
    [CLIENT]: "const tone = { 'queued': 'grey', 'running': 'blue', 'failed': 'red' };\n",
  });
  const { violations } = findLocalVocabularies({
    repoRoot: dir,
    files: [CLIENT],
    families: FAMILY,
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].symbol, 'LIFECYCLE_STATUSES');
});

test('the same client is clean once it imports the contract', () => {
  const dir = sandbox({
    [CONTRACT]: CONTRACT_SOURCE,
    [CLIENT]:
      "import { LIFECYCLE_STATUSES } from '@agiworkforce/types';\nconst tone = { 'queued': 'grey', 'running': 'blue', 'failed': 'red' };\n",
  });
  const { violations } = findLocalVocabularies({
    repoRoot: dir,
    files: [CLIENT],
    families: FAMILY,
  });
  assert.deepEqual(violations, []);
});

test('naming one or two members is not a private copy of the vocabulary', () => {
  const dir = sandbox({
    [CONTRACT]: CONTRACT_SOURCE,
    [CLIENT]: "if (status === 'running') return <Spinner />;\n",
  });
  const { violations } = findLocalVocabularies({
    repoRoot: dir,
    files: [CLIENT],
    families: FAMILY,
  });
  assert.deepEqual(violations, []);
});

test('a vocabulary that moved out of its contract fails loudly rather than passing', () => {
  const dir = sandbox({ [CONTRACT]: 'export const SOMETHING_ELSE = [];\n' });
  const { unreadable } = findLocalVocabularies({ repoRoot: dir, files: [], families: FAMILY });
  assert.equal(unreadable.length, 1);
});

test('the baseline absorbs a recorded copy and refuses a new one', () => {
  const violations = [
    {
      file: 'apps/desktop/src/a.ts',
      symbol: 'LIFECYCLE_STATUSES',
      family: 'lifecycle state names',
    },
    {
      file: 'apps/desktop/src/b.ts',
      symbol: 'LIFECYCLE_STATUSES',
      family: 'lifecycle state names',
    },
  ];
  const baseline = {
    entries: [{ file: 'apps/desktop/src/a.ts', symbol: 'LIFECYCLE_STATUSES', why: 'recorded' }],
  };
  const { errors, fresh } = applyBaseline({ violations, baseline });
  assert.deepEqual(errors, []);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].file, 'apps/desktop/src/b.ts');
});

test('a baseline entry that was fixed fails, so the list only shrinks', () => {
  const { errors } = applyBaseline({
    violations: [],
    baseline: {
      entries: [{ file: 'apps/desktop/src/a.ts', symbol: 'LIFECYCLE_STATUSES', why: 'recorded' }],
    },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer restates the vocabulary/);
});

test('a baseline entry without a reason fails', () => {
  const { errors } = applyBaseline({
    violations: [{ file: 'apps/desktop/src/a.ts', symbol: 'LIFECYCLE_STATUSES' }],
    baseline: {
      entries: [{ file: 'apps/desktop/src/a.ts', symbol: 'LIFECYCLE_STATUSES', why: '' }],
    },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /carries no reason/);
});

test('every recorded entry names a file and a vocabulary that still exist', () => {
  const baseline = loadBaseline(REPO_ROOT);
  assert.ok(baseline.entries.length > 0, `${BASELINE_PATH} is empty`);
  const symbols = new Set(INFERENCE_FAMILIES.map((family) => family.symbol));
  for (const entry of baseline.entries) {
    assert.ok(symbols.has(entry.symbol), `${entry.symbol} is not a checked vocabulary`);
  }
});
