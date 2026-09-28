#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/module-graph.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const SCAN_ROOT = 'apps/web';
export const ALLOWLIST_PATH = 'scripts/config/migration-dependency-allowlist.json';
export const APPLIED_STATE_PATH = 'scripts/config/production-migrations-applied.json';
export const APPLIED_CHECKSUMS_PATH = 'scripts/config/applied-migration-checksums.json';

const MIGRATION_FILENAME_PATTERN = /^(\d{4})_.+\.sql$/;

const CREATE_TABLE_PATTERN = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi;
const ALTER_TABLE_STATEMENT_PATTERN = /alter\s+table\s+public\.(\w+)\s+([\s\S]*?);/gi;
const ADD_COLUMN_PATTERN = /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'generated',
  'db',
]);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|test|fixtures|e2e)\//.test(relativePath)
  );
}

export function parseDraftMigration(fileName, text) {
  const match = MIGRATION_FILENAME_PATTERN.exec(fileName);
  if (!match) return null;
  const number = Number.parseInt(match[1], 10);

  const tables = new Set();
  CREATE_TABLE_PATTERN.lastIndex = 0;
  let createMatch;
  while ((createMatch = CREATE_TABLE_PATTERN.exec(text)) !== null) {
    tables.add(createMatch[1]);
  }

  const columnsByTable = new Map();
  ALTER_TABLE_STATEMENT_PATTERN.lastIndex = 0;
  let alterMatch;
  while ((alterMatch = ALTER_TABLE_STATEMENT_PATTERN.exec(text)) !== null) {
    const [, table, statementBody] = alterMatch;
    ADD_COLUMN_PATTERN.lastIndex = 0;
    let columnMatch;
    while ((columnMatch = ADD_COLUMN_PATTERN.exec(statementBody)) !== null) {
      if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
      columnsByTable.get(table).add(columnMatch[1]);
    }
  }

  return {
    number,
    fileName,
    tables: [...tables].sort(),
    columnsByTable: Object.fromEntries(
      [...columnsByTable.entries()]
        .map(([table, columns]) => [table, [...columns].sort()])
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

// Header prose is not deployment state. Applied migrations are immutable, so
// the recorded production high-water mark is the only repository-readable truth.
export function loadAppliedThrough({ repoRoot = REPO_ROOT } = {}) {
  const parsed = JSON.parse(readFileSync(path.join(repoRoot, APPLIED_STATE_PATH), 'utf8'));
  const appliedThrough = parsed?.appliedThrough;
  if (!Number.isInteger(appliedThrough) || appliedThrough < 0) {
    throw new Error(`${APPLIED_STATE_PATH} must carry an integer appliedThrough`);
  }
  return appliedThrough;
}

export function migrationChecksum(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function findEditedAppliedMigrations({ repoRoot = REPO_ROOT, appliedThrough } = {}) {
  const highWaterMark = appliedThrough ?? loadAppliedThrough({ repoRoot });
  const recorded = JSON.parse(readFileSync(path.join(repoRoot, APPLIED_CHECKSUMS_PATH), 'utf8'));
  const dirAbs = path.join(repoRoot, MIGRATIONS_DIR);
  const problems = [];
  for (const fileName of readdirSync(dirAbs).sort()) {
    const match = MIGRATION_FILENAME_PATTERN.exec(fileName);
    if (!match || Number(match[1]) > highWaterMark) continue;
    const checksum = migrationChecksum(readFileSync(path.join(dirAbs, fileName), 'utf8'));
    if (recorded[fileName] === undefined)
      problems.push(`${fileName} is applied but has no recorded checksum`);
    else if (recorded[fileName] !== checksum)
      problems.push(`${fileName} changed after it was applied`);
  }
  return problems;
}

export function loadDraftMigrations({ repoRoot = REPO_ROOT, appliedThrough } = {}) {
  const highWaterMark = appliedThrough ?? loadAppliedThrough({ repoRoot });
  const dirAbs = path.join(repoRoot, MIGRATIONS_DIR);
  const fileNames = execFileSync(
    'git',
    [
      '-C',
      repoRoot,
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      `${MIGRATIONS_DIR}/*.sql`,
    ],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean)
    .filter((relativePath) => path.dirname(relativePath) === MIGRATIONS_DIR)
    .map((relativePath) => path.basename(relativePath));

  const migrations = [];
  for (const fileName of fileNames.sort()) {
    const text = readFileSync(path.join(dirAbs, fileName), 'utf8');
    const parsed = parseDraftMigration(fileName, text);
    if (parsed && parsed.number > highWaterMark) migrations.push(parsed);
  }
  return migrations.sort((a, b) => a.number - b.number);
}

const SQL_TABLE_KEYWORDS = [
  'from',
  'join',
  'into',
  'update',
  'table',
  'exists',
  'references',
  'on',
  'truncate',
];

function identifierPattern(identifier) {
  return new RegExp(`\\b${identifier}\\b`);
}

function tableReferencePattern(table) {
  const quoted = `(?:^|['"\`])${table}(?:['"\`]|$)`;
  const sqlContext = `\\b(?:${SQL_TABLE_KEYWORDS.join('|')})\\s+(?:public\\.)?"?${table}"?\\b`;
  const memberAccess = `\\b${table}\\.\\w`;
  const objectKey = `(?:^|[\\s{,])${table}\\s*:`;
  return new RegExp(`${quoted}|${sqlContext}|${memberAccess}|${objectKey}`, 'im');
}

export function findMigrationDependencyReferences({ migrations, filePaths, repoRoot = REPO_ROOT }) {
  const references = [];
  for (const filePath of [...new Set(filePaths)].sort()) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!relativePath.startsWith(`${SCAN_ROOT}/`)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.split('/').some((segment) => SKIP_PATH_SEGMENTS.has(segment))) continue;

    let text;
    try {
      text = stripComments(readFileSync(filePath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const migration of migrations) {
      const identifiers = [];
      for (const table of migration.tables) {
        if (tableReferencePattern(table).test(text)) identifiers.push(table);
      }
      for (const [table, columns] of Object.entries(migration.columnsByTable)) {
        if (!tableReferencePattern(table).test(text)) continue;
        for (const column of columns) {
          if (identifierPattern(column).test(text)) identifiers.push(`${table}.${column}`);
        }
      }
      if (identifiers.length > 0) {
        references.push({
          file: relativePath,
          migration: migration.number,
          migrationFile: migration.fileName,
          identifiers,
        });
      }
    }
  }
  return references;
}

export function loadAllowlist({ repoRoot = REPO_ROOT } = {}) {
  const raw = readFileSync(path.join(repoRoot, ALLOWLIST_PATH), 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
    throw new Error(`${ALLOWLIST_PATH} must be an object with an entries array`);
  }
  for (const entry of parsed.entries) {
    if (
      typeof entry.file !== 'string' ||
      typeof entry.migration !== 'number' ||
      typeof entry.reason !== 'string' ||
      entry.reason.trim().length === 0
    ) {
      throw new Error(
        `${ALLOWLIST_PATH} entry ${JSON.stringify(entry)} must carry a file, a migration number and a non-empty reason`,
      );
    }
  }
  return parsed.entries;
}

function allowlistKey(entry) {
  return `${entry.file}\u0000${entry.migration}`;
}

export function discoverRepositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))]
    .sort()
    .map((relativePath) => path.join(repoRoot, relativePath));
}

