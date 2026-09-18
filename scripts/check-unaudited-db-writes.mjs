#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = 'scripts';

const DATABASE_CLIENT = /@neondatabase\/serverless|from\s+'pg'|require\('pg'\)/;

const WRITE_STATEMENTS = [
  /\binsert\s+into\b/i,
  /\bupdate\s+[a-z_."]+\s+set\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\balter\s+table\b/i,
  /\bdrop\s+table\b/i,
  /\bcreate\s+database\b/i,
  /\bdrop\s+database\b/i,
];

// A write is attributable when the same script records it. The migration
// ledger counts: it names the file, its checksum and when it ran.
const AUDIT_SINKS = [
  /security_audit_logs/,
  /enterprise_audit_events/,
  /schema_migrations/,
  /MIGRATION_LEDGER_TABLE/,
];

/**
 * Scripts that write against a database nobody else reads. Each entry states
 * what the script writes to and why no audit row belongs in it. A new writer is
 * not on this list, so it has to record what it did.
 */
export const REHEARSAL_DB_WRITERS = new Map([
  [
    'db-restore-drill-logical.mjs',
    'restores a dump into a throwaway local database it creates and drops in the same run',
  ],
  [
    'key-rotation-drill.mjs',
    'rehearses a rotation on a Neon branch it creates and deletes; production rows are never touched',
  ],
  [
    'verify-dpdp-schema.mjs',
    'writes probe rows to prove the constraints reject them, against the schema under test',
  ],
]);

function scriptFilenames(root) {
  return fs
    .readdirSync(path.join(root, SCRIPTS_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .filter((name) => !name.endsWith('.test.mjs') && !name.startsWith('check-'))
    .sort();
}

export function unauditedWriters(root) {
  const directory = path.join(root, SCRIPTS_DIR);
  const failures = [];

  for (const filename of scriptFilenames(root)) {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    if (!DATABASE_CLIENT.test(source)) continue;
    const write = WRITE_STATEMENTS.find((pattern) => pattern.test(source));
    if (!write) continue;
    if (AUDIT_SINKS.some((pattern) => pattern.test(source))) continue;
    if (REHEARSAL_DB_WRITERS.has(filename)) continue;
    failures.push(
      `${SCRIPTS_DIR}/${filename} writes to a database and records nothing. A manual patch that ` +
        `leaves no row in security_audit_logs cannot be attributed afterwards. Record the write, ` +
        `or add the script to REHEARSAL_DB_WRITERS with the database it writes to instead.`,
    );
  }

  return failures;
}

export function staleRehearsalWaivers(root) {
  const filenames = scriptFilenames(root);
  return [...REHEARSAL_DB_WRITERS.keys()]
    .filter((filename) => !filenames.includes(filename))
    .map(
      (filename) =>
        `REHEARSAL_DB_WRITERS names ${SCRIPTS_DIR}/${filename}, which no longer exists. Remove it.`,
    );
}

function main() {
  const failures = [...unauditedWriters(process.cwd()), ...staleRehearsalWaivers(process.cwd())];
  if (failures.length > 0) {
    console.error('Unaudited database write check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Unaudited database write check passed.');
}

function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const realpath = (value) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return value;
    }
  };
  return realpath(fileURLToPath(import.meta.url)) === realpath(path.resolve(entry));
}

if (isEntryPoint()) main();
