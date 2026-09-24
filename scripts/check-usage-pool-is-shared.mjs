#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SCANNED_DIRS = ['apps/web/db/neon', 'apps/web/lib', 'apps/web/app/api'];

/**
 * An allowance belongs to an account, not to the window it was opened in. A
 * predicate on any of these would give one person a second allowance the
 * moment they opened the desktop app, and would make the figure each surface
 * shows them a different number for the same spend.
 */
export const SURFACE_PREDICATES = [
  'source_surface',
  'origin_surface',
  'surface_id',
  'surface_type',
  'client_surface',
  'client_platform',
  'client_type',
  'platform_id',
  'platform_type',
  'device_type',
  'app_surface',
];

/** The tables that hold what an account has spent and what it was allocated. */
export const POOL_TABLES = ['credit_transactions', 'token_credits'];

const SQL_EXTENSIONS = new Set(['.sql']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs']);
const SKIPPED = /(^|\/)(node_modules|__tests__|\.next|dist)(\/|$)|\.test\.[a-z]+$|\.d\.ts$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (SKIPPED.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function scannedFiles(repoRoot = REPO_ROOT) {
  const files = [];
  for (const dir of SCANNED_DIRS) {
    for (const file of walk(path.join(repoRoot, dir))) {
      const extension = path.extname(file);
      if (SQL_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension)) {
        files.push(path.relative(repoRoot, file));
      }
    }
  }
  return files.sort();
}

function stripComments(source) {
  return source.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The statements that decide, or report, what an account has left.
 *
 * A statement is any span that both names one of the pool tables and either
 * aggregates it or compares it, which is what an admission decision and a
 * usage figure have in common and what an unrelated `create table` does not.
 */
export function poolStatements(source) {
  const text = stripComments(source);
  const statements = [];
  for (const raw of text.split(';')) {
    const statement = raw.trim();
    if (statement.length === 0) continue;
    const lower = statement.toLowerCase();
    if (!POOL_TABLES.some((table) => lower.includes(table))) continue;
    if (/\bcreate\s+(table|index|trigger|policy)\b/.test(lower)) continue;
    if (/\bgrant\b|\balter\s+table\b|\bcomment\s+on\b|\bdrop\b/.test(lower)) continue;
    if (!/\b(sum|count|select|update)\b/.test(lower)) continue;
    statements.push(statement);
  }
  return statements;
}

export function surfaceSplits(source) {
  const found = [];
  for (const statement of poolStatements(source)) {
    const lower = statement.toLowerCase();
    for (const predicate of SURFACE_PREDICATES) {
      if (new RegExp(`\\b${predicate}\\b`).test(lower)) {
        found.push({ predicate, statement: statement.slice(0, 200) });
      }
    }
  }
  return found;
}

export function checkUsagePoolIsShared(repoRoot = REPO_ROOT) {
  const violations = [];
  let scanned = 0;
  for (const file of scannedFiles(repoRoot)) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    if (!POOL_TABLES.some((table) => source.includes(table))) continue;
    scanned += 1;
    for (const split of surfaceSplits(source)) {
      violations.push({ file, ...split });
    }
  }
  return { scanned, violations };
}

function main() {
  const { scanned, violations } = checkUsagePoolIsShared();

  if (violations.length > 0) {
    console.error(
      'An account allowance is being split by the surface that spent it.\n' +
        'One account has one pool: web, desktop, mobile, the CLI and the extension\n' +
        'all spend it and all report the same remainder.\n',
    );
    for (const violation of violations) {
      console.error(`  ${violation.file}: predicate on ${violation.predicate}`);
      console.error(`    ${violation.statement.replace(/\s+/g, ' ')}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-usage-pool-is-shared: ${scanned} files read the shared account pool, none splits it by surface`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
