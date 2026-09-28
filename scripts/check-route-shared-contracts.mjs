#!/usr/bin/env node
/**
 * Every API route a client calls imports its body contract from a shared
 * contract package, so the route and each surface that reads it parse one
 * definition. Routes that predate the rule are listed in the baseline, which
 * only shrinks: a listed route that now imports a shared contract, or that no
 * client calls any more, has to leave the list.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  BASELINE_FILE,
  SHARED_CONTRACT_PACKAGES,
  auditRouteContracts,
  compareWithBaseline,
} from './lib/route-shared-contracts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const baselinePath = path.join(scanRoot, BASELINE_FILE);
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { routes: [] };

const { called, missing } = auditRouteContracts(scanRoot);
if (called.length === 0) {
  console.error(
    'check-route-shared-contracts: no client-called route was found, which cannot be right.',
  );
  process.exit(1);
}

const { unexpected, stale } = compareWithBaseline(missing, baseline);

if (unexpected.length > 0) {
  console.error(
    `${unexpected.length} client-called route(s) import no shared contract. Import the body ` +
      `schema from one of ${SHARED_CONTRACT_PACKAGES.join(', ')}:`,
  );
  for (const route of unexpected) console.error(`  /api/${route}`);
  process.exit(1);
}

if (stale.length > 0) {
  console.error(
    `${stale.length} baseline route(s) no longer need an exception. Remove them from ${BASELINE_FILE}:`,
  );
  for (const route of stale) console.error(`  /api/${route}`);
  process.exit(1);
}

console.log(
  `check-route-shared-contracts: ${called.length} client-called routes, ` +
    `${called.length - missing.length} on a shared contract, ${missing.length} baselined.`,
);
