#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  FIRST_DRAFT_ARCHIVE_SUFFIX,
  readChromeBuildConfiguration,
  validateReleaseManifest,
} from './manifest-config.mjs';

const STORE_SUMMARY_MAX_CHARACTERS = 132;
const STORE_ICON_SIZE = '128';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
);
const cliArguments = process.argv.slice(2);
const firstDraft = cliArguments.includes('--first-draft');
const requestedPath = cliArguments.find((argument) => !argument.startsWith('--'));
const packagePath = requestedPath
  ? path.resolve(process.cwd(), requestedPath)
  : path.join(
      extensionRoot,
      firstDraft ? `extension${FIRST_DRAFT_ARCHIVE_SUFFIX}` : 'extension.zip',
    );

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function runUnzip(args, encoding) {
  const result = spawnSync('unzip', args, {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    fail('unzip is required to inspect the Chrome Web Store package');
  }
  if (result.status !== 0) {
    fail(String(result.stderr ?? '').trim() || `unzip ${args[0]} failed`);
  }
  return result.stdout;
}

function unzip(args) {
  return runUnzip(args, 'utf8');
}

function unzipBytes(entry) {
  return runUnzip(['-p', packagePath, entry], 'buffer');
}

if (firstDraft !== path.basename(packagePath).endsWith(FIRST_DRAFT_ARCHIVE_SUFFIX)) {
  fail(
    firstDraft
      ? `a first-draft package must be named *${FIRST_DRAFT_ARCHIVE_SUFFIX} so it is never mistaken for a release`
      : `${path.basename(packagePath)} is a first-draft package; only a release package may be submitted`,
  );
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
    [...normalized].some((character) => {
      const code = character.codePointAt(0);
      return code < 0x20 || code === 0x7f;
    })
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
  validateReleaseManifest(packagedManifest, readChromeBuildConfiguration(process.env), {
    firstDraft,
  });
} catch (error) {
  fail(error.message);
}

function localizedManifestText(field) {
  const value = packagedManifest[field];
  if (typeof value !== 'string') return undefined;
  const placeholder = /^__MSG_([A-Za-z0-9_@]+)__$/u.exec(value);
  if (!placeholder) return value;
  const messagesPath = `_locales/${packagedManifest.default_locale}/messages.json`;
  if (!entries.includes(messagesPath)) {
    fail(`manifest ${field} names ${value} but ${messagesPath} is not packaged`);
  }
  let messages;
  try {
    messages = JSON.parse(unzip(['-p', packagePath, messagesPath]));
  } catch (error) {
    fail(`${messagesPath} is invalid JSON: ${error.message}`);
  }
  const key = placeholder[1].toLowerCase();
  const match = Object.entries(messages).find(([name]) => name.toLowerCase() === key);
  return typeof match?.[1]?.message === 'string' ? match[1].message : undefined;
}

const storeSummary = localizedManifestText('description')?.trim();
if (!storeSummary) {
  fail('packaged manifest description is empty; the store listing reads its summary from it');
}
if ([...storeSummary].length > STORE_SUMMARY_MAX_CHARACTERS) {
  fail(
    `packaged manifest description has ${[...storeSummary].length} characters; the limit is ${STORE_SUMMARY_MAX_CHARACTERS}`,
  );
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const declaredIcons = [
  ...Object.entries(packagedManifest.icons ?? {}),
  ...Object.entries(packagedManifest.action?.default_icon ?? {}),
];
if (typeof packagedManifest.icons?.[STORE_ICON_SIZE] !== 'string') {
  fail(`packaged manifest declares no ${STORE_ICON_SIZE}x${STORE_ICON_SIZE} icon`);
}
for (const [size, iconPath] of declaredIcons) {
  if (typeof iconPath !== 'string' || !entries.includes(iconPath)) {
    fail(`packaged icon ${size} is missing: ${iconPath ?? '<unset>'}`);
  }
  const dimensions = pngDimensions(unzipBytes(iconPath));
  if (!dimensions) fail(`packaged icon ${iconPath} is not a PNG`);
  if (String(dimensions.width) !== size || String(dimensions.height) !== size) {
    fail(
      `packaged icon ${iconPath} is ${dimensions.width}x${dimensions.height}, declared as ${size}x${size}`,
    );
  }
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
  `Verified ${firstDraft ? 'first-draft ' : ''}${path.basename(packagePath)}: ${packagedManifest.name} ${packagedManifest.version}, MV${packagedManifest.manifest_version}, ${entries.length} archive entries.`,
);
