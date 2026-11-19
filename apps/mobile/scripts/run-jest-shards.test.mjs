import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TEST_FILES_PER_PROCESS,
  countListedTests,
  jestRuns,
  shardCount,
} from './run-jest-shards.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('splits the suite so no process loads more than the per-process limit', () => {
  assert.equal(shardCount(0), 1);
  assert.equal(shardCount(1), 1);
  assert.equal(shardCount(TEST_FILES_PER_PROCESS), 1);
  assert.equal(shardCount(TEST_FILES_PER_PROCESS + 1), 2);
  assert.equal(shardCount(1091), Math.ceil(1091 / TEST_FILES_PER_PROCESS));
  for (const count of [121, 699, 1091, 5000]) {
    assert.ok(Math.ceil(count / shardCount(count)) <= TEST_FILES_PER_PROCESS);
  }
});

test('refuses a count or a limit that is not a usable whole number', () => {
  assert.throws(() => shardCount(-1));
  assert.throws(() => shardCount(1.5));
  assert.throws(() => shardCount(10, 0));
  assert.throws(() => shardCount(Number.NaN));
});

test('counts listed test files and ignores blank lines', () => {
  assert.equal(countListedTests(''), 0);
  assert.equal(countListedTests('/a/one.test.ts\n/a/two.test.tsx\n\n'), 2);
});

test('runs every shard in band when no file or pattern is named', () => {
  const runs = jestRuns([], 250);
  assert.equal(runs.length, 3);
  runs.forEach((args, index) => {
    assert.deepEqual(args, ['--runInBand', '--forceExit', `--shard=${index + 1}/3`]);
  });
});

test('runs one process with the forwarded file or pattern and no shard', () => {
  assert.deepEqual(jestRuns(['__tests__/SkillsPage.test.tsx'], 0), [
    ['--runInBand', '--forceExit', '__tests__/SkillsPage.test.tsx'],
  ]);
  assert.deepEqual(jestRuns(['-t', 'reloads the list'], 0), [
    ['--runInBand', '--forceExit', '-t', 'reloads the list'],
  ]);
});

test('the package test script runs the suite through the shard runner', () => {
  const scripts = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.test, /node scripts\/run-jest-shards\.mjs$/);
  assert.match(scripts['test:node'], /scripts\/run-jest-shards\.test\.mjs/);
});
