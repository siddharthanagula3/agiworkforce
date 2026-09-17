#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  checkAgainstRatchet,
  countByRule,
  findProductionMocks,
  isProductionPath,
} from './lib/production-mocks.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const RATCHET_PATH = 'scripts/.production-mocks-ratchet.json';

const SOURCE_ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/lib',
  'apps/web/shared',
  'apps/cli/src',
  'apps/desktop/src',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/mobile/src',
  'packages',
  'services',
];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.next', '.turbo']);

function sourceFiles(dir) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(current, entry.name));
      } else if (isProductionPath(path.relative(scanRoot, path.join(current, entry.name)))) {
        out.push(path.join(current, entry.name));
      }
    }
  };
  walk(abs);
  return out;
}

const findings = SOURCE_ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findProductionMocks(fs.readFileSync(file, 'utf8'), path.relative(scanRoot, file)),
  ),
);
const counts = countByRule(findings);

if (process.argv.includes('--write')) {
  const payload = {
    _description:
      'Test doubles reachable from a production path. Measured at a committed revision, never ' +
      'against a dirty tree. These counts only shrink: a shipped path that answers from a fake is ' +
      'a feature that does not exist, and the ratchet exists so the remaining ones are paid down ' +
      'rather than joined. The whole mock-import allowance is apps/desktop/src/lib/tauri-mock.ts, ' +
      'the desktop invoke bridge, which every api/ module imports. It is not a mock at runtime ' +
      '(it refuses fixtures outside test and desktop-ui-dev) but its name says it is; renaming it ' +
      'touches 187 files across a surface this lane does not own, so the count is pinned here ' +
      'until that rename lands and must not grow in the meantime.',
    _measuredAt: process.env.RATCHET_REVISION ?? 'unrecorded',
    maxFindings: counts,
  };
  fs.writeFileSync(path.join(repoRoot, RATCHET_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${RATCHET_PATH}: ${JSON.stringify(counts)}`);
  process.exit(0);
}

const ratchetAbs = path.join(repoRoot, RATCHET_PATH);
if (!fs.existsSync(ratchetAbs)) {
  console.error(`Missing ${RATCHET_PATH}. Run: node scripts/check-production-mocks.mjs --write`);
  process.exit(1);
}
const ratchet = JSON.parse(fs.readFileSync(ratchetAbs, 'utf8'));
const errors = checkAgainstRatchet(counts, ratchet);

if (process.argv.includes('--list')) {
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line}  [${finding.rule}]  ${finding.detail}`);
  }
}

if (errors.length > 0) {
  console.error(
    'A mock in a production path is not a shortcut, it is the feature not existing. The user\n' +
      'reaches the fake, the tests agree with it, and nothing says so.\n',
  );
  for (const error of errors) console.error(`  - ${error}`);
  for (const finding of findings.filter((f) => counts[f.rule] > ratchet.maxFindings[f.rule])) {
    console.error(`    ${finding.file}:${finding.line}  ${finding.detail}`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  `Production mock check passed (${Object.entries(counts)
    .map(([rule, count]) => `${rule} ${count}/${ratchet.maxFindings[rule]}`)
    .join(', ')}).`,
);
