#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MOBILE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The backends the app actually ships with, read from lib/constants.ts rather
 * than restated here, so a moved host cannot leave this guard checking the old
 * one. An unreadable constant fails instead of assuming.
 */
export function readProductionOrigins(constantsSource) {
  const origins = [];
  for (const name of ['API_URL', 'GATEWAY_URL']) {
    const match = constantsSource.match(
      new RegExp(`export const ${name}[^=]*=[^?]*\\?\\?\\s*'(https://[^']+)'`, 'u'),
    );
    if (!match) throw new Error(`could not read the production ${name} from lib/constants.ts`);
    origins.push(match[1]);
  }
  return origins;
}

// .hbc is the Hermes bytecode an export emits for native; its string table is
// plain ASCII, so it is read as latin1 and scanned like the JS it replaces.
// Source maps are deliberately left out: they carry source comments and never
// reach the archive.
const SCANNED_EXTENSIONS = new Set([
  '.js',
  '.hbc',
  '.bundle',
  '.json',
  '.html',
  '.txt',
  '.plist',
  '.xml',
]);
const BINARY_EXTENSIONS = new Set(['.hbc', '.bundle']);
const MAX_FILE_BYTES = 32 * 1024 * 1024;

// Namespaces and DTDs are URLs that are never fetched, so a cleartext match on
// one of them is not a dev server.
const CLEARTEXT_ALLOWED = [
  'http://www.w3.org/',
  'http://www.apple.com/DTDs/',
  'http://schemas.android.com/',
  'http://www.google.com/',
  'http://json-schema.org/',
  'http://www.openarchives.org/',
];

export const FORBIDDEN_PATTERNS = Object.freeze([
  {
    name: 'a localhost endpoint',
    pattern: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/iu,
  },
  { name: 'an Android emulator host', pattern: /\bhttps?:\/\/10\.0\.2\.2\b/u },
  { name: 'a LAN development host', pattern: /\bhttps?:\/\/(?:192\.168|10\.)\d[\d.]*:\d+/u },
  { name: 'a Metro development server', pattern: /\b(?:exp|exps):\/\//u },
  {
    name: 'a tunnelled development server',
    pattern: /\b[\w-]+\.(?:ngrok(?:-free)?\.(?:io|app)|trycloudflare\.com)\b/u,
  },
  {
    name: 'a staging or preview backend',
    pattern: /https:\/\/[\w-]*(?:staging|preview|sandbox|test)[\w-]*\.agiworkforce\.com/iu,
  },
  { name: 'a Clerk test key', pattern: /\bpk_test_[A-Za-z0-9]/u },
  { name: 'a Clerk secret key', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]/u },
  { name: 'an OpenAI-style secret key', pattern: /\bsk-[A-Za-z0-9]{20}/u },
  { name: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20}/u },
  { name: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9]/u },
  { name: 'a Google service account key', pattern: /"type"\s*:\s*"service_account"/u },
  { name: 'a private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
]);

function cleartextFindings(text) {
  const matches = text.match(/http:\/\/[^\s"'`<>\\]+/gu) ?? [];
  return matches.filter((url) => !CLEARTEXT_ALLOWED.some((allowed) => url.startsWith(allowed)));
}

export function scanText(text) {
  const findings = [];
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) findings.push(name);
  }
  const cleartext = cleartextFindings(text);
  if (cleartext.length > 0) findings.push(`a cleartext URL (${new URL(cleartext[0]).host})`);
  return findings;
}

export function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export function scanBundleDirectory(directory, productionOrigins) {
  const problems = [];
  let scannedFiles = 0;
  let sawProductionOrigin = false;

  for (const file of walk(directory)) {
    if (!SCANNED_EXTENSIONS.has(extname(file))) continue;
    if (statSync(file).size > MAX_FILE_BYTES) {
      problems.push({ file: relative(directory, file), finding: 'a file too large to scan' });
      continue;
    }
    const extension = extname(file);
    const text = readFileSync(file, BINARY_EXTENSIONS.has(extension) ? 'latin1' : 'utf8');
    scannedFiles += 1;
    if (productionOrigins.some((origin) => text.includes(origin))) sawProductionOrigin = true;
    for (const finding of scanText(text)) {
      problems.push({ file: relative(directory, file), finding });
    }
  }

  if (scannedFiles === 0) {
    problems.push({ file: '.', finding: 'no bundle files to scan, so nothing was verified' });
  } else if (!sawProductionOrigin) {
    problems.push({
      file: '.',
      finding: `no production backend (${productionOrigins[0]}) in the bundle`,
    });
  }

  return { scannedFiles, problems };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('[scan-release-bundle] ERROR: pass the exported bundle directory');
    process.exit(1);
  }
  const origins = readProductionOrigins(
    readFileSync(join(MOBILE_ROOT, 'lib', 'constants.ts'), 'utf8'),
  );
  const { scannedFiles, problems } = scanBundleDirectory(directory, origins);
  for (const { file, finding } of problems) {
    console.error(`[scan-release-bundle] ${file}: ${finding}`);
  }
  if (problems.length > 0) {
    console.error(`[scan-release-bundle] ERROR: ${problems.length} problem(s) in ${directory}`);
    process.exit(1);
  }
  console.log(
    `[scan-release-bundle] ${scannedFiles} file(s) clean, ${origins[0]} present in the bundle`,
  );
}
