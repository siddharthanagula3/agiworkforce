#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readChromeBuildConfiguration, validateReleaseManifest } from './manifest-config.mjs';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
);
const requestedPath = process.argv[2];
const packagePath = requestedPath
  ? path.resolve(process.cwd(), requestedPath)
  : path.join(extensionRoot, 'extension.zip');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function unzip(args) {
  const result = spawnSync('unzip', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    fail('unzip is required to inspect the Chrome Web Store package');
  }
  if (result.status !== 0) {
    fail(result.stderr?.trim() || `unzip ${args[0]} failed`);
  }
  return result.stdout;
}

if (!fs.existsSync(packagePath) || !fs.statSync(packagePath).isFile()) {
  fail(`Chrome package does not exist: ${packagePath}`);
}
if (fs.statSync(packagePath).size === 0) fail('Chrome package is empty');

const entries = unzip(['-Z1', packagePath]).split(/\r?\n/u).filter(Boolean);
if (entries.length === 0) fail('Chrome package archive is empty');

const normalizedEntries = entries.map((entry) => entry.replaceAll('\\', '/'));
const duplicateEntries = normalizedEntries.filter(
  (entry, index) => normalizedEntries.indexOf(entry) !== index,
);
if (duplicateEntries.length > 0) {
  fail(
    `Chrome package contains duplicate archive paths:\n${[...new Set(duplicateEntries)].join('\n')}`,
  );
}

const caseInsensitivePaths = new Map();
const caseCollisions = [];
for (const entry of normalizedEntries) {
  const key = entry.toLowerCase();
  const existing = caseInsensitivePaths.get(key);
  if (existing !== undefined && existing !== entry) caseCollisions.push(`${existing} <> ${entry}`);
  else caseInsensitivePaths.set(key, entry);
}
if (caseCollisions.length > 0) {
  fail(`Chrome package contains case-colliding archive paths:\n${caseCollisions.join('\n')}`);
}

const invalidPaths = entries.filter((entry) => {
  const normalized = entry.replaceAll('\\', '/');
  return (
    entry !== normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..') ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  );
});
if (invalidPaths.length > 0) {
  fail(`Chrome package contains unsafe archive paths:\n${invalidPaths.join('\n')}`);
}

const archiveListing = unzip(['-Z', '-l', packagePath]);
const archiveRows = archiveListing
  .split(/\r?\n/u)
  .filter((line) => /^[bcdlps-][rwxStTs-]{9}\s/u.test(line));
if (archiveRows.length !== entries.length) {
  fail(`expected metadata for ${entries.length} archive entries, found ${archiveRows.length}`);
}
let totalUncompressedBytes = 0;
for (const row of archiveRows) {
  const kind = row[0];
  if (kind !== '-' && kind !== 'd') {
    fail(`Chrome package contains a non-file archive entry: ${row.trim()}`);
  }
  const size = Number(row.trim().split(/\s+/u)[3]);
  if (!Number.isSafeInteger(size) || size < 0 || size > 16 * 1024 * 1024) {
    fail(`Chrome package entry has an invalid or excessive uncompressed size: ${row.trim()}`);
  }
  totalUncompressedBytes += size;
}
if (totalUncompressedBytes > 64 * 1024 * 1024) {
  fail(`Chrome package expands beyond the 64 MiB verification limit`);
}
unzip(['-t', packagePath]);

const forbiddenEntries = entries.filter((entry) => {
  const lower = entry.toLowerCase();
  return (
    lower === '.env' ||
    lower.startsWith('.env.') ||
    lower.includes('/.env') ||
    lower.endsWith('.map') ||
    lower.endsWith('.log') ||
    lower.endsWith('.ts') ||
    lower === '.ds_store' ||
    lower.startsWith('__tests__/') ||
    lower.startsWith('scripts/') ||
    lower.startsWith('node_modules/') ||
    lower.startsWith('.git/') ||
    lower.startsWith('.github/')
  );
});
if (forbiddenEntries.length > 0) {
  fail(
    `Chrome package contains development-only or sensitive files:\n${forbiddenEntries.join('\n')}`,
  );
}

const manifestEntries = entries.filter((entry) => entry === 'manifest.json');
if (manifestEntries.length !== 1) {
  fail(`expected one manifest.json, found ${manifestEntries.length}`);
}

let packagedManifest;
try {
  packagedManifest = JSON.parse(unzip(['-p', packagePath, 'manifest.json']));
} catch (error) {
  fail(`packaged Chrome manifest is invalid JSON: ${error.message}`);
}

for (const field of ['name', 'version', 'manifest_version', 'minimum_chrome_version']) {
  if (packagedManifest[field] !== sourceManifest[field]) {
    fail(
      `packaged ${field} ${JSON.stringify(packagedManifest[field])} does not match source ${JSON.stringify(sourceManifest[field])}`,
    );
  }
}

try {
  validateReleaseManifest(packagedManifest, readChromeBuildConfiguration(process.env));
} catch (error) {
  fail(error.message);
}

for (const entry of [
  packagedManifest.background?.service_worker,
  ...packagedManifest.content_scripts.flatMap((script) => script.js ?? []),
  packagedManifest.side_panel?.default_path,
  packagedManifest.options_page,
]) {
  if (typeof entry !== 'string' || !entries.includes(entry)) {
    fail(`packaged Chrome entry point is missing: ${entry ?? '<unset>'}`);
  }
}

console.log(
  `Verified ${path.basename(packagePath)}: ${packagedManifest.name} ${packagedManifest.version}, MV${packagedManifest.manifest_version}, ${entries.length} archive entries.`,
);
