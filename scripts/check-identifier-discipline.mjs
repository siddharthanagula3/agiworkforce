#!/usr/bin/env node

// An identifier is the one thing about a row that may never change. This guard
// reads every primary key out of the migration history and fails on a key that
// encodes something else: a name, an address, a secret, a filename, a position,
// or somebody else's identifier.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { findRewrittenTables, readTableColumns } from './check-resource-metadata.mjs';
import { repositoryFiles } from './check-lifecycle-semantics.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/identifier-contract.json';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const SERVER_ROOTS = Object.freeze(['apps/web/app/', 'apps/web/lib/', 'packages/']);

const SEQUENTIAL_TYPE =
  /\b(serial|bigserial|smallserial|generated\s+(always|by\s+default)\s+as\s+identity)\b/;
const GENERATED_DEFAULT = /default\s+gen_random_uuid\s*\(/;

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Primary keys as the migrations declare them, inline or composite. */
export function readPrimaryKeys(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const keys = new Map();

  for (const name of readdirSync(dir)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()) {
    const sql = stripSqlComments(readFileSync(path.join(dir, name), 'utf8')).toLowerCase();

    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      const body = match[2];
      const columns = [];
      for (const line of body.split('\n')) {
        if (!/\bprimary\s+key\b/.test(line)) continue;
        const inline = /^\s*([a-z_][a-z0-9_]*)\s+(.*)$/.exec(line);
        if (inline !== null && inline[1] !== 'primary') {
          columns.push({ column: inline[1], declaration: inline[2].trim() });
        }
      }
      if (columns.length === 0) {
        const composite = /primary\s+key\s*\(([^)]*)\)/.exec(body);
        if (composite !== null) {
          for (const column of composite[1].split(',')) {
            const trimmed = column.trim().replace(/"/g, '');
            const declaration = new RegExp(`^\\s*${trimmed}\\s+([^,\\n]*)`, 'm').exec(body);
            columns.push({ column: trimmed, declaration: (declaration?.[1] ?? '').trim() });
          }
        }
      }
      if (columns.length > 0) keys.set(match[1], { columns, migration: name });
    }
  }

  return keys;
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

/** An id built out of a loop counter survives exactly until the list reorders. */
export function findPositionalIdentifiers({ repoRoot = REPO_ROOT, files, patterns }) {
  const matchers = patterns.map((pattern) => new RegExp(pattern.match));
  const found = [];
  for (const relativePath of files) {
    if (!SERVER_ROOTS.some((root) => relativePath.startsWith(root))) continue;
    if (!/\.(ts|tsx)$/.test(relativePath)) continue;
    if (/\.(test|spec|bench|stories)\./.test(relativePath)) continue;
    if (
      /(^|\/)(__tests__|__mocks__|__fixtures__|node_modules|dist|build|coverage)\//.test(
        relativePath,
      )
    ) {
      continue;
    }
    let source;
    try {
      source = stripComments(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
    } catch {
      continue;
    }
    matchers.forEach((matcher, index) => {
      if (matcher.test(source)) found.push({ file: relativePath, pattern: patterns[index].name });
    });
  }
  return found;
}

function checkForbiddenColumns({ contract, keys, errors, seen }) {
  const exemptions = new Map(
    (contract.forbiddenKeyExemptions ?? []).map((entry) => [`${entry.table}#${entry.rule}`, entry]),
  );
  for (const rule of contract.forbiddenKeyColumns) {
    if (typeof rule.why !== 'string' || rule.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: forbidden key rule "${rule.name}" carries no reason.`);
      continue;
    }
    const matcher = new RegExp(rule.match);
    for (const [table, key] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
      for (const { column } of key.columns) {
        if (!matcher.test(column)) continue;
        const exemption = `${table}#${rule.name}`;
        if (exemptions.has(exemption)) {
          seen.add(exemption);
          continue;
        }
        errors.push(
          `${MIGRATIONS_DIR}/${key.migration}: ${table} identifies a row by ${column}. ${rule.why}`,
        );
      }
    }
  }
}

