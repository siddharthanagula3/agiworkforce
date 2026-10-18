#!/usr/bin/env node
// The control catalog and the evidence collector are two halves of one claim:
// a control that names a collector that no longer exists is evidenced by
// nothing, and a collector no control cites gathers evidence for no one.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CATALOG_PATH,
  COLLECTORS,
  REPO_ROOT,
  controlCounts,
  criteriaCoverage,
  validateCatalog,
} from './compliance/collect-soc2-evidence.mjs';

export function checkSoc2Controls(root = REPO_ROOT) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, CATALOG_PATH), 'utf8'));
  const failures = validateCatalog(catalog, Object.keys(COLLECTORS), (file) =>
    fs.existsSync(path.join(root, file)),
  );
  return { catalog, failures };
}

function main() {
  const { catalog, failures } = checkSoc2Controls(process.cwd());
  if (failures.length > 0) {
    console.error(`${CATALOG_PATH} does not match the evidence collector:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} finding(s).`);
    process.exit(1);
  }
  const counts = controlCounts(catalog);
  const coverage = criteriaCoverage(catalog);
  console.log(
    `check-soc2-controls: ${counts.total} control(s) (${counts.operatedAutomated} operated automated, ` +
      `${counts.operatedManual} operated manual, ${counts.notYetOperated} not yet operated, ` +
      `${counts.outOfScopeCycle1} out of scope for cycle 1) over ${Object.keys(COLLECTORS).length} ` +
      `collector(s); cycle 1 covers ${coverage.cycle1.covered.length} of ${coverage.cycle1.total} ` +
      `in-scope criteria, all categories ${coverage.covered.length} of ${coverage.total}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
