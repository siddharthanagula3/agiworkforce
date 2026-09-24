#!/usr/bin/env node
// A published policy says when it last changed. This holds every canonical
// policy page to a dated version history, so its text cannot move while the
// date it prints stays behind.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CONSTANTS = 'apps/web/lib/legal-constants.ts';
export const REGISTRY = 'docs/compliance/policy-versions.json';

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_NOTE_LENGTH = 20;
const COPY_TOKEN =
  /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|(?<=[>}])[^<>{}]+(?=[<{])/g;

/** The string entries of one `export const NAME = { ... } as const` object. */
export function readConstantObject(source, name) {
  const start = source.indexOf(`export const ${name} = {`);
  if (start < 0) return null;
  const end = source.indexOf('} as const', start);
  if (end < 0) return null;
  const body = source.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/^\s+([A-Za-z][A-Za-z0-9]*): '([^']*)',?$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

/**
 * The text a page publishes: prose string literals and JSX text, in order,
 * with comments, imports, styling attributes and single-token strings left
 * out, so a reformat or a styling change does not read as a new version.
 */
export function publishedCopy(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|import\s|\}\s*from\s)/.test(line))
    .join('\n')
    .replace(/\bclassName=(?:"[^"]*"|'[^']*'|\{[^{}]*\})/g, ' ')
    .replace(/\bstyle=\{\{[^{}]*\}\}/g, ' ');
  const pieces = [];
  for (const match of stripped.matchAll(COPY_TOKEN)) {
    let text = match[0];
    if (/^['"`]/.test(text)) {
      text = text.slice(1, -1);
      if (!/\s/.test(text.trim())) continue;
    } else if (!/[A-Za-z]/.test(text) || /=/.test(text)) {
      continue;
    }
    pieces.push(text.replace(/\s+/g, ' ').trim());
  }
  return pieces.join('\n');
}

export function copyDigest(source) {
  return crypto.createHash('sha256').update(publishedCopy(source)).digest('hex').slice(0, 16);
}

export function pageFor(route) {
  return `apps/web/app${route}/page.tsx`;
}

function checkDocument(root, key, route, date, entry, failures) {
  const where = `${REGISTRY} "${key}"`;
  const page = pageFor(route);
  if (entry.page !== page) {
    failures.push(`${where}: page is "${entry.page}", the route ${route} is served by "${page}"`);
    return;
  }
  const target = path.join(root, page);
  if (!fs.existsSync(target)) {
    failures.push(`${where}: ${page} does not exist`);
    return;
  }
  const source = fs.readFileSync(target, 'utf8');
  if (date !== null && !source.includes(`POLICY_LAST_UPDATED.${key}`)) {
    failures.push(
      `${page}: does not print POLICY_LAST_UPDATED.${key}, so the date /legal shows is not the one the page shows`,
    );
  }

  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  if (versions.length === 0) {
    failures.push(`${where}: records no version`);
    return;
  }
  let previous = null;
  for (const [position, version] of versions.entries()) {
    const at = `${where} version ${position + 1}`;
    if (version.date !== null && !DATE_SHAPE.test(version.date ?? '')) {
      failures.push(`${at}: date is neither a date nor null`);
    }
    if (!/^[0-9a-f]{16}$/.test(version.digest ?? '')) {
      failures.push(`${at}: digest is not 16 hex characters`);
    }
    const unmoved = previous === null || version.date === previous.date;
    if (
      unmoved &&
      (typeof version.note !== 'string' || version.note.trim().length < MIN_NOTE_LENGTH)
    ) {
      failures.push(
        previous === null
          ? `${at}: the first recorded version must say what it records`
          : `${at}: the text changed and the date did not, which needs a note saying why the change is editorial`,
      );
    }
    if (
      previous !== null &&
      version.date !== null &&
      previous.date !== null &&
      version.date < previous.date
    ) {
      failures.push(`${at}: dated ${version.date}, before the version it follows`);
    }
    previous = version;
  }

  const latest = versions[versions.length - 1];
  if (latest.date !== date) {
    failures.push(
      `${where}: the latest version is dated ${latest.date}, while POLICY_LAST_UPDATED.${key} is ${date}; record the version the page now prints`,
    );
  }
  const digest = copyDigest(source);
  if (latest.digest !== digest) {
    failures.push(
      `${page}: the published text changed since its last recorded version. If the change is substantive, move POLICY_LAST_UPDATED.${key} to the day it ships; either way append {"date", "digest": "${digest}"} to ${REGISTRY}, with a note when the date does not move`,
    );
  }
}

export function runPolicyVersionsCheck(root) {
  const failures = [];
  const constantsPath = path.join(root, CONSTANTS);
  const registryPath = path.join(root, REGISTRY);
  if (!fs.existsSync(constantsPath)) return [`${CONSTANTS} does not exist`];
  if (!fs.existsSync(registryPath)) return [`${REGISTRY} does not exist`];

  const constants = fs.readFileSync(constantsPath, 'utf8');
  const routes = readConstantObject(constants, 'CANONICAL_POLICY_ROUTES');
  const dates = readConstantObject(constants, 'POLICY_LAST_UPDATED');
  if (!routes || Object.keys(routes).length === 0 || !dates) {
    return [`${CONSTANTS}: CANONICAL_POLICY_ROUTES or POLICY_LAST_UPDATED could not be read`];
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (error) {
    return [`${REGISTRY} is not valid JSON: ${error.message}`];
  }
  const documents = registry.documents ?? {};

  for (const key of Object.keys(dates)) {
    if (!(key in routes))
      failures.push(`${CONSTANTS}: POLICY_LAST_UPDATED.${key} dates no canonical route`);
  }
  for (const [key, route] of Object.entries(routes)) {
    const entry = documents[key];
    if (!entry) {
      failures.push(`${REGISTRY}: ${route} is a canonical policy route with no recorded version`);
      continue;
    }
    checkDocument(root, key, route, dates[key] ?? null, entry, failures);
  }
  for (const key of Object.keys(documents)) {
    if (!(key in routes))
      failures.push(`${REGISTRY}: "${key}" is not a canonical policy route any more`);
  }
  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runPolicyVersionsCheck(root);
  if (failures.length > 0) {
    console.error('Published policy text and its dates have drifted apart:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY), 'utf8'));
  console.log(
    `check-policy-versions: ${Object.keys(registry.documents).length} policy pages match their latest recorded version and print its date.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
