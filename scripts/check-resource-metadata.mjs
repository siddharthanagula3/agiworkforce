#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { USER_OWNED_TABLES } from './lib/db-isolation-tables.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/resource-metadata-contract.json';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const MUTATOR_ROOTS = Object.freeze([
  'apps/web/app/',
  'apps/web/lib/',
  'apps/web/features/',
  'apps/web/db/',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const UPDATE_STATEMENT = /update\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+set\b/g;

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const FOREIGN_KEY = /references\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)([^,\n]*)/g;

const COLUMN_LINE = /^([a-z_][a-z0-9_]*)\s+/;
const NON_COLUMN_LEADERS = new Set([
  'primary',
  'unique',
  'constraint',
  'foreign',
  'check',
  'exclude',
  'like',
]);

/**
 * Table -> column set, read from the migration history so a table added
 * anywhere in the sequence is in scope without being listed here.
 */
export function readTableColumns(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const tables = new Map();
  const ensure = (table) => {
    if (!tables.has(table)) tables.set(table, new Set());
    return tables.get(table);
  };

  const files = readdirSync(dir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();

  for (const name of files) {
    const sql = stripSqlComments(readFileSync(path.join(dir, name), 'utf8')).toLowerCase();

    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      const columns = ensure(match[1]);
      let depth = 0;
      for (const line of match[2].split('\n')) {
        const trimmed = line.trim();
        const column = COLUMN_LINE.exec(trimmed);
        if (depth === 0 && column && !NON_COLUMN_LEADERS.has(column[1])) columns.add(column[1]);
        depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
      }
    }

    for (const match of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/g,
    )) {
      const columns = ensure(match[1]);
      for (const column of match[2].matchAll(
        /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/g,
      )) {
        columns.add(column[1]);
      }
    }
  }

  return tables;
}

/** Every foreign key in the migration history, with the disposition it declares. */
export function readForeignKeys(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const keys = [];
  const collect = (child, body, migration) => {
    FOREIGN_KEY.lastIndex = 0;
    for (const match of body.matchAll(FOREIGN_KEY)) {
      keys.push({
        child,
        parent: match[1],
        migration,
        declaresDisposition: /on\s+delete/.test(match[3]),
      });
    }
  };

  for (const name of readdirSync(dir)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()) {
    const sql = stripSqlComments(readFileSync(path.join(dir, name), 'utf8')).toLowerCase();
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      collect(match[1], match[2], name);
    }
    for (const match of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/g,
    )) {
      collect(match[1], match[2], name);
    }
  }

  return keys;
}

function repositoryFiles(repoRoot) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

