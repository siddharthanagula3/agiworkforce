#!/usr/bin/env node

// One vocabulary for a durable image job. The status list lives in the SQL that
// stores it, in the type the store maps rows to, and in the snapshot the media
// API hands every surface; the terminal shape constraint is what decides which
// of those statuses may carry a terminal_at. A status added to one copy and not
// the others is a job that either cannot be written or cannot be read back, so
// this guard enumerates all four from source and refuses any that disagree.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const STORE_PATH = 'apps/web/lib/server/image-generation-jobs.ts';
export const EXECUTOR_PATH = 'apps/web/app/api/media/image/lib/image-job-executor.ts';

const JOB_TABLE = 'image_generation_jobs';
const TERMINAL_CONSTRAINT = `${JOB_TABLE}_terminal_shape`;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function quoted(fragment) {
  return [...fragment.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

function unique(values) {
  return [...new Set(values)].sort();
}

function migrationSql(repoRoot) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }))
    .filter((entry) => entry.sql.includes(JOB_TABLE));
}

/** The statuses the database will store, from the newest migration to declare them. */
export function readSqlStatuses(repoRoot = REPO_ROOT) {
  let statuses = null;
  for (const { sql } of migrationSql(repoRoot)) {
    const stripped = sql.replace(/--[^\n]*/g, ' ');
    for (const match of stripped.matchAll(
      /status\s+text\s+not\s+null[^,]*?check\s*\(\s*status\s*=\s*any\s*\(\s*array\[([^\]]*)\]/gi,
    )) {
      statuses = unique(quoted(match[1]));
    }
    for (const match of stripped.matchAll(
      new RegExp(
        `add\\s+constraint\\s+${JOB_TABLE}_status_check\\s+check\\s*\\(\\s*status\\s*=\\s*any\\s*\\(\\s*array\\[([^\\]]*)\\]`,
        'gi',
      ),
    )) {
      statuses = unique(quoted(match[1]));
    }
  }
  return statuses;
}

/** The statuses the terminal shape constraint classifies, and those it makes terminal. */
export function readTerminalShape(repoRoot = REPO_ROOT) {
  let classified = null;
  let terminal = null;
  for (const { sql } of migrationSql(repoRoot)) {
    const stripped = sql.replace(/--[^\n]*/g, ' ');
    const start = stripped.indexOf(TERMINAL_CONSTRAINT);
    if (start === -1) continue;
    const open = stripped.indexOf('(', start);
    if (open === -1) continue;
    let depth = 0;
    let body = null;
    for (let index = open; index < stripped.length; index += 1) {
      if (stripped[index] === '(') depth += 1;
      else if (stripped[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          body = stripped.slice(open + 1, index);
          break;
        }
      }
    }
    if (body === null) continue;
    classified = unique(
      [...body.matchAll(/status\s+(?:=|in)\s*\(?\s*((?:'[a-z_]+'\s*,?\s*)+)\)?/gi)].flatMap(
        (match) => quoted(match[1]),
      ),
    );
    terminal = unique(
      body
        .split(/\bor\b/i)
        .filter((clause) => /terminal_at\s+is\s+not\s+null/i.test(clause))
        .flatMap((clause) => quoted(clause)),
    );
  }
  return { classified, terminal };
}

export function readUnion(source, name) {
  const match = new RegExp(`export type ${name}\\s*=([^;]+);`).exec(source);
  if (!match) return null;
  return unique(quoted(match[1]));
}

/** Every status the store writes, so a writer cannot invent one the schema refuses. */
export function readWrittenStatuses(source) {
  return unique([...source.matchAll(/set\s+status\s*=\s*'([a-z_]+)'/gi)].map((match) => match[1]));
}

export function checkImageJobStates(repoRoot = REPO_ROOT) {
  const failures = [];
  const store = read(repoRoot, STORE_PATH);
  const executor = read(repoRoot, EXECUTOR_PATH);
  if (store === null || executor === null) {
    failures.push('the durable image job store or its executor is missing');
    return failures;
  }

  const sqlStatuses = readSqlStatuses(repoRoot);
  if (sqlStatuses === null || sqlStatuses.length === 0) {
    failures.push(`no migration declares the ${JOB_TABLE} status vocabulary`);
    return failures;
  }

  const storeStatuses = readUnion(store, 'ImageJobStatus');
  const publicStatuses = readUnion(executor, 'PublicImageJobStatus');
  for (const [label, declared] of [
    ['the store type', storeStatuses],
    ['the public snapshot type', publicStatuses],
  ]) {
    if (declared === null) {
      failures.push(`${label} does not declare a status union`);
      continue;
    }
    const missing = sqlStatuses.filter((status) => !declared.includes(status));
    const extra = declared.filter((status) => !sqlStatuses.includes(status));
    if (missing.length > 0) failures.push(`${label} is missing ${missing.join(', ')}`);
    if (extra.length > 0) failures.push(`${label} declares ${extra.join(', ')}, which SQL refuses`);
  }

  const written = readWrittenStatuses(store);
  const unwritable = written.filter((status) => !sqlStatuses.includes(status));
  if (unwritable.length > 0) {
    failures.push(`the store writes ${unwritable.join(', ')}, which SQL refuses`);
  }

  const { classified, terminal } = readTerminalShape(repoRoot);
  if (classified === null) {
    failures.push(`no migration declares ${TERMINAL_CONSTRAINT}`);
    return failures;
  }
  const unclassified = sqlStatuses.filter((status) => !classified.includes(status));
  if (unclassified.length > 0) {
    failures.push(`${TERMINAL_CONSTRAINT} does not say when ${unclassified.join(', ')} is over`);
  }
  if (terminal.length === 0) {
    failures.push(`${TERMINAL_CONSTRAINT} declares no status that sets terminal_at`);
  }

  return failures;
}

function main() {
  const failures = checkImageJobStates();
  if (failures.length > 0) {
    console.error('Durable image job state vocabulary failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('Durable image job states: SQL, store and snapshot agree.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
