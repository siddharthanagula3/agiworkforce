#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const GATE_MODULE = 'apps/web/lib/services/managed-memory-context-service.ts';

/** The two entry points that read both policies and run the eligibility gate. */
const GATE_CALLS = [/\bmemoryWriteAdmission\s*\(/, /\bwriteConsolidatedMemory\s*\(/];

const SQL_VERB = /\b(select|insert|update|delete|with)\b/i;

const INSERT = /\binsert\s+into\s+(?:public\.)?user_memories\b/i;

/** An update that puts new text in front of the user, as opposed to one that removes it. */
const BLANKS_CONTENT = /\bcontent\s*=\s*''/gi;
const WRITES_CONTENT = /\bset\b[\s\S]{0,300}?\bcontent\s*=/i;

const UPDATE = /\bupdate\s+(?:public\.)?user_memories\b/i;

export function extractSqlLiterals(source) {
  const literals = [];
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('`', index);
    if (start === -1) break;
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (source[cursor] === '`') break;
      cursor += 1;
    }
    if (cursor >= source.length) break;
    literals.push(source.slice(start + 1, cursor));
    index = cursor + 1;
  }
  return literals;
}

export function createsMemoryText(statement) {
  if (!SQL_VERB.test(statement)) return false;
  if (INSERT.test(statement)) return true;
  return UPDATE.test(statement) && WRITES_CONTENT.test(statement.replace(BLANKS_CONTENT, ''));
}

export function auditSource(relativePath, source) {
  if (relativePath === GATE_MODULE) return [];
  const creating = extractSqlLiterals(source).filter(createsMemoryText);
  if (creating.length === 0) return [];
  if (GATE_CALLS.some((call) => call.test(source))) return [];
  return [
    `${relativePath}: ${creating.length} statement(s) create memory text without reaching the shared gate\n    ${creating[0].trim().replace(/\s+/g, ' ').slice(0, 140)}`,
  ];
}

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
 * A module may write the SQL itself, as the import store and the sync push do,
 * as long as the route that drives it decided through the gate first.
 */
function drivenByAGatedCaller(repoRoot, relativePath) {
  const importSpecifier = relativePath.replace(/^apps\/web\//, '@/').replace(/\.[cm]?tsx?$/, '');
  for (const file of listFiles(path.join(repoRoot, 'apps/web'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes(importSpecifier)) continue;
    if (GATE_CALLS.some((call) => call.test(source))) return true;
  }
  return false;
}

export function auditRepository(repoRoot) {
  const failures = [];
  let writers = 0;
  for (const file of listFiles(path.join(repoRoot, 'apps/web'))) {
    const relativePath = path.relative(repoRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('user_memories')) continue;
    const problems = auditSource(relativePath, source);
    if (extractSqlLiterals(source).some(createsMemoryText)) writers += 1;
    if (problems.length === 0) continue;
    if (drivenByAGatedCaller(repoRoot, relativePath)) continue;
    failures.push(...problems);
  }
  return { writers, failures };
}

function main() {
  const repoRoot = process.cwd();
  if (!fs.existsSync(path.join(repoRoot, GATE_MODULE))) {
    console.error(`check-memory-write-gate: ${GATE_MODULE} is missing`);
    process.exit(1);
  }
  const { writers, failures } = auditRepository(repoRoot);
  if (writers === 0) {
    console.error('check-memory-write-gate: no memory write found; the walk would be empty');
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error(`check-memory-write-gate:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`check-memory-write-gate: ${writers} memory write path(s), all through the one gate`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
