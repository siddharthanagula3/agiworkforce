#!/usr/bin/env node
// test-model-catalog-integrity-md.mjs
//
// Exercises the .md/.mdx scanning added to check-model-catalog-integrity.mjs.
// The test FAILS (exits non-zero) if the guard does not detect bare `gpt-5.4`
// in a synthetic .md file placed under apps/cli/ — which would mean the .md
// extension to the guard is missing or broken.
//
// Run from repo root: node scripts/test-model-catalog-integrity-md.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const GUARD = path.join(root, 'scripts/check-model-catalog-integrity.mjs');
const FIXTURE = path.join(root, 'apps/cli/test-fixture-stale-model-id.md');

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
} finally {
  // Always clean up the fixture file.
  try {
    fs.unlinkSync(FIXTURE);
  } catch {
    // ignore
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
