#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', '.next', 'build']);

const KNOWN = {};

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
