#!/usr/bin/env node
// Validates the packaged Chrome manifest and refuses a release that acquires a
// permission the published extension did not already hold.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  manifestSchemaViolations,
  permissionDiff,
  permissionDiffViolations,
} from '../lib/rollout/chrome-manifest.mjs';

const RELEASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(RELEASE_DIR, '../..');
const BASELINE_PATH = path.join(RELEASE_DIR, 'chrome-permissions-baseline.json');

function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function main() {
  const requested = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const manifestPath = path.resolve(
    process.cwd(),
    requested ?? path.join(REPO_ROOT, 'apps/extension/manifest.json'),
  );
  const manifest = readManifest(manifestPath);

  if (process.argv.includes('--write-baseline')) {
    const baseline = {
      description:
        'The permissions the published Chrome extension already holds. A release that adds one fails until the addition is reviewed and recorded here.',
      permissions: manifest.permissions ?? [],
      host_permissions: manifest.host_permissions ?? [],
      optional_permissions: manifest.optional_permissions ?? [],
      optional_host_permissions: manifest.optional_host_permissions ?? [],
      approved: [],
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  // The built manifest gains the configured Clerk origins, so only the source
  // manifest is diffed; the packaged one is schema-checked as shipped bytes.
  const schemaOnly = process.argv.includes('--schema-only');
  const baseline = schemaOnly ? null : JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const violations = [
    ...manifestSchemaViolations(manifest),
    ...(baseline === null
      ? []
      : permissionDiffViolations(permissionDiff(baseline, manifest), baseline.approved ?? [])),
  ];
  if (violations.length === 0) {
    console.log(`Chrome manifest valid and permissions unchanged: ${manifestPath}`);
    return;
  }
  for (const violation of violations) console.error(`ERROR: ${violation}`);
  process.exit(1);
}

main();
