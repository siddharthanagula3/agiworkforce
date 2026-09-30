#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAgainstBaseline, countByFile, findRawErrorSinks } from './lib/raw-error-to-user.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = [
  'apps/web/features',
  'apps/web/lib',
  'apps/web/shared',
  'apps/web/app',
  'apps/mobile/app',
  'apps/mobile/src',
  'apps/mobile/components',
  'apps/mobile/hooks',
  'apps/mobile/stores',
  'apps/mobile/services',
  'packages/ui',
];
const BASELINE_PATH = 'audit/baselines/raw-error-to-user.json';

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
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(abs);
  return out;
}

const found = ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findRawErrorSinks(fs.readFileSync(file, 'utf8'), path.relative(root, file)),
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
  console.error(`Missing ${BASELINE_PATH}. Run: pnpm check:raw-error-to-user --write`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselineAbs, 'utf8'));
const errors = checkAgainstBaseline(counts, baseline);

if (errors.length > 0) {
  console.error(
    "A caught error's message can contain runtime, provider, or storage diagnostics.\n" +
      'Show app-authored recovery copy instead of forwarding it to a user-visible sink.\n',
  );
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

const trailer =
  found.length < baseline.total
    ? `down from ${baseline.total}; re-baseline with --write`
    : 'none new';
console.log(`Raw-error-to-user check passed (${found.length} remaining, ${trailer}).`);