/** Every table a production statement rewrites in place. */
export function findRewrittenTables({ repoRoot = REPO_ROOT, files, tables }) {
  const rewritten = new Set();
  for (const relativePath of files) {
    if (!MUTATOR_ROOTS.some((root) => relativePath.startsWith(root))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    let source;
    try {
      source = readFileSync(path.join(repoRoot, relativePath), 'utf8').toLowerCase();
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    UPDATE_STATEMENT.lastIndex = 0;
    for (const match of source.matchAll(UPDATE_STATEMENT)) {
      if (tables.has(match[1])) rewritten.add(match[1]);
    }
  }
  return rewritten;
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

/** The column that plays `role` for `table`: the declared one, else the default. */
export function resolveRoleColumn({ contract, table, role, columns }) {
  const declared = contract.tables?.[table]?.[role];
  if (declared === undefined) {
    const fallback = contract.roles[role]?.column;
    return fallback !== undefined && columns.has(fallback) ? fallback : null;
  }
  return declared;
}

function checkRoleVocabulary({ contract, tables, repoRoot, errors }) {
  for (const [role, definition] of Object.entries(contract.roles)) {
    if (typeof definition.why !== 'string' || definition.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: role "${role}" carries no reason for existing.`);
    }
    if (
      definition.column === undefined &&
      definition.carriedBy === undefined &&
      definition.declaredPerTable !== true
    ) {
      errors.push(
        `${CONTRACT_PATH}: role "${role}" names neither a default column nor the contract that carries it.`,
      );
      continue;
    }
    if (definition.declaredPerTable === true) {
      const declared = Object.values(contract.tables ?? {}).filter(
        (roles) => roles[role] !== undefined,
      );
      if (declared.length === 0) {
        errors.push(
          `${CONTRACT_PATH}: role "${role}" is declared per table and no table declares it.`,
        );
      }
      continue;
    }
    if (definition.carriedBy !== undefined) {
      try {
        readFileSync(path.join(repoRoot, definition.carriedBy), 'utf8');
      } catch {
        errors.push(
          `${CONTRACT_PATH}: role "${role}" names carrier ${definition.carriedBy}, which does not exist.`,
        );
      }
      continue;
    }

    const carriers = [...tables].filter(([, columns]) => columns.has(definition.column));
    const declared = Object.entries(contract.tables ?? {}).filter(
      ([, roles]) => typeof roles[role] === 'string',
    );
    if (carriers.length === 0 && declared.length === 0) {
      errors.push(
        `${CONTRACT_PATH}: role "${role}" resolves to ${definition.column}, which no table carries ` +
          `and no table declares an equivalent for. A metadata field nothing carries is a field on paper.`,
      );
    }
  }
}

function checkDeclarations({ contract, tables, errors }) {
  for (const [table, roles] of Object.entries(contract.tables ?? {})) {
    const columns = tables.get(table);
    if (columns === undefined) {
      errors.push(`${CONTRACT_PATH}: declares ${table}, which no migration creates.`);
      continue;
    }
    for (const [role, column] of Object.entries(roles)) {
      if (contract.roles[role] === undefined) {
        errors.push(`${CONTRACT_PATH}: ${table} declares unknown role "${role}".`);
        continue;
      }
      if (column === null) continue;
      if (role === 'parent') {
        if (!columns.has(column.column)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} claims parent column ${column.column}, which no migration adds.`,
          );
        }
        if (!tables.has(column.table)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} claims parent table ${column.table}, which no migration creates.`,
          );
        }
        continue;
      }
      if (!columns.has(column)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} claims ${role} column ${column}, which no migration adds.`,
        );
      }
      if (column === contract.roles[role].column) {
        errors.push(
          `${CONTRACT_PATH}: ${table} declares ${role} as ${column}, which is already the default. Remove the entry.`,
        );
      }
    }
  }
}

function ownershipOf({ contract, table, columns, tables, seen = new Set() }) {
  if (seen.has(table)) return null;
  seen.add(table);
  for (const role of ['ownerAccount', 'organization']) {
    const column = resolveRoleColumn({ contract, table, role, columns });
    if (column !== null && columns.has(column)) return `${table}.${column}`;
  }
  const parent = contract.tables?.[table]?.parent;
  if (parent === undefined) return null;
  const parentColumns = tables.get(parent.table);
  if (parentColumns === undefined) return null;
  const inherited = ownershipOf({
    contract,
    table: parent.table,
    columns: parentColumns,
    tables,
    seen,
  });
  return inherited === null ? null : `${table}.${parent.column} -> ${inherited}`;
}

