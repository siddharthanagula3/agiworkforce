#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  checkAgainstRatchet,
  countByRule,
  isApiRoute,
  isPageRoute,
  scan,
} from './lib/route-tests.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const RATCHET_PATH = 'scripts/.route-tests-ratchet.json';
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.turbo']);

function walk(dir, accept) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const step = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        step(full);
      } else {
        const rel = path.relative(scanRoot, full);
        if (accept(rel, entry.name)) out.push(rel);
      }
    }
  };
  step(abs);
  return out;
}

const apiRoutes = walk('apps/web/app/api', (rel) => isApiRoute(rel));
const pageRoutes = walk('apps/web/app', (rel) => isPageRoute(rel));
const testPaths = walk('apps/web', (_rel, name) => /\.(?:test|spec)\.tsx?$/.test(name));
const specPaths = walk('apps/web/e2e', (_rel, name) => /\.spec\.ts$/.test(name));

const read = (rel) => fs.readFileSync(path.join(scanRoot, rel), 'utf8');
const testSources = testPaths.map(read);
const specSources = specPaths.map(read);

const findings = scan({ apiRoutes, pageRoutes, testPaths, testSources, specSources });
const counts = countByRule(findings);

if (process.argv.includes('--write')) {
  const payload = {
    _description:
      'API routes no test names, and page routes no e2e spec visits. Measured at a committed ' +
      'revision, never against a dirty tree. These counts only shrink: a new route ships with a ' +
      'test, and the routes below predate the rule.',
    _measuredAt: process.env.RATCHET_REVISION ?? 'unrecorded',
    _scanned: { apiRoutes: apiRoutes.length, pageRoutes: pageRoutes.length },
    maxFindings: counts,
  };
  fs.writeFileSync(path.join(repoRoot, RATCHET_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${RATCHET_PATH}: ${JSON.stringify(counts)}`);
  process.exit(0);
}

const ratchetAbs = path.join(repoRoot, RATCHET_PATH);
if (!fs.existsSync(ratchetAbs)) {
  console.error(`Missing ${RATCHET_PATH}. Run: node scripts/check-route-tests.mjs --write`);
  process.exit(1);
}
const ratchet = JSON.parse(fs.readFileSync(ratchetAbs, 'utf8'));
const errors = checkAgainstRatchet(counts, ratchet);

if (process.argv.includes('--list')) {
  for (const finding of findings) console.log(`  ${finding.file}  [${finding.rule}]`);
}

if (errors.length > 0) {
  console.error('A route with no test is a promise only its author has ever checked.\n');
  for (const error of errors) console.error(`  - ${error}`);
  for (const finding of findings.filter((f) => counts[f.rule] > ratchet.maxFindings[f.rule])) {
    console.error(`    ${finding.file}  ${finding.rule}`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  `Route test check passed (${apiRoutes.length} API routes, ${pageRoutes.length} page routes; ` +
    `${Object.entries(counts)
      .map(([rule, count]) => `${rule} ${count}/${ratchet.maxFindings[rule]}`)
      .join(', ')}).`,
);
