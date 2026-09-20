#!/usr/bin/env node

// A retried write that runs twice charges twice, sends twice or provisions
// twice. This guard enumerates every table that carries a deduplication key and
// fails on one whose key is not unique or whose class names no enforcement.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readTableColumns } from './check-resource-metadata.mjs';
import { readPrimaryKeys } from './check-identifier-discipline.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/idempotency-contract.json';
export const MIGRATIONS_DIR = 'apps/web/db/neon';

export const IDEMPOTENT_OPERATIONS = Object.freeze([
  'billing',
  'webhooks',
  'tool-actions',
  'schedule-execution',
  'upload-finalize',
  'external-writes',
  'account-deletion',
  'provisioning',
  'invite-acceptance',
]);

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** Every unique constraint and unique index the migrations declare. */
export function readUniqueKeys(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const unique = new Map();
  const add = (table, columns) => {
    const entries = unique.get(table) ?? [];
    entries.push(columns.map((column) => column.trim().replace(/"/g, '')));
    unique.set(table, entries);
  };

  for (const name of readdirSync(dir)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()) {
    const sql = stripSqlComments(readFileSync(path.join(dir, name), 'utf8')).toLowerCase();

    for (const match of sql.matchAll(
      /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z_][a-z0-9_]*\s+on\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/g,
    )) {
      add(match[1], match[2].split(','));
    }
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      for (const constraint of match[2].matchAll(/unique\s*\(([^)]*)\)/g)) {
        add(match[1], constraint[1].split(','));
      }
      for (const line of match[2].split('\n')) {
        const column = /^\s*([a-z_][a-z0-9_]*)\s+[^,]*\bunique\b/.exec(line);
        if (column !== null) add(match[1], [column[1]]);
      }
    }
    for (const match of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/g,
    )) {
      for (const constraint of match[2].matchAll(/unique\s*\(([^)]*)\)/g)) {
        add(match[1], constraint[1].split(','));
      }
    }
  }

  return unique;
}

/** Tables that carry a deduplication key, whatever it is spelled. */
export function findDeduplicatedTables({ tables, contract }) {
  const matcher = new RegExp(contract.keyColumnMatch);
  const found = new Map();
  for (const [table, columns] of tables) {
    const keys = [...columns].filter((column) => matcher.test(column)).sort();
    if (keys.length > 0) found.set(table, keys);
  }
  return found;
}

function checkOperations({ repoRoot, contract, tables, errors }) {
  for (const name of IDEMPOTENT_OPERATIONS) {
    const operation = contract.operations[name];
    if (operation === undefined) {
      errors.push(
        `${CONTRACT_PATH}: "${name}" is an operation that must run at most once and declares nothing.`,
      );
      continue;
    }
    if (typeof operation.why !== 'string' || operation.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: "${name}" does not say what running twice would do.`);
    }
    if (!exists(repoRoot, operation.enforcedBy)) {
      errors.push(
        `${CONTRACT_PATH}: "${name}" is enforced by ${operation.enforcedBy}, which does not exist.`,
      );
      continue;
    }
    const source = readSource(repoRoot, operation.enforcedBy) ?? '';
    if (!new RegExp(contract.enforcementMatch, 'i').test(source)) {
      errors.push(
        `${operation.enforcedBy}: is named as the at-most-once fence for "${name}" and claims no ` +
          'key. Nothing there refuses a second run of the same request.',
      );
    }
    for (const table of operation.tables ?? []) {
      if (!tables.has(table)) {
        errors.push(`${CONTRACT_PATH}: "${name}" names ${table}, which no migration creates.`);
      }
    }
  }

  for (const name of Object.keys(contract.operations)) {
    if (!IDEMPOTENT_OPERATIONS.includes(name)) {
      errors.push(
        `${CONTRACT_PATH}: "${name}" is not one of the operations that must run at most once: ` +
          `${IDEMPOTENT_OPERATIONS.join(', ')}.`,
      );
    }
  }
}

function exists(repoRoot, relativePath) {
  return typeof relativePath === 'string' && readSource(repoRoot, relativePath) !== null;
}

/** A key nothing makes unique deduplicates nothing. */
function checkKeysAreUnique({ contract, deduplicated, unique, errors }) {
  const claimed = new Map();
  for (const [name, operation] of Object.entries(contract.operations)) {
    for (const table of operation.tables ?? []) claimed.set(table, name);
  }
  const exempt = new Map((contract.advisoryKeys ?? []).map((entry) => [entry.table, entry]));
  const seen = new Set();

  for (const [table, keys] of [...deduplicated].sort(([a], [b]) => a.localeCompare(b))) {
    if (!claimed.has(table)) {
      errors.push(
        `${CONTRACT_PATH}: ${table} carries ${keys.join(', ')} and no operation claims it, so ` +
          'nothing says which repeated request it is meant to stop.',
      );
      continue;
    }
    const constraints = unique.get(table) ?? [];
    const covered = keys.some((key) => constraints.some((constraint) => constraint.includes(key)));
    if (covered) {
      if (exempt.has(table)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} is recorded as having only an advisory key and the key is now ` +
            'unique. Delete the entry.',
        );
      }
      continue;
    }
    if (exempt.has(table)) {
      seen.add(table);
      continue;
    }
    errors.push(
      `${MIGRATIONS_DIR}: ${table}.${keys[0]} is a deduplication key with no unique constraint, so ` +
        'two copies of the same request both insert and the work happens twice.',
    );
  }

  for (const [table, entry] of exempt) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: advisory key ${table} carries no reason.`);
    }
    if (!seen.has(table)) {
      errors.push(
        `${CONTRACT_PATH}: advisory key ${table} no longer describes a real gap. Delete it; this list only shrinks.`,
      );
    }
  }

  for (const [table, name] of claimed) {
    if (deduplicated.has(table)) continue;
    errors.push(
      `${CONTRACT_PATH}: "${name}" claims ${table} as its at-most-once store and the table carries ` +
        'no deduplication key.',
    );
  }
}

export function checkIdempotency(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const tables = readTableColumns(repoRoot);
  const unique = readUniqueKeys(repoRoot);
  // A primary key is a unique key, so a composite one over the dedup column counts.
  for (const [table, key] of readPrimaryKeys(repoRoot)) {
    const entries = unique.get(table) ?? [];
    entries.push(key.columns.map((entry) => entry.column));
    unique.set(table, entries);
  }
  const deduplicated = findDeduplicatedTables({ tables, contract });

  checkOperations({ repoRoot, contract, tables, errors });
  checkKeysAreUnique({ contract, deduplicated, unique, errors });

  return {
    errors,
    report: {
      operations: Object.keys(contract.operations).length,
      deduplicated: deduplicated.size,
      unique: unique.size,
      advisory: (contract.advisoryKeys ?? []).length,
    },
  };
}

function main() {
  const { errors, report } = checkIdempotency(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Idempotency check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-idempotency: OK (${report.operations} at-most-once operations, ${report.deduplicated} ` +
      `deduplicated tables, ${report.unique} tables with unique keys, ${report.advisory} advisory)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
