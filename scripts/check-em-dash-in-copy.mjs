#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAgainstBaseline, countByFile, findEmDashes } from './lib/em-dash-in-copy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'packages/ui/ui/src',
  'packages/ui/unified-chat/src',
];

const BASELINE_PATH = 'audit/em-dash-in-copy.json';

function sourceFiles(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', 'dist', '__tests__'].includes(entry.name)) continue;
        walk(full);
      } else if (
        (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
        !entry.name.includes('.test.') &&
        !entry.name.includes('.spec.')
      ) {
        out.push(full);
      }
    }
  };
  walk(abs);
  return out;
}

const found = ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findEmDashes(fs.readFileSync(file, 'utf8'), path.relative(root, file)),
  ),
);
const counts = countByFile(found);

if (process.argv.includes('--write')) {
  fs.writeFileSync(
    path.join(root, BASELINE_PATH),
    `${JSON.stringify({ total: found.length, perFile: counts }, null, 2)}\n`,
  );
  console.log(`Wrote baseline: ${found.length} across ${Object.keys(counts).length} files.`);
  process.exit(0);
}

const baselineAbs = path.join(root, BASELINE_PATH);
if (!fs.existsSync(baselineAbs)) {
  console.error(`Missing ${BASELINE_PATH}. Run: pnpm check:em-dash --write`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselineAbs, 'utf8'));
const errors = checkAgainstBaseline(counts, baseline);

if (errors.length > 0) {
  console.error(
    'This product does not use em dashes in copy a reader sees.\n' +
      'Rewrite instead of substituting: a colon introduces what follows, a period\n' +
      'separates two independent clauses, and a pair of dashes is parentheses.\n' +
      'Do not swap in a comma between two independent clauses; that is a splice.\n',
  );
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

const trailer =
  found.length < baseline.total
    ? `down from ${baseline.total}; re-baseline with --write to lock in the improvement`
    : 'none new';
console.log(`Em dash copy check passed (${found.length} remaining, ${trailer}).`);
