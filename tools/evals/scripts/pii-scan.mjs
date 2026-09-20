#!/usr/bin/env node
/**
 * Personal data has no business in an eval corpus.
 *
 * The corpora are hand-written today, which is a property of who has written
 * them so far and not of the files. The moment a row is pasted from a real
 * conversation, a support ticket or a customer document, it becomes a copy of
 * someone's data that lives in git forever and is sent to a provider on every
 * run. This scans the committed rows and fixtures for the patterns that give
 * that away, and fails the build.
 *
 * Synthetic contact details are how a corpus asks a model to handle contact
 * details at all, so the reserved documentation domains and ranges are allowed
 * by name rather than by guessing at what looks fake.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATASETS_DIR = path.join(EVALS_ROOT, 'datasets');
export const RECORDINGS_DIR = path.join(EVALS_ROOT, 'recordings');
export const MEASUREMENTS_DIR = path.join(EVALS_ROOT, 'measurements');

/**
 * The corpus is what a run is asked, and these two are what came back and what
 * it cost. A provider response and a run output are where a production case or
 * a live credential would actually land, so they are scanned on the same terms.
 */
export const SCANNED_DIRS = Object.freeze([DATASETS_DIR, RECORDINGS_DIR, MEASUREMENTS_DIR]);

const TEXT_EXTENSIONS = new Set(['.json', '.txt', '.csv', '.md', '.mjs', '.js']);

/** RFC 2606 and RFC 6761 reserved names, which cannot belong to anyone. */
const RESERVED_DOMAIN_SUFFIXES = [
  '.example',
  '.invalid',
  '.test',
  '.localhost',
  'example.com',
  'example.net',
  'example.org',
  'example.edu',
  'example.gov',
];

/** RFC 5737 and RFC 1918 ranges, plus loopback and the unspecified address. */
const RESERVED_IP_PREFIXES = [
  '0.',
  '10.',
  '127.',
  '169.254.',
  '172.16.',
  '192.0.2.',
  '192.168.',
  '198.51.100.',
  '203.0.113.',
];

const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/gu;
const US_SSN = /\b\d{3}-\d{2}-\d{4}\b/gu;
const E164_PHONE = /(?<![\w.])\+\d{10,15}(?![\w.])/gu;
const NANP_PHONE = /(?<![\w-])\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w-])/gu;
// A card number is a token of its own. The two lookbehinds and two lookaheads
// keep it out of a longer hex digest and out of the fraction part of a float.
const CARD_NUMBER = /(?<![\w-])(?<!\d\.)(?:\d[ -]?){12,18}\d(?![\w-])(?!\.\d)/gu;
const IPV4 = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/gu;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,28}\b/gu;
const SECRET_PREFIX =
  /\b(?:sk_live_|sk-[A-Za-z0-9]{16}|AKIA[A-Z0-9]{12}|ghp_|AIza[A-Za-z0-9_-]{10})/gu;

function isReservedDomain(domain) {
  const lowered = domain.toLowerCase();
  return RESERVED_DOMAIN_SUFFIXES.some(
    (suffix) => lowered === suffix.replace(/^\./u, '') || lowered.endsWith(suffix),
  );
}

function isReservedIp(address) {
  if (RESERVED_IP_PREFIXES.some((prefix) => address.startsWith(prefix))) return true;
  return address.split('.').some((octet) => Number(octet) > 255);
}

function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function redact(match) {
  return match.length <= 4
    ? '****'
    : `${match.slice(0, 2)}${'*'.repeat(match.length - 4)}${match.slice(-2)}`;
}

function* matches(text, pattern, kind, accept = () => true) {
  for (const found of text.matchAll(pattern)) {
    if (!accept(found)) continue;
    yield { kind, match: found[0], index: found.index ?? 0 };
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Every personal-data pattern in one blob of text. */
export function scanText(text) {
  const found = [
    ...matches(text, EMAIL, 'email', (entry) => !isReservedDomain(entry[1] ?? '')),
    ...matches(text, US_SSN, 'government-id'),
    ...matches(text, E164_PHONE, 'phone'),
    ...matches(text, NANP_PHONE, 'phone'),
    ...matches(text, CARD_NUMBER, 'payment-card', (entry) =>
      luhnValid(entry[0].replace(/[ -]/gu, '')),
    ),
    ...matches(text, IPV4, 'ip-address', (entry) => !isReservedIp(entry[0])),
    ...matches(text, IBAN, 'bank-account'),
    ...matches(text, SECRET_PREFIX, 'credential'),
  ];
  return found
    .sort((left, right) => left.index - right.index)
    .map((entry) => ({
      kind: entry.kind,
      line: lineOf(text, entry.index),
      redacted: redact(entry.match),
    }));
}

function textFilesUnder(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...textFilesUnder(full));
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files.sort();
}

export function scanFiles(files) {
  return files.flatMap((file) =>
    scanText(fs.readFileSync(file, 'utf8')).map((finding) => ({ ...finding, file })),
  );
}

export function scanDatasets(root = DATASETS_DIR) {
  return scanFiles(textFilesUnder(root));
}

/** Every directory a run writes to or reads from, in one pass. */
export function scanEvalCorpora(roots = SCANNED_DIRS) {
  return roots.filter((root) => fs.existsSync(root)).flatMap((root) => scanDatasets(root));
}

function main() {
  const roots = process.argv[2] ? [path.resolve(process.argv[2])] : SCANNED_DIRS;
  const findings = scanEvalCorpora(roots);
  for (const finding of findings) {
    process.stdout.write(
      `FAIL ${path.relative(EVALS_ROOT, finding.file)}:${finding.line} ${finding.kind} ${finding.redacted}\n`,
    );
  }
  const scanned = roots.map((root) => path.relative(EVALS_ROOT, root)).join(', ');
  process.stdout.write(`[evals pii] ${findings.length} personal-data pattern(s) in ${scanned}\n`);
  if (findings.length > 0) {
    process.stdout.write(
      'A corpus row may not carry real personal data. Replace it with a synthetic value at a reserved documentation domain or range.\n',
    );
  }
  process.exitCode = findings.length === 0 ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