function checkTableObligations({ contract, tables, rewritten, errors }) {
  const gaps = new Map((contract.gaps ?? []).map((gap) => [`${gap.table}#${gap.role}`, gap]));
  const usedGaps = new Set();

  const record = (table, role, message) => {
    const key = `${table}#${role}`;
    const gap = gaps.get(key);
    if (gap === undefined) {
      errors.push(message);
      return;
    }
    usedGaps.add(key);
  };

  for (const [table, columns] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
    const createdAt = resolveRoleColumn({ contract, table, role: 'createdAt', columns });
    if (createdAt === null || !columns.has(createdAt)) {
      record(
        table,
        'createdAt',
        `${MIGRATIONS_DIR}: ${table} records no creation time. Add ${contract.roles.createdAt.column}, ` +
          `or declare the column that already plays that role in ${CONTRACT_PATH}.`,
      );
    }

    const updatedAt = resolveRoleColumn({ contract, table, role: 'updatedAt', columns });
    if (rewritten.has(table) && (updatedAt === null || !columns.has(updatedAt))) {
      record(
        table,
        'updatedAt',
        `${MIGRATIONS_DIR}: ${table} is rewritten in place by a production statement and records no ` +
          `update time. Add ${contract.roles.updatedAt.column}, or declare the column that already plays that role.`,
      );
    }

    if (
      updatedAt !== null &&
      columns.has(updatedAt) &&
      (createdAt === null || !columns.has(createdAt))
    ) {
      record(
        table,
        'createdAt',
        `${MIGRATIONS_DIR}: ${table} records when it last changed (${updatedAt}) but not when it began.`,
      );
    }

    if (columns.has(contract.shareTokenColumn)) {
      const visibility = resolveRoleColumn({ contract, table, role: 'visibility', columns });
      if (visibility === null || !columns.has(visibility)) {
        record(
          table,
          'visibility',
          `${MIGRATIONS_DIR}: ${table} hands out a bearer ${contract.shareTokenColumn} and records no ` +
            `visibility. Anyone holding the link reads the row and nothing says who was meant to.`,
        );
      }
    }

    if (!USER_OWNED_TABLES.has(table)) continue;
    if (ownershipOf({ contract, table, columns, tables }) === null) {
      record(
        table,
        'ownerAccount',
        `${MIGRATIONS_DIR}: ${table} is a tenant-isolated resource that names no owner, no tenant ` +
          `and no owning parent. Add ${contract.roles.ownerAccount.column} or ${contract.roles.organization.column}, ` +
          `or declare its parent in ${CONTRACT_PATH}.`,
      );
    }
  }

  for (const [key, gap] of gaps) {
    if (typeof gap.why !== 'string' || gap.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: gap ${key} carries no reason.`);
    }
    if (typeof gap.standIn !== 'string' || gap.standIn.trim().length === 0) {
      errors.push(
        `${CONTRACT_PATH}: gap ${key} does not say what stands in for the missing field.`,
      );
    }
    if (!tables.has(gap.table)) {
      errors.push(`${CONTRACT_PATH}: gap ${key} names a table no migration creates.`);
      continue;
    }
    if (!usedGaps.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: gap ${key} no longer describes a real gap. Delete it; this list only shrinks.`,
      );
    }
  }
}

/** What happens to a child row when its parent is deleted has to be written down. */
function checkDeletionSemantics({ contract, foreignKeys, errors }) {
  const undeclared = new Map(
    (contract.undeclaredDispositions ?? []).map((entry) => [
      `${entry.child}->${entry.parent}`,
      entry,
    ]),
  );
  const seen = new Set();

  for (const key of foreignKeys) {
    if (key.declaresDisposition) continue;
    const id = `${key.child}->${key.parent}`;
    if (undeclared.has(id)) {
      seen.add(id);
      continue;
    }
    errors.push(
      `${MIGRATIONS_DIR}/${key.migration}: ${key.child} references ${key.parent} without saying ` +
        `what happens to the child when the parent is deleted. Declare on delete cascade, set null or restrict.`,
    );
  }

  for (const [id, entry] of undeclared) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: undeclared disposition ${id} carries no reason.`);
    }
    if (!seen.has(id)) {
      errors.push(
        `${CONTRACT_PATH}: undeclared disposition ${id} no longer describes a real gap. Delete it; this list only shrinks.`,
      );
    }
  }
}

export function checkResourceMetadata(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const tables = readTableColumns(repoRoot);
  const files = repositoryFiles(repoRoot);
  const rewritten = findRewrittenTables({ repoRoot, files, tables });
  const foreignKeys = readForeignKeys(repoRoot);

  checkRoleVocabulary({ contract, tables, repoRoot, errors });
  checkDeclarations({ contract, tables, errors });
  checkTableObligations({ contract, tables, rewritten, errors });
  checkDeletionSemantics({ contract, foreignKeys, errors });

  return {
    errors,
    report: {
      tables: tables.size,
      roles: Object.keys(contract.roles).length,
      rewrittenInPlace: rewritten.size,
      foreignKeys: foreignKeys.length,
      gaps: (contract.gaps ?? []).length + (contract.undeclaredDispositions ?? []).length,
    },
  };
}

function main() {
  const { errors, report } = checkResourceMetadata(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Resource metadata contract check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-resource-metadata: OK (${report.tables} tables, ${report.roles} metadata roles, ` +
      `${report.rewrittenInPlace} rewritten in place, ${report.foreignKeys} foreign keys, ` +
      `${report.gaps} recorded gap(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
