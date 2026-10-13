import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { missingEnvironment, reportNotRun } from './ci-prerequisites.mjs';

test('missing prerequisites name only absent or blank environment variables', () => {
  assert.deepEqual(
    missingEnvironment(['FIRST', 'SECOND', 'THIRD', 'FOURTH'], {
      FIRST: 'fixture-value',
      SECOND: '',
      THIRD: ' \t ',
    }),
    ['SECOND', 'THIRD', 'FOURTH'],
  );
  assert.deepEqual(missingEnvironment(['FIRST'], { FIRST: 'fixture-value' }), []);
});

test('a not-run report appends an explicit summary and emits one escaped warning', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'agi-ci-prerequisites-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const summaryPath = join(directory, 'summary.md');
  writeFileSync(summaryPath, 'Earlier result\n');
  const lines = [];

  reportNotRun(
    {
      title: 'Fixture check',
      reason: 'Missing FIXTURE_KEY.\n0% measured.',
      unblockedBy: 'Add the repository secret FIXTURE_KEY.',
      flawId: 'FIXTURE-GAP-01',
      details: '| Step | Status |\n| --- | --- |\n| Fixture | Not run |',
    },
    { env: { GITHUB_STEP_SUMMARY: summaryPath }, log: (line) => lines.push(line) },
  );

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^::warning::NOT RUN: Fixture check\./u);
  assert.match(lines[0], /FIXTURE_KEY\.%0A0%25 measured/u);
  assert.ok(!lines[0].includes('\n'));
  const summary = readFileSync(summaryPath, 'utf8');
  assert.match(summary, /^Earlier result\n## NOT RUN: Fixture check/u);
  assert.match(summary, /Unblocked by: Add the repository secret FIXTURE_KEY/u);
  assert.match(summary, /audit\/registers\/known-flaws\.md: FIXTURE-GAP-01/u);
  assert.match(summary, /\| Fixture \| Not run \|/u);
});

test('a not-run report remains visible without a GitHub summary file', () => {
  const lines = [];
  reportNotRun(
    { title: 'Fixture', reason: 'Missing setup.', unblockedBy: 'Configure it.', flawId: 'GAP-01' },
    { env: {}, log: (line) => lines.push(line) },
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Missing setup.*Configure it.*GAP-01/u);
});
