#!/usr/bin/env node

// The deletion graph is closed over the SCHEMA, not over the erasure lists. A
// table nobody added to a list is the hole this enumerates from the migrations.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readTableColumns, readForeignKeys } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const ACCOUNT_ERASURE_PATH = 'apps/web/lib/server/account-erasure.ts';
export const ORGANIZATION_ERASURE_PATH = 'apps/web/lib/server/organization-erasure.ts';

// The inventories a reached table has to appear in, and the minimum size each
// one has had, so renaming a list to something this file cannot parse fails
// instead of reporting a graph with nothing in it.
export const INVENTORIES = Object.freeze([
  { file: ACCOUNT_ERASURE_PATH, name: 'USER_SCOPED_TABLES', kind: 'scoped', minimum: 80 },
  { file: ACCOUNT_ERASURE_PATH, name: 'EMAIL_SCOPED_USER_TABLES', kind: 'scoped', minimum: 1 },
  { file: ACCOUNT_ERASURE_PATH, name: 'ANONYMIZED_USER_COLUMNS', kind: 'anonymized', minimum: 4 },
  { file: ACCOUNT_ERASURE_PATH, name: 'UNDELETED_USER_TABLES', kind: 'retained', minimum: 30 },
  {
    file: ORGANIZATION_ERASURE_PATH,
    name: 'ORGANIZATION_SCOPED_TABLES',
    kind: 'scoped',
    minimum: 30,
  },
  {
    file: ORGANIZATION_ERASURE_PATH,
    name: 'ORGANIZATION_ANONYMIZED_COLUMNS',
    kind: 'anonymized',
    minimum: 1,
  },
  {
    file: ORGANIZATION_ERASURE_PATH,
    name: 'ORGANIZATION_UNDELETED_TABLES',
    kind: 'retained',
    minimum: 5,
  },
]);

/**
 * A column naming a person or an account. Matched on the whole name so
 * `user_agent` and `repo_owner` stay out: neither identifies anybody here.
 */
export const SUBJECT_COLUMN =
  /^(user_id|owner_id|account_id|subject_user_id|actor|email|[a-z0-9_]+_user_id|[a-z0-9_]+_owner_id|[a-z0-9_]+_email)$/;

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** The tables a migration dropped, which no rule can be asked to reach. */
export function readDroppedTables(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const dropped = new Set();
  for (const name of readdirSync(dir)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()) {
    const sql = readFileSync(path.join(dir, name), 'utf8').toLowerCase();
    for (const match of sql.matchAll(
      /^\s*drop\s+table\s+(?:if\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gm,
    )) {
      dropped.add(match[1]);
    }
  }
  return dropped;
}

function blockBody(source, name) {
  const declaration = new RegExp(`export const ${name}\\s*:`).exec(source);
  if (declaration === null) return null;
  const arrayOpen = source.indexOf('= [', declaration.index);
  const objectOpen = source.indexOf('= {', declaration.index);
  const candidates = [arrayOpen, objectOpen].filter((index) => index !== -1);
  if (candidates.length === 0) return null;
  const from = Math.min(...candidates) + 2;
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (character === '[' || character === '{') depth += 1;
    else if (character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from + 1, index);
    }
  }
  return null;
}