function checkForbiddenExemptions({ contract, seen, errors }) {
  for (const entry of contract.forbiddenKeyExemptions ?? []) {
    const key = `${entry.table}#${entry.rule}`;
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: forbidden key exemption ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: forbidden key exemption ${key} no longer matches a key. Delete it; this list only shrinks.`,
      );
    }
  }
}

function checkSequentialKeys({ contract, keys, rewritten, errors }) {
  const recorded = new Map((contract.sequentialKeys ?? []).map((entry) => [entry.table, entry]));
  const seen = new Set();

  for (const [table, key] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
    const sequential = key.columns.find(({ declaration }) => SEQUENTIAL_TYPE.test(declaration));
    if (sequential === undefined) continue;
    const entry = recorded.get(table);
    if (entry === undefined) {
      errors.push(
        `${MIGRATIONS_DIR}/${key.migration}: ${table} counts its rows in ${sequential.column}. A ` +
          'sequential id handed to a reader tells them how many rows exist and lets them walk the ' +
          'neighbours. Record why this one never leaves the server.',
      );
      continue;
    }
    seen.add(table);
    if (rewritten.has(table)) {
      errors.push(
        `${CONTRACT_PATH}: ${table} is recorded as an append-only log with a sequential id and a ` +
          'production statement rewrites it in place.',
      );
    }
  }

  for (const [table, entry] of recorded) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: sequential key ${table} carries no reason.`);
    }
    if (!seen.has(table)) {
      errors.push(
        `${CONTRACT_PATH}: sequential key ${table} no longer counts its rows. Delete it; this list only shrinks.`,
      );
    }
  }
}

function checkClientGenerable({ contract, keys, errors }) {
  const recorded = new Map(
    (contract.mintedElsewhereKeys ?? []).map((entry) => [entry.table, entry]),
  );
  const seen = new Set();

  for (const [table, key] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
    if (key.columns.length !== 1) continue;
    const [only] = key.columns;
    if (!/\buuid\b/.test(only.declaration)) continue;
    if (GENERATED_DEFAULT.test(only.declaration)) continue;
    if (recorded.has(table)) {
      seen.add(table);
      continue;
    }
    errors.push(
      `${MIGRATIONS_DIR}/${key.migration}: ${table}.${only.column} is a uuid with no default, so ` +
        'only a caller that already has one can insert. Give it gen_random_uuid(), or record that ' +
        'the id is minted elsewhere and where.',
    );
  }

  for (const [table, entry] of recorded) {
    if (typeof entry.mintedBy !== 'string' || entry.mintedBy.trim().length === 0) {
      errors.push(
        `${CONTRACT_PATH}: server-generated key ${table} does not say what mints the id.`,
      );
    }
    if (!seen.has(table)) {
      errors.push(
        `${CONTRACT_PATH}: server-generated key ${table} now has a default. Delete it; this list only shrinks.`,
      );
    }
  }
}

function checkPositional({ contract, repoRoot, files, errors }) {
  const recorded = new Map(
    (contract.positionalExemptions ?? []).map((entry) => [`${entry.file}#${entry.pattern}`, entry]),
  );
  const seen = new Set();
  const found = findPositionalIdentifiers({
    repoRoot,
    files,
    patterns: contract.positionalIdentifierPatterns,
  });

  for (const hit of found) {
    const key = `${hit.file}#${hit.pattern}`;
    if (recorded.has(key)) {
      seen.add(key);
      continue;
    }
    errors.push(
      `${hit.file}: builds an identifier out of a position (${hit.pattern}). The row keeps that id ` +
        'only until the list is reordered, and every reference taken from it is wrong afterwards.',
    );
  }

  for (const [key, entry] of recorded) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: positional exemption ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: positional exemption ${key} no longer matches. Delete it; this list only shrinks.`,
      );
    }
  }
}

export function checkIdentifierDiscipline(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const keys = readPrimaryKeys(repoRoot);
  const tables = readTableColumns(repoRoot);
  const files = repositoryFiles(repoRoot);
  const rewritten = findRewrittenTables({ repoRoot, files, tables });

  for (const table of tables.keys()) {
    if (keys.has(table)) continue;
    if ((contract.keylessTables ?? []).some((entry) => entry.table === table)) continue;
    errors.push(
      `${MIGRATIONS_DIR}: ${table} has no primary key, so no row in it can be named twice and mean ` +
        'the same row.',
    );
  }

  const forbiddenSeen = new Set();
  checkForbiddenColumns({ contract, keys, errors, seen: forbiddenSeen });
  checkForbiddenExemptions({ contract, seen: forbiddenSeen, errors });
  checkSequentialKeys({ contract, keys, rewritten, errors });
  checkClientGenerable({ contract, keys, errors });
  checkPositional({ contract, repoRoot, files, errors });

  return {
    errors,
    report: {
      keys: keys.size,
      rules: contract.forbiddenKeyColumns.length,
      sequential: (contract.sequentialKeys ?? []).length,
      mintedElsewhere: (contract.mintedElsewhereKeys ?? []).length,
      positional: (contract.positionalExemptions ?? []).length,
    },
  };
}

function main() {
  const { errors, report } = checkIdentifierDiscipline(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Identifier discipline check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-identifier-discipline: OK (${report.keys} primary keys, ${report.rules} forbidden key ` +
      `shapes, ${report.sequential} sequential, ${report.mintedElsewhere} minted elsewhere, ` +
      `${report.positional} recorded positional id(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
