#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAgainstBaseline, countByFile, findUnpaired } from './lib/theme-only-text-colours.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROOTS = [
  'packages/ui/unified-chat/src',
  'packages/ui/ui/src',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/app',
];

const BASELINE_PATH = 'audit/theme-only-text-colours.json';

function sourceFiles(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', 'dist'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.name.endsWith('.tsx')) {
        out.push(full);
      }
    }
  };
  walk(abs);
  return out;
}

const found = ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findUnpaired(fs.readFileSync(file, 'utf8'), path.relative(root, file)),
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
  console.error(`Missing ${BASELINE_PATH}. Run: pnpm check:theme-text-colours --write`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselineAbs, 'utf8'));
const errors = checkAgainstBaseline(counts, baseline);

if (errors.length > 0) {
  console.error(
    'A 200-400 shade is a dark-theme value. Over a light surface it lands near 1.5:1 -\n' +
      'measured: text-rose-300 on bg-rose-500/10 over white is 1.66:1, text-amber-300 is 1.33:1.\n' +
      'Pair it: text-<family>-700 dark:text-<family>-300.\n' +
      'If the element genuinely sits on a surface that is dark in BOTH themes, measure the\n' +
      "painted background first - a token's name is not evidence of what is behind it - then\n" +
      're-baseline with --write and say why in the commit.\n',
  );
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

const trailer =
  found.length < baseline.total
    ? `down from ${baseline.total}; re-baseline with --write to lock in the improvement`
    : 'none new';
console.log(`Theme-only text colour check passed (${found.length} unpaired, ${trailer}).`);
