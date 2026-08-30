#!/usr/bin/env node
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
  console.error(
    `\n❌ [run-priority-tier] No app owns tests matching "${token}".\n` +
      `A tier wired into CI that matches nothing is not a gate: it reports success for ` +
      `every change, including the ones it exists to stop. Either add tests under ` +
      `apps/<app>/__tests__/**/${token}/ or remove the tier from package.json and its workflow.`,
  );
  if (process.env['GITHUB_ACTIONS'] === 'true') {
    console.error(`::error title=Empty test tier::No app owns tests matching "${token}".`);
  }
  process.exit(1);
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
