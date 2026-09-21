#!/usr/bin/env node

/**
 * Every environment key the web app reads, measured against the config key
 * registry rather than against a list somebody maintains by hand. A key nobody
 * classified is a key nobody decided the secrecy of, the owner of, or which
 * environments may set it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BASELINE_PATH = 'scripts/config/config-keys.json';

export const REGISTRY_PATH = 'apps/web/lib/validate-env.ts';

export const SCANNED_ROOTS = Object.freeze(['apps/web/app', 'apps/web/lib', 'apps/web/features']);

const CLIENT_READABLE_PREFIX = 'NEXT_PUBLIC_';

/** A name that says the value is a credential, however it is stored. */
export const CREDENTIAL_NAME = /(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_PEPPER|_SALT|_CREDENTIALS)$/;

/** Named credentials whose value is published on purpose. */
export const PUBLISHED_CREDENTIAL_NAMES = Object.freeze([
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'WEB_PUSH_VAPID_PUBLIC_KEY',
]);

const EXCLUDED_DIRECTORY =
  /^(__tests__|__mocks__|__fixtures__|node_modules|dist|build|coverage|e2e|\.next)$/;

const ENV_READ =
  /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\])/g;

export function productFiles(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRECTORY.test(entry.name) ? [] : productFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(test|spec|d)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

/** Every key the tree reads, with the files that read it. */
export function readKeys(repoRoot = REPO_ROOT, roots = SCANNED_ROOTS) {
  const keys = new Map();
  let files = 0;
  for (const root of roots) {
    for (const file of productFiles(path.join(repoRoot, root))) {
      files += 1;
      const relative = path.relative(repoRoot, file);
      const source = readFileSync(file, 'utf8');
      ENV_READ.lastIndex = 0;
      let match;
      while ((match = ENV_READ.exec(source)) !== null) {
        const key = match[1] ?? match[2];
        const readers = keys.get(key) ?? new Set();
        readers.add(relative);
        keys.set(key, readers);
      }
    }
  }
  return { keys, files };
}

/**
 * The registry is TypeScript with a validate callback per key, so it is read
 * for the names it declares rather than imported through the web path alias.
 */
export function registeredKeys(repoRoot = REPO_ROOT) {
  const source = readFileSync(path.join(repoRoot, REGISTRY_PATH), 'utf8');
  const block = source.slice(
    source.indexOf('const CONFIG_KEY_DESCRIPTORS'),
    source.indexOf('const CONFIG_KEY_REGISTRY'),
  );
  return new Set(
    [...block.matchAll(/(?:secret|published)\(\s*\n?\s*'([A-Z][A-Z0-9_]*)'/g)].map(
      (match) => match[1],
    ),
  );
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, BASELINE_PATH), 'utf8'));
}

export function checkConfigKeyCoverage(repoRoot = REPO_ROOT, roots = SCANNED_ROOTS) {
  const errors = [];
  const baseline = loadBaseline(repoRoot);
  const { keys, files } = readKeys(repoRoot, roots);
  const registered = registeredKeys(repoRoot);

  if (files === 0) {
    return { errors: [`${roots.join(', ')}: no product file was read.`], report: { files } };
  }

  const unregistered = new Map();
  for (const entry of baseline.unregistered ?? []) {
    unregistered.set(entry.key, entry);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${entry.key} carries no reason.`);
    }
    if (registered.has(entry.key)) {
      errors.push(`${BASELINE_PATH}: ${entry.key} is registered now. Delete the entry.`);
    }
  }

  for (const [key, readers] of keys) {
    const published = key.startsWith(CLIENT_READABLE_PREFIX);
    if (published && CREDENTIAL_NAME.test(key) && !PUBLISHED_CREDENTIAL_NAMES.includes(key)) {
      errors.push(
        `${[...readers][0]}: ${key} is named a credential and named ${CLIENT_READABLE_PREFIX}, ` +
          'so the bundler writes its value into every browser bundle.',
      );
    }
    if (registered.has(key) || unregistered.has(key)) continue;
    errors.push(
      `${[...readers][0]}: ${key} is read but is in neither the registry in ${REGISTRY_PATH} nor ` +
        `${BASELINE_PATH}. Declare its owner, default, secrecy and environments, or record why ` +
        'it is not configuration.',
    );
  }

  const elsewhere = new Map();
  for (const entry of baseline.registeredButUnread ?? []) {
    elsewhere.set(entry.key, entry);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${entry.key} names no reader outside the scanned roots.`);
    }
    if (!registered.has(entry.key)) {
      errors.push(`${BASELINE_PATH}: ${entry.key} is not registered. Delete the entry.`);
    }
    if (keys.has(entry.key)) {
      errors.push(`${BASELINE_PATH}: ${entry.key} is read here after all. Delete the entry.`);
    }
  }

  for (const key of registered) {
    if (keys.has(key) || elsewhere.has(key)) continue;
    errors.push(
      `${REGISTRY_PATH}: ${key} is registered but nothing under ${roots.join(', ')} reads it.`,
    );
  }

  for (const entry of baseline.unregistered ?? []) {
    if (keys.has(entry.key)) continue;
    errors.push(`${BASELINE_PATH}: ${entry.key} is no longer read. Delete the entry.`);
  }

  return {
    errors,
    report: { files, keys: keys.size, registered: registered.size, baselined: unregistered.size },
  };
}

function main() {
  const { errors, report } = checkConfigKeyCoverage();
  if (errors.length > 0) {
    console.error('Config key check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `check-config-keys: OK (${report.keys} keys read in ${report.files} files, ` +
      `${report.registered} registered, ${report.baselined} recorded)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
