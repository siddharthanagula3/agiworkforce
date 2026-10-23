#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildNotices,
  collectNpmProductionGraph,
} from '../../../scripts/lib/third-party-notices.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webRoot, '../..');
export const OUTPUT_FILE = path.join(webRoot, 'public/legal/third-party-notices.json');

export function generate() {
  const records = new Map();
  const unresolved = collectNpmProductionGraph(records, webRoot, 'web');
  return { notices: buildNotices(records), unresolved };
}

function main() {
  const { notices, unresolved } = generate();
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(notices)}\n`, 'utf8');
  console.log(
    `Wrote ${path.relative(repoRoot, OUTPUT_FILE)}: ${notices.packages.length} packages, ${Object.keys(notices.texts).length} unique notice texts.`,
  );
  if (unresolved.size > 0) {
    console.log(`Skipped ${unresolved.size} web dependencies that are not installed here.`);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
