#!/usr/bin/env node
// test-model-catalog-integrity-md.mjs
//
// Exercises the Markdown scan and retired-Opus whole-repository scan in
// check-model-catalog-integrity.mjs. The test FAILS (exits non-zero) if the
// guard misses synthetic stale references in live TypeScript, repo docs, or a
// test directory.
//
// Run from repo root: node scripts/test-model-catalog-integrity-md.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const GUARD = path.join(root, 'scripts/check-model-catalog-integrity.mjs');
const FIXTURE = path.join(root, 'apps/cli/test-fixture-stale-model-id.md');
const LABEL_FIXTURE = path.join(root, 'apps/cli/test-fixture-stale-model-label.ts');
const DOC_LABEL_FIXTURE = path.join(root, 'docs/test-fixture-retired-opus-label.md');
const TEST_LABEL_FIXTURE = path.join(root, 'apps/cli/tests/test-fixture-retired-opus-label.ts');

// Run the guard and return { exitCode, stdout, stderr }.
function runGuard() {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], { cwd: root, stdio: 'pipe' }).toString();
    return { exitCode: 0, output: stdout };
  } catch (e) {
    return { exitCode: e.status ?? 1, output: (e.stderr ?? e.stdout ?? '').toString() };
  }
}

// Fixture path relative to repo root, used to match guard output lines.
const FIXTURE_REL = path.relative(root, FIXTURE).replace(/\\/g, '/');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

console.log('test: guard detects bare gpt-5.4 in .md files');

try {
  // Test 1: guard output MUST mention the fixture file when it contains a stale ID.
  // This proves the guard scans .md files (not just .ts/.tsx).
  fs.writeFileSync(
    FIXTURE,
    [
      '# Fixture — stale model ID test',
      '',
      'This file is created and deleted by test-model-catalog-integrity-md.mjs.',
      '',
      '```bash',
      '# The following line contains a removed model ID that the guard must catch:',
      'agi -m gpt-5.4 "hello"',
      '```',
      '',
      '<!-- this HTML comment line is skipped: gpt-5.4 should NOT produce a violation here -->',
      '',
    ].join('\n'),
  );
  const { output: outStale } = runGuard();
  assert(
    'guard output mentions fixture .md file when it contains bare gpt-5.4',
    outStale.includes(FIXTURE_REL),
  );

  // Test 2: guard output MUST NOT mention the fixture file after stale ID is removed.
  fs.writeFileSync(
    FIXTURE,
    ['# Fixture — clean version', '', '```bash', 'agi -m gpt-5.5 "hello"', '```', ''].join('\n'),
  );
  const { output: outClean } = runGuard();
  assert(
    'guard output does not mention fixture .md file after it is cleaned up',
    !outClean.includes(FIXTURE_REL),
  );

  // Test 3: HTML comment lines in .md must be skipped — a stale ID inside an
  // HTML comment must NOT appear in guard output as a violation.
  fs.writeFileSync(
    FIXTURE,
    [
      '# Fixture — stale id only in HTML comment',
      '',
      '<!-- gpt-5.4 appears ONLY inside a comment; must not trigger a violation -->',
      '',
    ].join('\n'),
  );
  const { output: outComment } = runGuard();
  assert(
    'guard skips HTML comment lines in .md (no false positive for fixture)',
    !outComment.includes(FIXTURE_REL),
  );

  // Test 4: a removed Opus generation written as a human-readable label in
  // live TypeScript must be rejected too. Construct the label from fragments
  // so this regression test does not itself retain the retired model name.
  const removedOpusLabel = ['Claude', 'Opus', ['4', '8'].join('.')].join(' ');
  fs.writeFileSync(LABEL_FIXTURE, `export const modelLabel = '${removedOpusLabel}';\n`);
  const { output: outLabel } = runGuard();
  assert(
    'guard rejects retired human-readable Opus labels in live TypeScript',
    outLabel.includes(path.relative(root, LABEL_FIXTURE).replace(/\\/g, '/')),
  );

  // Test 5: the specifically removed predecessor must not survive in any
  // documentation tree, including the repo-level docs/ tree that the live-code
  // scan intentionally excludes because it contains historical references.
  fs.writeFileSync(DOC_LABEL_FIXTURE, `# ${removedOpusLabel}\n`);
  const { output: outDocLabel } = runGuard();
  assert(
    'guard rejects the specifically removed Opus predecessor in repo documentation',
    outDocLabel.includes(path.relative(root, DOC_LABEL_FIXTURE).replace(/\\/g, '/')),
  );

  // Test 6: regression fixtures are part of the explicit removal request too;
  // test directories must not be skipped by the whole-repository retirement scan.
  fs.writeFileSync(TEST_LABEL_FIXTURE, `export const modelLabel = '${removedOpusLabel}';\n`);
  const { output: outTestLabel } = runGuard();
  assert(
    'guard rejects the specifically removed Opus predecessor in test directories',
    outTestLabel.includes(path.relative(root, TEST_LABEL_FIXTURE).replace(/\\/g, '/')),
  );
} finally {
  // Always clean up the fixture file.
  for (const fixture of [FIXTURE, LABEL_FIXTURE, DOC_LABEL_FIXTURE, TEST_LABEL_FIXTURE]) {
    try {
      fs.unlinkSync(fixture);
    } catch {
      // ignore
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
