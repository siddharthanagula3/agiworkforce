#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkAgainstRatchet, countByRule, scanRoute } from './lib/route-observability.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const RATCHET_PATH = 'scripts/.route-observability-ratchet.json';
const API_ROOT = 'apps/web/app/api';

function routeFiles() {
  const abs = path.join(scanRoot, API_ROOT);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^route\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

const files = routeFiles();
const findings = files.flatMap((file) =>
  scanRoute(fs.readFileSync(file, 'utf8'), path.relative(scanRoot, file)),
);
const counts = countByRule(findings);

if (process.argv.includes('--write')) {
  const payload = {
    _description:
      'API routes with no structured logging, and console calls inside routes. Measured at a ' +
      'committed revision, never against a dirty tree. These counts only shrink. A new route ' +
      'imports the logger or wraps its handler in withErrorHandler; the remaining few predate the ' +
      'rule and are a bounded debt, not an allowlist.',
    _measuredAt: process.env.RATCHET_REVISION ?? 'unrecorded',
    _routesScanned: files.length,
    maxFindings: counts,
  };
  fs.writeFileSync(path.join(repoRoot, RATCHET_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${RATCHET_PATH}: ${JSON.stringify(counts)}`);
  process.exit(0);
}

const ratchetAbs = path.join(repoRoot, RATCHET_PATH);
if (!fs.existsSync(ratchetAbs)) {
  console.error(`Missing ${RATCHET_PATH}. Run: node scripts/check-route-observability.mjs --write`);
  process.exit(1);
}
const ratchet = JSON.parse(fs.readFileSync(ratchetAbs, 'utf8'));
const errors = checkAgainstRatchet(counts, ratchet);

if (process.argv.includes('--list')) {
  for (const finding of findings) {
    console.log(`  ${finding.file}${finding.line ? `:${finding.line}` : ''}  [${finding.rule}]`);
  }
}

if (errors.length > 0) {
  console.error(
    'An unlogged route is invisible during the incident it causes: no request id, no level,\n' +
      'no record it was ever called.\n',
  );
  for (const error of errors) console.error(`  - ${error}`);
  for (const finding of findings.filter((f) => counts[f.rule] > ratchet.maxFindings[f.rule])) {
    console.error(`    ${finding.file}${finding.line ? `:${finding.line}` : ''}  ${finding.rule}`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  `Route observability check passed over ${files.length} routes (${Object.entries(counts)
    .map(([rule, count]) => `${rule} ${count}/${ratchet.maxFindings[rule]}`)
    .join(', ')}).`,
);
