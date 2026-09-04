#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { countByFile, findEmDashes } from './lib/em-dash-in-copy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXCLUDE_EXACT = new Set([
  'THIRD_PARTY_LICENSES.md',
  'apps/web/AGENTS.md',
  'scripts/lib/em-dash-in-copy.mjs',
  'scripts/check-em-dash-in-copy.test.mjs',
]);
const EXCLUDE_PREFIX = ['apps/web/db/neon/'];
const EXCLUDE_SUFFIX = ['pnpm-lock.yaml', 'Cargo.lock'];
const EXCLUDE_BASENAME = new Set(['LICENSE', 'LICENSE.md', 'LICENSE.txt']);

function isExcluded(rel) {
  if (EXCLUDE_EXACT.has(rel)) return true;
  for (const prefix of EXCLUDE_PREFIX) if (rel.startsWith(prefix)) return true;
  for (const suffix of EXCLUDE_SUFFIX) if (rel.endsWith(suffix)) return true;
  if (EXCLUDE_BASENAME.has(path.basename(rel))) return true;
  return false;
}

function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1024 * 1024 * 64 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function isBinary(absPath) {
  let buf;
  try {
    buf = fs.readFileSync(absPath);
  } catch {
    return true;
  }
  return buf.includes(0);
}

const argFiles = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const relFiles =
  argFiles.length > 0
    ? argFiles.map((file) => path.relative(root, path.resolve(file)))
    : listTrackedFiles();

const found = relFiles
  .filter((rel) => !isExcluded(rel))
  .flatMap((rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || isBinary(abs)) return [];
    return findEmDashes(fs.readFileSync(abs, 'utf8'), rel);
  });

if (found.length > 0) {
  console.error(
    'This codebase does not use em dashes anywhere: not in copy, not in comments,\n' +
      'not in test fixtures. Rewrite instead of substituting: a comma joins two\n' +
      'clauses, a colon introduces a label, and a period closes a sentence.\n',
  );
  const counts = countByFile(found);
  for (const [file, count] of Object.entries(counts)) {
    console.error(`  ${file}: ${count} em dash(es)`);
  }
  console.error(`\n${found.length} em dash(es) across ${Object.keys(counts).length} file(s).`);
  process.exit(1);
}

console.log('Em dash check passed: zero em dashes found.');
