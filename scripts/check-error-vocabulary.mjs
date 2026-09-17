#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_MODULE,
  auditRegistries,
  findErrorRegistries,
  parseCanonicalCodes,
} from './lib/error-vocabulary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SOURCE_ROOTS = ['apps', 'packages', 'services', 'tools'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  'src-tauri',
  'target',
  '__tests__',
  '__mocks__',
  '__fixtures__',
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
      } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec|d)\.tsx?$/.test(entry.name)) {
        out.push(path.join(current, entry.name));
      }
    }
  };
  walk(abs);
  return out;
}

const canonicalAbs = path.join(scanRoot, CANONICAL_MODULE);
if (!fs.existsSync(canonicalAbs)) {
  console.error(`The canonical error registry ${CANONICAL_MODULE} is missing.`);
  process.exit(1);
}
const canonicalCodes = parseCanonicalCodes(fs.readFileSync(canonicalAbs, 'utf8'));
if (canonicalCodes.size < 10) {
  console.error(
    `${CANONICAL_MODULE} parsed as only ${canonicalCodes.size} codes; the registry shape changed ` +
      'and this guard would silently stop catching forks of it.',
  );
  process.exit(1);
}

const registries = SOURCE_ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findErrorRegistries(fs.readFileSync(file, 'utf8'), path.relative(scanRoot, file)),
  ),
);
const errors = auditRegistries(registries, canonicalCodes);

if (process.argv.includes('--list')) {
  for (const registry of registries) {
    console.log(
      `  ${registry.file}:${registry.line}  ${registry.name}  (${registry.members.length})`,
    );
  }
}

if (errors.length > 0) {
  console.error(
    'One condition deserves one name. A second error registry does not just duplicate code, it\n' +
      'lets two surfaces disagree about what happened while both look correct.\n',
  );
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Error vocabulary check passed (${canonicalCodes.size} canonical codes, ` +
    `${registries.length} mirrored-string registries scanned, no fork of the canonical set).`,
);
