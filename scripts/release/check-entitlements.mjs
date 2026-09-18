#!/usr/bin/env node
// Refuses a macOS build whose entitlements differ from the reviewed baseline,
// and any build carrying an entitlement that defeats the hardened runtime.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { entitlementViolations, parseEntitlements } from '../lib/rollout/entitlements.mjs';

const RELEASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(RELEASE_DIR, '../..');
const PLIST_PATH = path.join(REPO_ROOT, 'apps/desktop/src-tauri/entitlements.plist');
const BASELINE_PATH = path.join(RELEASE_DIR, 'entitlements-baseline.json');

function main() {
  // `--signed <plist>` reads the entitlements the shipped bundle actually
  // carries (codesign -d --entitlements), not the ones the source asked for.
  const signedIndex = process.argv.indexOf('--signed');
  const source =
    signedIndex === -1 ? PLIST_PATH : path.resolve(process.cwd(), process.argv[signedIndex + 1]);
  const current = parseEntitlements(readFileSync(source, 'utf8'));

  if (process.argv.includes('--write-baseline')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Wrote ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const violations = entitlementViolations(baseline, current);
  if (violations.length === 0) {
    console.log(
      `Entitlements match the reviewed baseline (${Object.keys(current).length} keys from ` +
        `${path.relative(REPO_ROOT, source)})`,
    );
    return;
  }
  for (const violation of violations) console.error(`ERROR: ${violation}`);
  console.error(
    '\nAn entitlement change is a security review, not a rebase. Justify it in ' +
      'entitlements.plist, then re-record the baseline with --write-baseline.',
  );
  process.exit(1);
}

main();
