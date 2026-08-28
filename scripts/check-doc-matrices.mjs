#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { outDir, renderMatrices } from './generate-doc-matrices.mjs';

const stale = [];
const missing = [];

for (const [name, expected] of Object.entries(renderMatrices())) {
  const committed = path.join(outDir, name);
  if (!fs.existsSync(committed)) {
    missing.push(name);
    continue;
  }
  if (fs.readFileSync(committed, 'utf8') !== expected) stale.push(name);
}

if (missing.length > 0 || stale.length > 0) {
  console.error('docs/generated/ matrices are out of date:');
  for (const name of missing) console.error(`- missing ${name}`);
  for (const name of stale) console.error(`- changed ${name}`);
  console.error('Run: node scripts/generate-doc-matrices.mjs');
  process.exit(1);
}

console.log(`Verified ${Object.keys(renderMatrices()).length} generated doc matrices.`);
