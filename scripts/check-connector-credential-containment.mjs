#!/usr/bin/env node
/**
 * A connector credential is opened only inside the broker.
 *
 * The columns in `CONNECTOR_SECRET_COLUMNS` hold live provider credentials, and
 * the three functions that open one hand back plaintext. A route handler that
 * selects such a column puts a live token one `NextResponse.json` away from the
 * wire, and a module the chat path imports puts one inside a prompt; neither
 * mistake fails a type check or a unit test. The registry is the source of
 * truth: every column and every opener in it is walked, so a credential class
 * added later is covered without editing this file.
 *
 * Comments are stripped before matching, so naming a column to say it is
 * withheld stays legal while selecting one does not.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const REGISTRY = 'apps/web/lib/crypto/connector-secret-reseal.ts';
const BROKER_PREFIX = 'apps/web/lib/';
const OPENERS = ['decryptConnectorToken', 'openCustomConnectorCredential', 'openConnectorSecret'];
const SERVER_ONLY = /^\s*import\s+['"]server-only['"]\s*;?\s*$/mu;

/** Where a credential must never be named: the wire and everything the browser gets. */
const FORBIDDEN_ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/components',
  'apps/web/shared',
  'packages/ui',
];
const SCAN_ROOTS = ['apps/web', 'packages/ui'];

const SKIP_DIR = /^(node_modules|\.next|\.turbo|coverage|dist|out|build)$/u;
const SOURCE_FILE = /\.(?:ts|tsx)$/u;
const TEST_FILE = /(?:\.test\.|\.spec\.|__tests__|__mocks__)/u;

export function walkSources(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(entry.name)) continue;
      found.push(...walkSources(full));
      continue;
    }
    if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(full)) found.push(full);
  }
  return found;
}

/** Comments blanked, strings kept, so `'https://x'` survives and `// x` does not. */
export function stripComments(source) {
  let out = '';
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      if (char === '\\') {
        out += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      out += char;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** The credential registry, read from the module that the re-seal walks. */
export function readRegistry(source) {
  const purposes = [
    ...(/CONNECTOR_SECRET_PURPOSES\s*=\s*\[([\s\S]*?)\]/u.exec(source)?.[1] ?? '').matchAll(
      /'([a-z0-9-]+)'/gu,
    ),
  ].map((found) => found[1]);
  const body = /CONNECTOR_SECRET_COLUMNS[^=]*=\s*\[([\s\S]*?)\n\];/u.exec(source)?.[1] ?? '';
  const columns = [...body.matchAll(/\{[^}]*\}/gu)].map((found) => {
    const read = (key) => new RegExp(`${key}:\\s*'([^']+)'`, 'u').exec(found[0])?.[1] ?? null;
    return { table: read('table'), column: read('column'), purpose: read('purpose') };
  });
  return { purposes, columns };
}

export function credentialFindings(relativePath, source, registry) {
  const code = stripComments(source);
  const opens = OPENERS.filter((name) => new RegExp(`\\b${name}\\s*\\(`, 'u').test(code));
  const tables = new Set(registry.columns.map((entry) => entry.table.replace(/^public\./u, '')));
  const namesTable = [...tables].some((table) => new RegExp(`\\b${table}\\b`, 'u').test(code));
  const columns = namesTable
    ? registry.columns
        .filter((entry) => new RegExp(`\\b${entry.column}\\b`, 'u').test(code))
        .map((entry) => entry.column)
    : [];
  const forbidden = FORBIDDEN_ROOTS.some((root) => relativePath.startsWith(`${root}/`));

  const problems = [];
  for (const name of opens) {
    if (forbidden) {
      problems.push(`${relativePath} opens a connector credential outside the broker (${name}())`);
    } else if (!relativePath.startsWith(BROKER_PREFIX)) {
      problems.push(`${relativePath} calls ${name}() from outside ${BROKER_PREFIX}`);
    } else if (!SERVER_ONLY.test(source)) {
      problems.push(`${relativePath} opens a connector credential without importing server-only`);
    }
  }
  for (const column of new Set(columns)) {
    if (forbidden) {
      problems.push(`${relativePath} reads the sealed credential column ${column}`);
    }
  }
  return { problems, opens, columns: [...new Set(columns)] };
}

const registryPath = path.join(scanRoot, REGISTRY);
if (!fs.existsSync(registryPath)) {
  console.error(`check-connector-credential-containment: ${REGISTRY} is missing.`);
  process.exit(1);
}
const registry = readRegistry(fs.readFileSync(registryPath, 'utf8'));
const failures = [];
if (registry.columns.length === 0) {
  failures.push(`${REGISTRY} declares no credential columns; the walk is measuring nothing`);
}
if (registry.purposes.length === 0) {
  failures.push(`${REGISTRY} declares no credential purposes`);
}

let openerFiles = 0;
const openedPurposes = new Set();

for (const root of SCAN_ROOTS) {
  for (const file of walkSources(path.join(scanRoot, root))) {
    const relative = path.relative(scanRoot, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const found = credentialFindings(relative, source, registry);
    failures.push(...found.problems);
    if (found.opens.length > 0) openerFiles += 1;
    // The registry declares every purpose, so counting it would make the
    // completeness check below true by construction.
    if (relative === REGISTRY) continue;
    for (const purpose of registry.purposes) {
      if (new RegExp(`'${purpose}'`, 'u').test(stripComments(source))) openedPurposes.add(purpose);
    }
  }
}

/** A purpose nothing names is a credential class no code in the tree serves. */
for (const purpose of registry.purposes) {
  if (!openedPurposes.has(purpose)) {
    failures.push(`the credential purpose "${purpose}" is named by no module in the tree`);
  }
}
if (openerFiles === 0) {
  failures.push('no module opens a connector credential; the walk is measuring nothing');
}

for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  `[connector credential containment] ${registry.columns.length} column(s), ` +
    `${registry.purposes.length} purpose(s), ${openerFiles} broker module(s), ` +
    `${failures.length} failure(s)`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
