#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  literalStorageKeys,
  persistedStoreName,
  registeredStoreModules,
  sourceFiles,
  storagePatterns,
  workspaceScopedLabels,
} from './lib/workspace-cache-scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const REGISTRY = 'apps/web/shared/stores/authentication-store.ts';
const CLIENT_ROOTS = ['apps/web/shared', 'apps/web/features', 'apps/web/app'];

/**
 * A key that is deliberately not account data. Anything else written to a
 * browser store has to be swept when the account changes, or it outlives the
 * account that wrote it.
 */
const DEVICE_LOCAL_KEYS = [
  {
    key: 'theme',
    reason:
      'The light or dark preference belongs to the browser, not the account: keeping it across a sign-out is the behaviour a reader expects, and it discloses nothing about who was signed in.',
  },
];

const failures = [];
const registryPath = path.join(scanRoot, REGISTRY);

if (!fs.existsSync(registryPath)) {
  console.error(`check-workspace-cache-scope: ${REGISTRY} is missing; nothing sweeps the caches.`);
  process.exit(1);
}

const registrySource = fs.readFileSync(registryPath, 'utf8');
const registered = registeredStoreModules(registrySource);
const workspaceLabels = workspaceScopedLabels(registrySource);
const appPatterns = storagePatterns(registrySource, 'APP_STORAGE_KEY_PATTERNS');
const workspacePatterns = storagePatterns(registrySource, 'WORKSPACE_STORAGE_KEY_PATTERNS');

for (const [name, value] of Object.entries({
  USER_SCOPED_STORE_MODULES: registered,
  WORKSPACE_SCOPED_STORE_LABELS: workspaceLabels,
  APP_STORAGE_KEY_PATTERNS: appPatterns,
  WORKSPACE_STORAGE_KEY_PATTERNS: workspacePatterns,
})) {
  if (value === null || value.length === 0) {
    failures.push(`${name} is missing or unreadable in ${REGISTRY}; the sweep has nothing to do`);
  }
}

if (failures.length === 0) {
  const labels = new Set(registered.map((entry) => entry.label));
  for (const label of workspaceLabels) {
    if (!labels.has(label)) {
      failures.push(
        `WORKSPACE_SCOPED_STORE_LABELS names '${label}', which is not a registered store; ` +
          `a workspace switch silently skips it`,
      );
    }
  }

  if (!/account/.test(registrySource) || !/workspace/.test(registrySource)) {
    failures.push('the recorded cache scope no longer carries both an account and a workspace');
  }

  const registeredSpecifiers = new Set(
    registered.map((entry) => entry.specifier.replace(/^[./]+/, '').replace(/^@\/?/, '')),
  );

  const files = CLIENT_ROOTS.flatMap((root) => sourceFiles(path.join(scanRoot, root)));
  if (files.length === 0) failures.push('no client modules found; the scan would pass vacuously');

  let persistedCount = 0;
  let keyCount = 0;

  for (const file of files) {
    const relative = path.relative(scanRoot, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');

    if (persistedStoreName(source) !== null) {
      persistedCount += 1;
      const moduleId = relative.replace(/^apps\/web\//, '').replace(/\.tsx?$/, '');
      const known = [...registeredSpecifiers].some(
        (specifier) => moduleId === specifier || moduleId.endsWith(`/${specifier}`),
      );
      if (!known) {
        failures.push(
          `${relative} persists state to the browser but is not in USER_SCOPED_STORE_MODULES, ` +
            `so what it holds survives a sign-out and a workspace switch`,
        );
      }
    }

    for (const key of literalStorageKeys(source)) {
      keyCount += 1;
      if (appPatterns.some((pattern) => pattern.test(key))) continue;
      const exemption = DEVICE_LOCAL_KEYS.find((entry) => entry.key === key);
      if (exemption) {
        if (exemption.reason.trim().length < 60) {
          failures.push(`the exemption for '${key}' needs a real reason`);
        }
        continue;
      }
      failures.push(
        `${relative} writes '${key}' to browser storage, which no APP_STORAGE_KEY_PATTERNS entry ` +
          `matches, so signing out leaves it behind`,
      );
    }
  }

  for (const entry of DEVICE_LOCAL_KEYS) {
    const used = files.some((file) =>
      literalStorageKeys(fs.readFileSync(file, 'utf8')).includes(entry.key),
    );
    if (!used && scanRoot === repoRoot) {
      failures.push(`stale exemption: nothing writes '${entry.key}' any more`);
    }
  }

  if (failures.length === 0) {
    console.log(
      `check-workspace-cache-scope: ${registered.length} registered stores, ` +
        `${workspaceLabels.length} dropped on a workspace switch, ${persistedCount} persisted ` +
        `modules and ${keyCount} storage keys accounted for.`,
    );
    process.exit(0);
  }
}

console.error('Local state that outlives the account or workspace that wrote it:\n');
for (const failure of failures) console.error(`  - ${failure}`);
console.error(`\n${failures.length} finding(s).`);
process.exit(1);
