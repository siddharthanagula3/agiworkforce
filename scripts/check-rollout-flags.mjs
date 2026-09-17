#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  REGISTRY_FILES,
  RISKY_SURFACES,
  checkRiskySurfaces,
  findUndeclaredFlagKeys,
} from './lib/rollout-flags.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SOURCE_ROOTS = ['apps/web/app', 'apps/web/features', 'apps/web/lib', 'apps/web/shared'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__', '__mocks__']);

function readFile(relPath) {
  const abs = path.join(scanRoot, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function sourceFiles(dir) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(current, entry.name));
      } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)) {
        out.push(path.join(current, entry.name));
      }
    }
  };
  walk(abs);
  return out;
}

const errors = checkRiskySurfaces(readFile);

for (const registry of REGISTRY_FILES) {
  if (readFile(registry) === null) {
    errors.push(`${registry} is the registry for a family of flag keys and no longer exists`);
  }
}

const undeclared = SOURCE_ROOTS.flatMap((dir) =>
  sourceFiles(dir).flatMap((file) =>
    findUndeclaredFlagKeys(fs.readFileSync(file, 'utf8'), path.relative(scanRoot, file)),
  ),
);
for (const finding of undeclared) {
  errors.push(
    `${finding.file}:${finding.line} spells the flag key ${JSON.stringify(finding.detail)} by hand; ` +
      `derive it from ${REGISTRY_FILES.join(' or ')} so the key an operator types and the key the ` +
      'code reads cannot drift apart',
  );
}

if (errors.length > 0) {
  console.error('Rollout flag check failed:\n');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Rollout flag check passed (${RISKY_SURFACES.length} risky surfaces gated, ` +
    `${REGISTRY_FILES.length} key registries, no hand-spelled keys).`,
);
