#!/usr/bin/env node
/**
 * Every workspace policy key the contract declares is enforced by the server.
 *
 * The keys are enumerated from the contract rather than listed here, so a key
 * added tomorrow is checked tomorrow. A key is enforced when a server module
 * outside the policy CRUD, the policy services and the console UI acts on it:
 * for a feature that means one of the three refusal shapes the server has, and
 * for every other control it means the control is named in a decision at all.
 * Declaring a control, validating it, storing it and drawing a switch for it
 * are not enforcement, which is why those paths are excluded from the scan.
 *
 * A key nothing enforces is a promise to an administrator that the product does
 * not keep. The baseline records the ones that are open today, each with the
 * file that has to change; the set may shrink and never grow.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  BASELINE_FILE,
  CONTRACT_FILE,
  EFFECTIVE_ROUTE_FILE,
  compareToBaseline,
  findUnenforcedKeys,
  servedFamilies,
} from './lib/workspace-policy-enforcement.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const result = findUnenforcedKeys(scanRoot);
if (result.error) {
  console.error(`check-workspace-policy-enforcement: ${result.error}`);
  process.exit(1);
}

const baselinePath = path.join(scanRoot, BASELINE_FILE);
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { unenforced: {} };

const effectiveRoutePath = path.join(scanRoot, EFFECTIVE_ROUTE_FILE);
const served = fs.existsSync(effectiveRoutePath)
  ? servedFamilies(fs.readFileSync(effectiveRoutePath, 'utf8'))
  : new Set();

const { grown, fixed, missingReason, unserved } = compareToBaseline(
  result.unenforced,
  baseline,
  served,
);

if (missingReason.length > 0) {
  console.error('Every baselined key needs a reason and the file that enforces or serves it:');
  for (const key of missingReason) console.error(`  ${key}`);
  process.exit(1);
}

if (unserved.length > 0) {
  console.error(
    `${unserved.length} key(s) are exempted as client-honoured but ${EFFECTIVE_ROUTE_FILE} does not publish them:`,
  );
  for (const key of unserved) console.error(`  ${key}`);
  process.exit(1);
}

if (grown.length > 0) {
  console.error(
    `${grown.length} workspace policy key(s) are declared in ${CONTRACT_FILE} and enforced nowhere on the server:`,
  );
  for (const key of grown) console.error(`  ${key}`);
  console.error('Enforce the key server side, or record it in the baseline with the file to fix.');
  process.exit(1);
}

if (fixed.length > 0) {
  console.error(
    `${fixed.length} baselined key(s) are now enforced. Remove them from the baseline:`,
  );
  for (const key of fixed) console.error(`  ${key}`);
  process.exit(1);
}

console.log(
  `check-workspace-policy-enforcement: ${result.keys.length} declared keys, ` +
    `${result.keys.length - result.unenforced.length} enforced, ${result.unenforced.length} baselined.`,
);
