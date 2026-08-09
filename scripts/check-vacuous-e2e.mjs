#!/usr/bin/env node
/**
 * Fail when a Playwright spec can report green while asserting nothing.
 *
 * THE PATTERN. A test that opens with
 *
 *   test.skip(!(await someControl.isVisible()), 'control not available');
 *
 * skips itself when the control is missing. That is indistinguishable from a
 * pass in every report Playwright produces, and it inverts the purpose of the
 * test: the case it was written to catch — the control is gone — is the exact
 * case that makes it green.
 *
 * WHY A GUARD AND NOT A FIX. `apps/desktop/e2e/gdpr.spec.ts` carried 15 of these
 * against selectors that existed nowhere in the app, and reported green for
 * months; repairing it took seeding a cloud session and rewriting every
 * assertion. `chat.spec.ts` is in the same state today — 13 tests, 16 conditional
 * skips, and NOT ONE test that is not gated behind one — and it runs in CI. The
 * repair is per-suite work that needs the app running. This guard is what stops
 * the next suite from getting there, and what keeps the known ones visible
 * instead of quietly green.
 *
 * WHAT COUNTS AS VACUOUS. Every `test()` in the file sits behind a conditional
 * skip. A suite with some guarded tests and some unconditional ones still proves
 * something, so it passes. A suite where every path can silently disappear does
 * not.
 *
 * An unconditional `test.skip('name', ...)` is a different thing — a deliberately
 * disabled test — and `check-llm-failure-guardrails` already reports those.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', '.next', 'build']);

/**
 * Suites already known to be vacuous, each with the reason it has not been
 * repaired yet. This list may only SHRINK — an entry that no longer reproduces
 * fails the check, so repairing a suite is what removes it, and nothing else.
 */
const KNOWN = {};

// chat.spec.ts was the only entry and has been repaired, so it is gone — which
// is the only way an entry may leave this list. It had 13 tests behind 16
// conditional skips because it never seeded a session: the project runs the
// plain-browser bundle, the app boots to <AuthPage />, and every control the
// suite looked for was behind a login screen. It now seeds via
// injectMockCloudAuth + mockCloudApi and asserts instead of skipping.

// Two suites were listed here on a first pass and removed by this file's own
// staleness check, which is worth recording because it is the check earning its
// place: `windows.spec.ts` has 36 tests and ZERO conditional skips, and
// `settings.spec.ts` has 14 tests against 4 skips, so ten of its tests always
// run. Both were assumed vacuous from a raw per-file skip count without
// comparing it to the test count — the ratio is what matters, and only
// chat.spec.ts fails it.

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.spec\.[cm]?tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const TEST_CALL = /^\s*test\s*\(/gm;
const CONDITIONAL_SKIP = /test\.skip\s*\(\s*!/g;

const vacuous = [];
let scanned = 0;

for (const file of walk(root)) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  const src = fs.readFileSync(file, 'utf8');

  const tests = (src.match(TEST_CALL) || []).length;
  if (tests === 0) continue;
  scanned += 1;

  const skips = (src.match(CONDITIONAL_SKIP) || []).length;
  if (skips === 0) continue;

  // Vacuous when there is at least one conditional skip per test, i.e. no test
  // is guaranteed to execute an assertion.
  if (skips >= tests) vacuous.push({ rel, tests, skips });
}

const errors = [];

for (const { rel, tests, skips } of vacuous) {
  if (rel in KNOWN) continue;
  errors.push(
    `${rel}: ${tests} test(s), ${skips} conditional skip(s) — every test can skip itself, so ` +
      `this suite reports green while asserting nothing.`,
  );
}

// A stale entry is worse than none: it reads as "known and accepted" for a suite
// that may since have been repaired, and it is how this list stops meaning
// anything.
const found = new Set(vacuous.map((v) => v.rel));
for (const rel of Object.keys(KNOWN)) {
  if (!found.has(rel)) {
    errors.push(
      `${rel}: listed as a known vacuous suite but no longer matches. If it was repaired, delete ` +
        `the entry — this list only shrinks.`,
    );
  }
}

if (errors.length > 0) {
  console.error('Vacuous E2E check failed:\n');
  for (const error of errors) console.error(`- ${error}\n`);
  console.error(
    'A test that skips itself when its control is missing turns the failure it was written to\n' +
      'catch into a pass. Assert the control exists, or delete the test.\n',
  );
  process.exit(1);
}

console.log(
  `Vacuous E2E check passed (${scanned} spec file(s) scanned, ` +
    `${Object.keys(KNOWN).length} known vacuous suite(s) pending repair).`,
);
