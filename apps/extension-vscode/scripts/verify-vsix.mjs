#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { PACKAGED_RUNTIME_OUTPUT_ALLOWLIST } = require('./vsce-package.js');
const { inspectVsixArchive } = require('./vsix-zip.js');
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'),
);
const expectedFilename = `${sourceManifest.name}-${sourceManifest.version}.vsix`;
const requestedPath = process.argv[2];
const extractFlagIndex = process.argv.indexOf('--extract');
const extractTo =
  extractFlagIndex < 0
    ? undefined
    : process.argv[extractFlagIndex + 1] === undefined
      ? fail('--extract requires a destination directory')
      : path.resolve(process.cwd(), process.argv[extractFlagIndex + 1]);
const vsixPath = requestedPath
  ? path.resolve(process.cwd(), requestedPath)
  : path.join(extensionRoot, expectedFilename);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(vsixPath) || !fs.statSync(vsixPath).isFile()) {
  fail(`VSIX does not exist: ${vsixPath}`);
}
if (path.basename(vsixPath) !== expectedFilename) {
  fail(`expected VSIX filename ${expectedFilename}, got ${path.basename(vsixPath)}`);
}

let archive;
try {
  archive = await inspectVsixArchive(vsixPath, extractTo === undefined ? {} : { extractTo });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const entries = archive.entries;

const forbiddenEntries = entries.filter((entry) => {
  const relative = entry.replace(/^extension\//u, '');
  const lower = relative.toLowerCase();
  return (
    lower === '.env' ||
    lower.startsWith('.env.') ||
    lower.includes('/.env') ||
    lower.endsWith('.map') ||
    lower.endsWith('.log') ||
    lower.startsWith('src/') ||
    lower.startsWith('scripts/') ||
    lower.startsWith('.git/') ||
    lower.startsWith('.github/') ||
    lower.startsWith('.turbo/') ||
    /^tsconfig(?:\..+)?\.json$/u.test(lower) ||
    /^vitest\..+\.config\.ts$/u.test(lower) ||
    ['agents.md', 'marketplace_publish_runbook.md'].includes(lower)
  );
});
if (forbiddenEntries.length > 0) {
  fail(`VSIX contains development-only or sensitive files:\n${forbiddenEntries.join('\n')}`);
}

const runtimeEntries = entries
  .filter((entry) => entry.startsWith('extension/out/') && !entry.endsWith('/'))
  .map((entry) => entry.replace(/^extension\//u, ''));
const allowedRuntimeEntries = new Set(PACKAGED_RUNTIME_OUTPUT_ALLOWLIST);
const unexpectedRuntimeEntries = runtimeEntries.filter(
  (entry) => !allowedRuntimeEntries.has(entry),
);
const missingRuntimeEntries = PACKAGED_RUNTIME_OUTPUT_ALLOWLIST.filter(
  (entry) => !runtimeEntries.includes(entry),
);
if (unexpectedRuntimeEntries.length > 0 || missingRuntimeEntries.length > 0) {
  const details = [];
  if (unexpectedRuntimeEntries.length > 0) {
    details.push(`unexpected:\n${unexpectedRuntimeEntries.join('\n')}`);
  }
  if (missingRuntimeEntries.length > 0) {
    details.push(`missing:\n${missingRuntimeEntries.join('\n')}`);
  }
  fail(`VSIX runtime output does not match the release allowlist:\n${details.join('\n')}`);
}

const manifestEntries = entries.filter((entry) => entry === 'extension/package.json');
if (manifestEntries.length !== 1) {
  fail(`expected one extension/package.json, found ${manifestEntries.length}`);
}

let packagedManifest;
try {
  packagedManifest = JSON.parse(archive.packagedManifest.toString('utf8'));
} catch (error) {
  fail(`packaged extension manifest is invalid JSON: ${error.message}`);
}

for (const field of ['name', 'publisher', 'version']) {
  if (packagedManifest[field] !== sourceManifest[field]) {
    fail(
      `packaged ${field} ${JSON.stringify(packagedManifest[field])} does not match source ${JSON.stringify(sourceManifest[field])}`,
    );
  }
}
if (packagedManifest.engines?.vscode !== sourceManifest.engines?.vscode) {
  fail('packaged VS Code engine range does not match the source manifest');
}

const mainEntry = packagedManifest.main?.replace(/^\.\//u, '');
if (!mainEntry || !entries.includes(`extension/${mainEntry}`)) {
  fail(`packaged extension entry point is missing: ${packagedManifest.main ?? '<unset>'}`);
}

console.log(
  `Verified ${path.basename(vsixPath)}: ${sourceManifest.publisher}.${sourceManifest.name} ${sourceManifest.version}, ${entries.length} archive entries.`,
);
