#!/usr/bin/env node
/**
 * Every connector secret class has a column the re-seal can reach.
 *
 * A connector secret sealed before its purpose existed carries no associated
 * data, so it opens under every other purpose. `openConnectorSecret` still
 * admits one, and the only thing that takes that allowance away is a re-seal
 * that has walked every column holding such a row. A purpose with no column
 * declared is a class of secret the re-seal would silently skip, and a column
 * whose purpose is not in the vocabulary is a walk over data nothing seals, so
 * both fail here.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const MODULE = 'apps/web/lib/crypto/connector-secret-reseal.ts';
const MIGRATIONS = 'apps/web/db/neon';

/** The list literal named by `name`, as source text between its brackets. */
export function listLiteral(source, name) {
  const opener = new RegExp(`\\b${name}[^=]*=\\s*\\[`, 'u');
  const found = opener.exec(source);
  if (!found) return null;
  const start = found.index + found[0].length - 1;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '[') depth += 1;
    else if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }
  return null;
}

export function declaredPurposes(source) {
  const body = listLiteral(source, 'CONNECTOR_SECRET_PURPOSES');
  return body === null ? [] : [...body.matchAll(/'([a-z0-9-]+)'/gu)].map((found) => found[1]);
}

export function declaredColumns(source) {
  const body = listLiteral(source, 'CONNECTOR_SECRET_COLUMNS');
  if (body === null) return [];
  return [...body.matchAll(/\{[^}]*\}/gu)].map((found) => {
    const entry = found[0];
    const read = (key) => new RegExp(`${key}:\\s*'([^']+)'`, 'u').exec(entry)?.[1] ?? null;
    return {
      table: read('table'),
      column: read('column'),
      keyColumn: read('keyColumn'),
      purpose: read('purpose'),
    };
  });
}

const failures = [];
const modulePath = path.join(scanRoot, MODULE);

if (!fs.existsSync(modulePath)) {
  console.error(`check-connector-secret-reseal: ${MODULE} is missing; nothing re-seals them.`);
  process.exit(1);
}

const source = fs.readFileSync(modulePath, 'utf8');
const purposes = declaredPurposes(source);
const columns = declaredColumns(source);

if (purposes.length === 0) failures.push(`${MODULE} declares no connector secret purposes`);
if (columns.length === 0) failures.push(`${MODULE} declares no columns for the re-seal to walk`);

if (!/opened\.contextBound/u.test(source)) {
  failures.push(`${MODULE} no longer reads whether the ciphertext it opened was bound`);
}
if (!/sealEnvelope\(/u.test(source)) {
  failures.push(`${MODULE} no longer re-seals what it found unbound`);
}

const covered = new Set(columns.map((entry) => entry.purpose));
for (const purpose of purposes) {
  if (!covered.has(purpose)) {
    failures.push(`the secret purpose "${purpose}" has no column the re-seal would walk`);
  }
}
const known = new Set(purposes);
for (const entry of columns) {
  if (!entry.table || !entry.column || !entry.keyColumn || !entry.purpose) {
    failures.push(`${MODULE} declares a column with a field missing`);
    continue;
  }
  if (!known.has(entry.purpose)) {
    failures.push(`the column ${entry.table}.${entry.column} names an unknown purpose`);
  }
}

/** A column the schema does not have is a walk that reads nothing. */
const migrationsDir = path.join(scanRoot, MIGRATIONS);
if (fs.existsSync(migrationsDir)) {
  const schema = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'))
    .join('\n');
  for (const entry of columns) {
    if (!entry.table || !entry.column) continue;
    const bare = entry.table.replace(/^public\./u, '');
    if (!new RegExp(`\\b${bare}\\b`, 'u').test(schema)) {
      failures.push(`${entry.table} is declared for re-seal and no migration creates it`);
      continue;
    }
    if (!new RegExp(`\\b${entry.column}\\b`, 'u').test(schema)) {
      failures.push(
        `${entry.table}.${entry.column} is declared for re-seal and no migration adds it`,
      );
    }
  }
}

for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  `[connector secret reseal] ${purposes.length} purpose(s), ${columns.length} column(s), ${failures.length} failure(s)`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
