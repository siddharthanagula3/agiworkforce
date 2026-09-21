#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const MEMORY_TABLE = 'user_memories';

const SEARCH_ROOTS = ['apps/web/app', 'apps/web/lib'];

/**
 * Where a memory is read to answer a request. An account-wide export or erasure
 * is deliberately not workspace-scoped, and lives outside these two.
 */
const REQUEST_SCOPED_ROOTS = ['apps/web/app/api/memory/', 'apps/web/lib/services/'];

const SQL_VERB = /\b(select|insert|update|delete|with)\b/i;

const MEMORY_TABLE_REFERENCE = /\b(from|into|update|join)\s+(public\.)?user_memories\b/i;

const OWNER_PREDICATE = /\buser_id\s*(=|is not distinct from)/i;

const WORKSPACE_PREDICATES = [
  /workspaceMemoryPredicate\s*\(/,
  /\borganization_id\b/i,
  /\$\{[^}]*[Ww]orkspace[^}]*\}/,
];

function listFiles(directory) {
  const out = [];
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!/\.[cm]?tsx?$/.test(entry.name)) continue;
      if (/\.(test|spec)\.[cm]?tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(directory);
  return out;
}

/**
 * Template literals are the only way this repository writes SQL, so the
 * backtick spans are the statements. Nesting never occurs inside one.
 */
export function extractSqlLiterals(source) {
  const literals = [];
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('`', index);
    if (start === -1) break;
    let cursor = start + 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '\\') {
        cursor += 2;
        continue;
      }
      if (character === '`') break;
      cursor += 1;
    }
    if (cursor >= source.length) break;
    literals.push(source.slice(start + 1, cursor));
    index = cursor + 1;
  }
  return literals;
}

function matchesAny(patterns, statement) {
  return patterns.some((pattern) => pattern.test(statement));
}

export function isMemoryStatement(statement) {
  return SQL_VERB.test(statement) && MEMORY_TABLE_REFERENCE.test(statement);
}

/** A statement that hands memory text back is the one a tenant leak rides out on. */
export function returnsMemoryContent(statement) {
  return /\b(select|returning)\b[\s\S]{0,400}?\bcontent\b/i.test(
    statement.replace(/content\s*=/gi, ''),
  );
}

/** An insert scopes the row by naming user_id among the columns it writes. */
function insertNamesOwner(statement) {
  const match = /\binsert\s+into\s+(?:public\.)?user_memories\b[^(]*\(([^)]*)\)/i.exec(statement);
  return match !== null && /\buser_id\b/i.test(match[1] ?? '');
}

export function auditStatement(statement, { requestScoped }) {
  const problems = [];
  if (!OWNER_PREDICATE.test(statement) && !insertNamesOwner(statement)) {
    problems.push('no user_id predicate');
  }
  if (
    requestScoped &&
    returnsMemoryContent(statement) &&
    !matchesAny(WORKSPACE_PREDICATES, statement)
  ) {
    problems.push('returns memory content to a request without a workspace predicate');
  }
  return problems;
}

export function auditSource(relativePath, source) {
  const failures = [];
  const requestScoped = REQUEST_SCOPED_ROOTS.some((root) => relativePath.startsWith(root));
  for (const statement of extractSqlLiterals(source)) {
    if (!isMemoryStatement(statement)) continue;
    for (const problem of auditStatement(statement, { requestScoped })) {
      failures.push(`${relativePath}: ${problem}\n    ${statement.trim().slice(0, 160)}`);
    }
  }
  return failures;
}

export function auditRepository(repoRoot) {
  const files = SEARCH_ROOTS.flatMap((root) => listFiles(path.join(repoRoot, root)));
  const touching = files.filter((file) => fs.readFileSync(file, 'utf8').includes(MEMORY_TABLE));
  const failures = touching.flatMap((file) =>
    auditSource(path.relative(repoRoot, file), fs.readFileSync(file, 'utf8')),
  );
  return { scanned: touching.length, failures };
}

function main() {
  const repoRoot = process.cwd();
  const { scanned, failures } = auditRepository(repoRoot);
  if (scanned === 0) {
    console.error(`check-memory-isolation: found no module touching ${MEMORY_TABLE}`);
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error(
      `check-memory-isolation: ${failures.length} statement(s) reach ${MEMORY_TABLE} unscoped:\n  ${failures.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(`check-memory-isolation: ${scanned} module(s) scoped by account and workspace`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