function main() {
  const appliedThrough = loadAppliedThrough();
  const migrations = loadDraftMigrations({ appliedThrough });
  const references = findMigrationDependencyReferences({
    migrations,
    filePaths: discoverRepositoryFiles(REPO_ROOT),
  });
  const allowlist = loadAllowlist();
  const allowlisted = new Set(allowlist.map(allowlistKey));

  const violations = references.filter((ref) => !allowlisted.has(allowlistKey(ref)));
  const usedKeys = new Set(references.map(allowlistKey));
  const stale = allowlist.filter((entry) => !usedKeys.has(allowlistKey(entry)));

  if (violations.length > 0) {
    console.error(
      'Non-test code under apps/web references a table or column from a migration that is not ' +
        `yet applied in production (applied through ${appliedThrough}):\n`,
    );
    for (const violation of violations) {
      console.error(
        `  ${violation.file} references migration ${violation.migration} ` +
          `(${violation.migrationFile}): ${violation.identifiers.join(', ')}`,
      );
    }
    console.error(
      `\nEither wait for the migration to ship, or add an entry to ${ALLOWLIST_PATH} with the ` +
        'file, the migration number, and a reason (e.g. the deploy runbook applies this ' +
        'migration before this code reaches production). Never edit the migration file.',
    );
  }

  if (stale.length > 0) {
    console.error('\nStale migration-dependency-allowlist entries (no longer referenced):');
    for (const entry of stale) {
      console.error(`  ${entry.file} (migration ${entry.migration})`);
    }
    console.error('Remove them so the allowlist stays a true picture of the repo.');
  }

  const edited = findEditedAppliedMigrations({ appliedThrough });
  if (edited.length > 0) {
    console.error('\nApplied migrations must never change; production already ran them:');
    for (const problem of edited) console.error(`  ${problem}`);
    console.error('Restore the applied text and put the change in a new migration.');
  }

  if (violations.length > 0 || stale.length > 0 || edited.length > 0) process.exit(1);

  console.log(
    `check-migration-dependencies: OK (applied through ${appliedThrough}, ` +
      `${migrations.length} pending migration(s), ${allowlist.length} allowlisted reference(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
