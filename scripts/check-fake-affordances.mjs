#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  RULES,
  checkAgainstRatchet,
  countByRule,
  findFakeAffordances,
} from './lib/fake-affordances.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const RATCHET_PATH = 'scripts/.fake-affordances-ratchet.json';

const SOURCE_ROOTS = ['apps/web/app', 'apps/web/features', 'apps/web/shared', 'packages/ui'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '__tests__',
  '__mocks__',
  'e2e',
]);

function sourceFiles(dir) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(current, entry.name));
      } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec|stories)\.tsx?$/.test(entry.name)) {
        out.push(path.join(current, entry.name));
      }
    }
  };
  walk(abs);
  return out;
}

const findings = SOURCE_ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findFakeAffordances(fs.readFileSync(file, 'utf8'), path.relative(scanRoot, file)),
  ),
);
const counts = countByRule(findings);

if (process.argv.includes('--write')) {
  const payload = {
    _description:
      'Surfaces that claim more than they do. Measured at a committed revision, never against a ' +
      'dirty tree. Three of the four rules stand at zero and must stay there. raw-identifier keeps ' +
      'two: the model catalogue card and the plugin console bar both render an id as the record it ' +
      'names, which is the thing the reader selects by, so those two are the deliberate exception ' +
      'rather than leaked machine state.',
    _measuredAt: process.env.RATCHET_REVISION ?? 'unrecorded',
    maxFindings: counts,
  };
  fs.writeFileSync(path.join(repoRoot, RATCHET_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${RATCHET_PATH}: ${JSON.stringify(counts)}`);
  process.exit(0);
}

const ratchetAbs = path.join(repoRoot, RATCHET_PATH);
if (!fs.existsSync(ratchetAbs)) {
  console.error(`Missing ${RATCHET_PATH}. Run: node scripts/check-fake-affordances.mjs --write`);
  process.exit(1);
}
const ratchet = JSON.parse(fs.readFileSync(ratchetAbs, 'utf8'));
const errors = checkAgainstRatchet(counts, ratchet);

if (errors.length > 0) {
  console.error('A surface that claims more than it does is worse than one that claims nothing.\n');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  for (const finding of findings.filter((f) => counts[f.rule] > ratchet.maxFindings[f.rule])) {
    console.error(`    ${finding.file}:${finding.line}  [${finding.rule}]`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  `Fake-affordance check passed (${RULES.map((rule) => `${rule.id} ${counts[rule.id]}/${ratchet.maxFindings[rule.id]}`).join(', ')}).`,
);
