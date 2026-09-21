#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { deliveredFactories, findDeliveredRawMessages } from './lib/delivered-error-messages.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const FACTORY_TABLE = 'packages/platform/utils/src/errors.ts';
const ERROR_HANDLER = 'apps/web/lib/error-handler.ts';
const DENIAL_CODES = 'packages/contracts/types/src/errors.ts';
const SCANNED = ['apps/web/app/api', 'apps/web/lib'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '__tests__', '__mocks__', '.next']);

function read(relative) {
  const file = path.join(scanRoot, relative);
  if (!fs.existsSync(file)) {
    console.error(`check-delivered-error-messages: ${relative} is missing.`);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
}

function* sourceFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

const { delivered, exposed } = deliveredFactories({
  factorySource: read(FACTORY_TABLE),
  handlerSource: read(ERROR_HANDLER),
  denialSource: read(DENIAL_CODES),
});

if (delivered.size === 0) {
  console.error(
    `check-delivered-error-messages: no delivered factory resolved from ${FACTORY_TABLE} ` +
      `and ${ERROR_HANDLER}; the check would pass vacuously.`,
  );
  process.exit(1);
}

const findings = [];
let scanned = 0;
for (const root of SCANNED) {
  for (const file of sourceFiles(path.join(scanRoot, root))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('createError.') && !source.includes('asUserSafe')) continue;
    scanned += 1;
    const relative = path.relative(scanRoot, file).split(path.sep).join('/');
    findings.push(...findDeliveredRawMessages(source, relative, delivered));
  }
}

if (findings.length === 0) {
  console.log(
    `check-delivered-error-messages: ${scanned} files checked against ` +
      `${delivered.size} delivered factories (${exposed.size} exposed codes); ` +
      `no caught exception reaches a caller in its own words.`,
  );
  process.exit(0);
}

console.error('Errors delivered to a caller in the words of whatever was thrown:\n');
for (const finding of findings) {
  console.error(`  - ${finding.file}:${finding.line}  ${finding.text}`);
}
console.error(
  `\n${findings.length} finding(s). Name the condition and the next step instead, and log the ` +
    'caught error rather than forwarding it.',
);
process.exit(1);