/** The entries of one inventory: `{table, column}` rows or `table: 'reason'` keys. */
export function readInventory(source, inventory) {
  const body = blockBody(source, inventory.name);
  if (body === null) return null;
  const entries = [];
  if (inventory.kind === 'retained') {
    for (const match of body.matchAll(
      /(?:^|\n)\s{2}([a-z_][a-z0-9_]*):\s*\n?\s*(['"`])([\s\S]*?)\2,/g,
    )) {
      entries.push({ table: match[1], reason: match[3].trim() });
    }
    return entries;
  }
  for (const match of body.matchAll(
    /table:\s*'([a-z_][a-z0-9_]*)',\s*\n?\s*column:\s*'([a-z_][a-z0-9_]*)'/g,
  )) {
    entries.push({ table: match[1], column: match[2] });
  }
  return entries;
}

export function readGraph(repoRoot = REPO_ROOT) {
  const columns = readTableColumns(repoRoot);
  const dropped = readDroppedTables(repoRoot);
  const tables = new Map([...columns].filter(([table]) => !dropped.has(table)));

  const sources = new Map();
  const problems = [];
  const named = new Map();
  for (const inventory of INVENTORIES) {
    if (!sources.has(inventory.file))
      sources.set(inventory.file, readSource(repoRoot, inventory.file));
    const source = sources.get(inventory.file);
    if (source === null) {
      problems.push(`${inventory.file} is missing, so the deletion graph cannot be read.`);
      continue;
    }
    const entries = readInventory(source, inventory);
    if (entries === null) {
      problems.push(`${inventory.file} no longer declares ${inventory.name}.`);
      continue;
    }
    if (entries.length < inventory.minimum) {
      problems.push(
        `${inventory.name} parsed ${entries.length} entries and has never had fewer than ${inventory.minimum}; the list moved or its shape changed.`,
      );
      continue;
    }
    for (const entry of entries) {
      if (inventory.kind === 'retained' && entry.reason.length < 20) {
        problems.push(`${inventory.name}.${entry.table} is retained without saying why.`);
      }
      if (!tables.has(entry.table)) {
        problems.push(
          `${inventory.name} names ${entry.table}, which no live migration creates. A rule over a store that is gone reaches nothing.`,
        );
        continue;
      }
      if (entry.column !== undefined && !tables.get(entry.table).has(entry.column)) {
        problems.push(
          `${inventory.name} erases ${entry.table} by ${entry.column}, a column the table does not have.`,
        );
      }
      if (!named.has(entry.table)) named.set(entry.table, inventory.name);
    }
  }

  const cascades = new Map();
  for (const key of readForeignKeys(repoRoot)) {
    if (key.action !== 'cascade') continue;
    if (dropped.has(key.child) || dropped.has(key.parent)) continue;
    if (!cascades.has(key.parent)) cascades.set(key.parent, new Set());
    cascades.get(key.parent).add(key.child);
  }

  const reached = new Set(named.keys());
  const viaCascade = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const parent of [...reached]) {
      for (const child of cascades.get(parent) ?? []) {
        if (reached.has(child)) continue;
        reached.add(child);
        viaCascade.add(child);
        grew = true;
      }
    }
  }

  const unreached = [];
  for (const [table, tableColumns] of tables) {
    if (reached.has(table)) continue;
    const subject = [...tableColumns].filter((column) => SUBJECT_COLUMN.test(column)).sort();
    if (subject.length === 0) continue;
    unreached.push({ table, columns: subject });
  }

  return {
    tables: tables.size,
    dropped: [...dropped].sort(),
    named,
    viaCascade: [...viaCascade].sort(),
    unreached: unreached.sort((a, b) => a.table.localeCompare(b.table)),
    problems,
  };
}

export function checkRetentionGraph(repoRoot = REPO_ROOT) {
  const graph = readGraph(repoRoot);
  const failures = [...graph.problems];
  for (const entry of graph.unreached) {
    failures.push(
      `${entry.table} holds ${entry.columns.join(', ')} and no erasure rule reaches it: ` +
        `no inventory names it and no cascade carries it. Erase it with its subject, or say in ` +
        `UNDELETED_USER_TABLES why it outlives them.`,
    );
  }
  return { graph, failures };
}

function main() {
  const { graph, failures } = checkRetentionGraph();
  const reached = graph.named.size + graph.viaCascade.length;
  process.stdout.write(
    `check-retention-graph: ${graph.tables} live tables, ${graph.named.size} named by an erasure ` +
      `inventory, ${graph.viaCascade.length} reached by cascade, ${graph.dropped.length} dropped.\n`,
  );
  if (failures.length > 0) {
    for (const failure of failures) process.stdout.write(`  ${failure}\n`);
    process.stdout.write(`check-retention-graph: ${failures.length} store(s) outside the graph.\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `check-retention-graph: OK, every store holding a subject reference is reached (${reached} of ${graph.tables}).\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
