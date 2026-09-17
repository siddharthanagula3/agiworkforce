#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  STATE_RULES,
  checkAgainstRatchet,
  countByRule,
  scanRouteStates,
} from './lib/route-states.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const RATCHET_PATH = 'scripts/.route-states-ratchet.json';

const SOURCE_ROOTS = ['apps/web/app', 'apps/web/features', 'apps/web/shared'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__', '__mocks__']);

function sourceFiles(dir) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(current, entry.name));
      } else if (entry.name.endsWith('.tsx')) {
        out.push(path.join(current, entry.name));
      }
    }
  };
  walk(abs);
  return out;
}

const findings = SOURCE_ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    scanRouteStates(fs.readFileSync(file, 'utf8'), path.relative(scanRoot, file)),
  ),
);
const counts = countByRule(findings);

if (process.argv.includes('--write')) {
  const payload = {
    _description:
      'Data-fetching routes that render no loading, empty or error state. Measured at a committed ' +
      'revision, never against a dirty tree. These counts only shrink: a new route must ship all ' +
      'three states, and closing an old gap lowers the ceiling for everyone after you.',
    _measuredAt: process.env.RATCHET_REVISION ?? 'unrecorded',
    maxMissing: counts,
  };
  fs.writeFileSync(path.join(repoRoot, RATCHET_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${RATCHET_PATH}: ${JSON.stringify(counts)}`);
  process.exit(0);
}

const ratchetAbs = path.join(repoRoot, RATCHET_PATH);
if (!fs.existsSync(ratchetAbs)) {
  console.error(`Missing ${RATCHET_PATH}. Run: node scripts/check-route-states.mjs --write`);
  process.exit(1);
}
const ratchet = JSON.parse(fs.readFileSync(ratchetAbs, 'utf8'));
const errors = checkAgainstRatchet(counts, ratchet);

if (process.argv.includes('--list')) {
  for (const finding of findings.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`  ${finding.file}  [${finding.rule}]`);
  }
}

if (errors.length > 0) {
  console.error(
    'A route that fetches owes its reader three answers: it is working, it worked and there is\n' +
      'nothing here, it failed and here is what to do. Silence on any of them reads as broken.\n',
  );
  for (const error of errors) console.error(`  - ${error}`);
  console.error('\nRun with --list to see which files are counted.\n');
  process.exit(1);
}

const summary = STATE_RULES.map(
  (rule) => `${rule.id} ${counts[rule.id]}/${ratchet.maxMissing[rule.id]}`,
).join(', ');
console.log(`Route state check passed (${summary}).`);
