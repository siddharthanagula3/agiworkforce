#!/usr/bin/env node
/**
 * Run a named slice of the test suite — a "priority tier" (priority-level-N) or
 * a path keyword such as "security" — across every app that actually owns
 * matching tests, invoking each app's OWN `test` script so per-app config is
 * the single source of truth.
 *
 * Why this exists
 * ---------------
 * The previous root scripts ran `vitest run --include='**\/priority-level-N\/**'`
 * from the repo root. That was broken two ways over:
 *   1. vitest 4 removed the `--include` CLI flag, so the command hard-crashed
 *      with `CACError: Unknown option --include` before running a single test.
 *   2. Even before that crash, a config-less root `vitest run` could not resolve
 *      each app's `@/` path aliases (web/extension tests failed to import) and
 *      could not run mobile's tests at all (mobile uses jest, not vitest).
 * Net effect: the "blocking" priority-1 / security tier silently ran nothing,
 * and CI (test-l1-l2.yml, test-l3-l4.yml) crashed on the arg-parse error.
 *
 * This script instead discovers which apps own tests matching <token> and runs
 * each through `pnpm --filter <pkg> run test <token>`, so the app's configured
 * runner (vitest with its aliases/jsdom/setup, or jest) does the work. Both
 * runners accept a trailing path filter, so one mechanism covers all surfaces.
 *
 * Usage:  node scripts/run-priority-tier.mjs <token>
 *   e.g.  node scripts/run-priority-tier.mjs priority-level-1
 *         node scripts/run-priority-tier.mjs security
 *
 * Exit codes: 0 = all matching apps passed (or no app owns matching tests —
 * an empty tier is reported loudly, not silently). 1 = at least one app failed.
 * 2 = bad usage.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const token = process.argv[2];
if (!token) {
  console.error('usage: run-priority-tier.mjs <token>   (e.g. priority-level-1, security)');
  process.exit(2);
}

const root = process.cwd();
const appsDir = path.join(root, 'apps');
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** True if `app` owns at least one test file whose path contains <token>. */
function appOwnsMatchingTest(app) {
  const testsRoot = path.join(appsDir, app, '__tests__');
  if (!fs.existsSync(testsRoot)) return false;
  const stack = [testsRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (TEST_FILE.test(entry.name) && full.includes(token)) {
        return true;
      }
    }
  }
  return false;
}

const apps = fs
  .readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter(appOwnsMatchingTest)
  .sort();

if (apps.length === 0) {
  // Loud, not silent: an empty tier is a legitimate state (only priority-level-1
  // is populated today), but it must be visible in CI logs so a wiped test tier
  // can never masquerade as a green run.
  console.log(`\n⚠️  [run-priority-tier] No app owns tests matching "${token}". Nothing to run.`);
  process.exit(0);
}

console.log(`\n[run-priority-tier] "${token}" → ${apps.join(', ')}`);
const failures = [];
for (const app of apps) {
  const pkgName = JSON.parse(fs.readFileSync(path.join(appsDir, app, 'package.json'), 'utf8')).name;
  console.log(`\n──────── ${app} (${pkgName}) ────────`);
  try {
    execFileSync('pnpm', ['--filter', pkgName, 'run', 'test', token], {
      stdio: 'inherit',
      cwd: root,
    });
  } catch {
    failures.push(app);
  }
}

if (failures.length > 0) {
  console.error(`\n❌ [run-priority-tier] "${token}" FAILED in: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`\n✅ [run-priority-tier] "${token}" passed in: ${apps.join(', ')}`);
