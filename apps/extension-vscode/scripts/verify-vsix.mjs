#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'),
);
const expectedFilename = `${sourceManifest.name}-${sourceManifest.version}.vsix`;
const requestedPath = process.argv[2];
const vsixPath = requestedPath
  ? path.resolve(process.cwd(), requestedPath)
  : path.join(extensionRoot, expectedFilename);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function unzip(args, encoding = 'utf8') {
  const result = spawnSync('unzip', args, {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    fail('unzip is required to inspect the VSIX release artifact');
  }
  if (result.status !== 0) {
    fail(result.stderr?.trim() || `unzip ${args[0]} failed`);
  }
  return result.stdout;
}

if (!fs.existsSync(vsixPath) || !fs.statSync(vsixPath).isFile()) {
  fail(`VSIX does not exist: ${vsixPath}`);
}
if (path.basename(vsixPath) !== expectedFilename) {
  fail(`expected VSIX filename ${expectedFilename}, got ${path.basename(vsixPath)}`);
}

const entries = unzip(['-Z1', vsixPath]).split(/\r?\n/u).filter(Boolean);
if (entries.length === 0) fail('VSIX archive is empty');

const invalidPaths = entries.filter((entry) => {
  const normalized = entry.replaceAll('\\', '/');
  return entry !== normalized || normalized.startsWith('/') || normalized.split('/').includes('..');
});
if (invalidPaths.length > 0) {
  fail(`VSIX contains unsafe archive paths:\n${invalidPaths.join('\n')}`);
}

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

const manifestEntries = entries.filter((entry) => entry === 'extension/package.json');
if (manifestEntries.length !== 1) {
  fail(`expected one extension/package.json, found ${manifestEntries.length}`);
}

let packagedManifest;
try {
  packagedManifest = JSON.parse(unzip(['-p', vsixPath, 'extension/package.json']));
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
