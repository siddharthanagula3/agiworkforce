#!/usr/bin/env node

// Soft delete and archive are promises about what a reader and a model may
// still see. This guard enumerates the tables that carry the promise and the
// production modules that read them, and fails on any reader that ignores it.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readForeignKeys, readTableColumns } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/lifecycle-semantics.json';
export const SEMANTICS_MODULE = 'packages/contracts/types/src/resource-lifecycle.ts';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const SERVER_ROOTS = Object.freeze(['apps/web/app/', 'apps/web/lib/', 'apps/web/db/']);

export const READ_CLASSES = Object.freeze([
  'erasure',
  'purge',
  'retention-sweep',
  'ownership-check',
  'write-path',
  // The withdrawal itself is the payload: a replica or a copy of the subject's
  // own data is wrong without it.
  'tombstone-sync',
  'data-export',
  // The read selects the marker so the caller can refuse, restore or purge.
  'tombstone-check',
  'defect',
]);

export const SHARE_SURFACE_COLUMNS = Object.freeze([
  'share_token',
  'token',
  'visibility',
  'public_slug',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function exists(repoRoot, relativePath) {
  try {
    readFileSync(path.join(repoRoot, relativePath), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

export function repositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

/** The archived row of the shared contract, read rather than restated. */
export function readArchivedSemantics(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, SEMANTICS_MODULE);
  if (source === null) return null;
  const block = /archived:\s*\{([^}]*)\}/.exec(source);
  if (block === null) return null;
  const facets = {};
  for (const match of block[1].matchAll(/([A-Za-z]+):\s*(true|false)/g)) {
    facets[match[1]] = match[2] === 'true';
  }
  return Object.keys(facets).length === 0 ? null : facets;
}

/** Every table carrying a withdrawal marker, whatever the column is spelled. */
export function findMarkedTables({ tables, contract }) {
  const marked = new Map();
  for (const [kind, columns] of Object.entries(contract.markerColumns)) {
    for (const [table, tableColumns] of tables) {
      const column = columns.find((candidate) => tableColumns.has(candidate));
      if (column === undefined) continue;
      const entry = marked.get(table) ?? {};
      entry[kind] = column;
      marked.set(table, entry);
    }
  }
  return marked;
}

/** A table that hands the resource to somebody who is not its owner. */
export function findShareSurfaces({ tables, foreignKeys }) {
  const surfaces = new Map();
  for (const key of foreignKeys) {
    const columns = tables.get(key.child);
    if (columns === undefined) continue;
    if (!SHARE_SURFACE_COLUMNS.some((column) => columns.has(column))) continue;
    if (key.child === key.parent) continue;
    const entries = surfaces.get(key.parent) ?? new Set();
    entries.add(key.child);
    surfaces.set(key.parent, entries);
  }
  return surfaces;
}

// A word that follows a table name because SQL put it there, never because
// somebody aliased the table to it.
const ALIAS_STOP_WORDS = new Set([
  'all',
  'and',
  'as',
  'asc',
  'by',
  'case',
  'conflict',
  'cross',
  'delete',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'exists',
  'fetch',
  'for',
  'from',
  'full',
  'group',
  'having',
  'inner',
  'insert',
  'intersect',
  'into',
  'is',
  'join',
  'lateral',
  'left',
  'limit',
  'materialized',
  'natural',
  'not',
  'nothing',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'outer',
  'recursive',
  'returning',
  'right',
  'select',
  'set',
  'tablesample',
  'then',
  'union',
  'update',
  'using',
  'values',
  'when',
  'where',
  'window',
  'with',
]);

const REGEX_KEYWORDS =
  /\b(?:return|typeof|case|in|of|delete|void|instanceof|new|yield|await|do|else)$/;

function canStartRegex(tail) {
  const trimmed = tail.replace(/\s+$/, '');
  if (trimmed.length === 0) return true;
  if (/[A-Za-z0-9_$)\]]$/.test(trimmed)) return REGEX_KEYWORDS.test(trimmed);
  return true;
}

function skipRegex(source, start) {
  let index = start + 1;
  let inClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '\n') return index;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) {
      index += 1;
      break;
    }
    index += 1;
  }
  while (index < source.length && /[a-z]/.test(source[index])) index += 1;
  return index;
}

function readQuoted(source, start) {
  const quote = source[start];
  let index = start + 1;
  let value = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      value += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === quote) {
      index += 1;
      break;
    }
    if (char === '\n') break;
    value += char;
    index += 1;
  }
  return { parts: [{ type: 'text', value }], next: index };
}

function readExpression(source, start) {
  let index = start;
  let depth = 1;
  let value = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
      value += char;
      index += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        break;
      }
      value += char;
      index += 1;
      continue;
    }
    if (char === '`' || char === "'" || char === '"') {
      const nested = char === '`' ? readTemplate(source, index) : readQuoted(source, index);
      value += source.slice(index, nested.next);
      index = nested.next;
      continue;
    }
    value += char;
    index += 1;
  }
  return { value, next: index };
}

function readTemplate(source, start) {
  let index = start + 1;
  const parts = [];
  let text = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      text += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === '`') {
      index += 1;
      break;
    }
    if (char === '$' && source[index + 1] === '{') {
      parts.push({ type: 'text', value: text });
      text = '';
      const expression = readExpression(source, index + 2);
      parts.push({ type: 'expression', value: expression.value });
      index = expression.next;
      continue;
    }
    text += char;
    index += 1;
  }
  parts.push({ type: 'text', value: text });
  return { parts, next: index };
}

function scanLiterals(source) {
  const literals = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && canStartRegex(source.slice(Math.max(0, index - 24), index))) {
      index = skipRegex(source, index);
      continue;
    }
    if (char === '`' || char === "'" || char === '"') {
      const literal = char === '`' ? readTemplate(source, index) : readQuoted(source, index);
      literals.push({ start: index, end: literal.next, parts: literal.parts });
      index = literal.next;
      continue;
    }
    index += 1;
  }
  return literals;
}

const DECLARATION = /(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=[ \t]*/g;

function literalBindings(code, literals) {
  const byStart = new Map(literals.map((literal) => [literal.start, literal]));
  const bindings = new Map();
  const exported = new Set();
  for (const match of code.matchAll(DECLARATION)) {
    const literal = byStart.get(match.index + match[0].length);
    if (literal === undefined) continue;
    bindings.set(match[2], literal);
    if (match[1] !== undefined) exported.add(match[2]);
  }
  return { bindings, exported };
}

function groupEnd(code, openIndex, literalEnds) {
  const open = code[openIndex];
  const close = open === '[' ? ']' : ')';
  let depth = 0;
  let index = openIndex;
  while (index < code.length) {
    const skipTo = literalEnds.get(index);
    if (skipTo !== undefined) {
      index = skipTo;
      continue;
    }
    const char = code[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return code.length;
}

const FRAGMENT_LIST = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*\[/g;
const FRAGMENT_PUSH = /\b([A-Za-z_$][\w$]*)\s*\.\s*push\s*\(/g;
const BRANCH_KEYWORD = /\b(?:if|else|for|while|switch|case|catch)\b|&&|\|\|/;

/** The nesting a position sits at, counting only braces outside every literal. */
function braceDepths(code, literalEnds, offsets) {
  const wanted = [...offsets].sort((left, right) => left - right);
  const depths = new Map();
  let depth = 0;
  let next = 0;
  let index = 0;
  while (index < code.length && next < wanted.length) {
    while (next < wanted.length && wanted[next] <= index) {
      depths.set(wanted[next], depth);
      next += 1;
    }
    const skipTo = literalEnds.get(index);
    if (skipTo !== undefined) {
      index = skipTo;
      continue;
    }
    if (code[index] === '{') depth += 1;
    else if (code[index] === '}') depth -= 1;
    index += 1;
  }
  for (; next < wanted.length; next += 1) depths.set(wanted[next], depth);
  return depths;
}

/**
 * A predicate list assembled at runtime says what it always contains, which is
 * not the same as what it can contain. A literal in the array's own initialiser
 * is in every query built from it; one pushed under a condition is not, so it
 * cannot stand in for the marker a reader owes.
 */
function fragmentSources(code, literals) {
  const literalEnds = new Map(literals.map((literal) => [literal.start, literal.end]));
  const lists = [...code.matchAll(FRAGMENT_LIST)];
  const pushes = [...code.matchAll(FRAGMENT_PUSH)];
  const depths = braceDepths(
    code,
    literalEnds,
    [...lists, ...pushes].map((match) => match.index),
  );
  const declaredAt = new Map();
  for (const match of lists) declaredAt.set(match[1], depths.get(match.index) ?? 0);

  const fragments = new Map();
  const collect = (match) => {
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = groupEnd(code, openIndex, literalEnds);
    const entries = fragments.get(match[1]) ?? [];
    for (const literal of literals) {
      if (literal.start > openIndex && literal.end <= closeIndex) entries.push(literal);
    }
    fragments.set(match[1], entries);
  };

  for (const match of lists) collect(match);
  for (const match of pushes) {
    if ((depths.get(match.index) ?? 0) > (declaredAt.get(match[1]) ?? 0)) continue;
    const statement = code.slice(0, match.index);
    const start = Math.max(
      statement.lastIndexOf(';'),
      statement.lastIndexOf('{'),
      statement.lastIndexOf('}'),
    );
    if (BRANCH_KEYWORD.test(statement.slice(start + 1))) continue;
    collect(match);
  }
  return fragments;
}

function interpolatedNames(literals) {
  const names = new Set();
  for (const literal of literals) {
    for (const part of literal.parts) {
      if (part.type !== 'expression') continue;
      for (const match of part.value.matchAll(/[A-Za-z_$][\w$]*/g)) names.add(match[0]);
    }
  }
  return names;
}

function renderExpression(expression, context, seen) {
  let rendered = '';
  for (const name of new Set(expression.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
    if (seen.has(name)) continue;
    const next = new Set([...seen, name]);
    const bound = context.bindings.get(name);
    if (bound !== undefined) rendered += ` ${renderLiteral(bound, context, next)} `;
    for (const fragment of context.fragments.get(name) ?? []) {
      rendered += ` ${renderLiteral(fragment, context, next)} `;
    }
  }
  return rendered === '' ? `\${${expression}}` : rendered;
}

function renderLiteral(literal, context, seen) {
  let rendered = '';
  for (const part of literal.parts) {
    if (part.type === 'text') rendered += part.value;
    else rendered += renderExpression(part.value, context, seen);
  }
  return rendered;
}

// Prose names tables too. Only text that issues a statement is judged as one.
const SQL_VERB = /\b(?:select|insert\s+into|update|delete\s+from|with)\b/i;

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  for (const char of sql) {
    if (quote !== null) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';') {
      statements.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  statements.push(current);
  return statements;
}

/**
 * Every SQL statement a module can issue, with the fragments it splices in
 * resolved. A fragment consumed by another literal in the same file is judged
 * in the statement that uses it, never on its own.
 */
export function sqlStatements(source) {
  const code = stripComments(source);
  const literals = scanLiterals(code);
  const { bindings, exported } = literalBindings(code, literals);
  const context = { bindings, fragments: fragmentSources(code, literals) };
  const interpolated = interpolatedNames(literals);
  const spliced = new Set();
  for (const [name, literal] of bindings) {
    if (interpolated.has(name) && !exported.has(name)) spliced.add(literal);
  }

  const statements = [];
  for (const literal of literals) {
    if (spliced.has(literal)) continue;
    const rendered = renderLiteral(literal, context, new Set()).replace(/(^|\s)--[^\n]*/g, '$1 ');
    for (const statement of splitStatements(rendered)) {
      const trimmed = statement.trim();
      if (trimmed.length > 0 && SQL_VERB.test(trimmed)) statements.push(trimmed);
    }
  }
  return statements;
}

const referencePatterns = new Map();

function referencePattern(table) {
  let pattern = referencePatterns.get(table);
  if (pattern === undefined) {
    pattern = new RegExp(
      `(\\bfrom\\s+|\\bjoin\\s+|,\\s*)(?:only\\s+)?(?:lateral\\s+)?(?:public\\s*\\.\\s*)?${table}\\b`,
      'g',
    );
    referencePatterns.set(table, pattern);
  }
  return pattern;
}

/** Each place a statement puts a table in scope, under the name it uses there. */
function tableReferences(statement, table) {
  const references = [];
  for (const match of statement.matchAll(referencePattern(table))) {
    const after = statement.slice(match.index + match[0].length);
    // A comma puts a table in the FROM list, and a column in the select list.
    if (match[1].startsWith(',') && /^\s*[,).:]/.test(after)) continue;
    const candidate = /^\s*(?:as\s+)?([a-z_][a-z0-9_]*)/.exec(after);
    const alias = candidate !== null && !ALIAS_STOP_WORDS.has(candidate[1]) ? candidate[1] : null;
    references.push({ alias, name: alias ?? table });
  }
  return references;
}

/**
 * A marker answers for the name it is qualified with and no other. Unqualified,
 * it answers only for a table nothing aliased, and only where it reads as a
 * predicate: a column list that merely names it selects withdrawn rows.
 */
function markerSatisfied({ statement, reference, marker }) {
  if (new RegExp(`\\b${reference.name}\\s*\\.\\s*${marker}\\b`).test(statement)) return true;
  if (reference.alias !== null) return false;
  return new RegExp(
    `(^|[^.\\w])(?:not\\s+)?${marker}\\s*(?:is\\b|=|<|>|!)|coalesce\\s*\\(\\s*${marker}\\b`,
  ).test(statement);
}

/**
 * A production statement that puts a marked table in scope and never narrows
 * that scope to the rows still standing is reading withdrawn rows.
 */
export function findUnfilteredReads({ repoRoot = REPO_ROOT, files, contract, marked }) {
  const helpersFor = new Map();
  for (const helper of contract.predicateHelpers ?? []) {
    for (const table of helper.resources) {
      const entries = helpersFor.get(table) ?? [];
      entries.push(helper.symbol);
      helpersFor.set(table, entries);
    }
  }

  const reads = [];
  for (const relativePath of files) {
    if (!SERVER_ROOTS.some((root) => relativePath.startsWith(root))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    const raw = readSource(repoRoot, relativePath);
    if (raw === null) continue;
    const lowerSource = raw.toLowerCase();
    const candidates = [...marked].filter(([table]) => lowerSource.includes(table));
    if (candidates.length === 0) continue;

    const seen = new Set();
    for (const statement of sqlStatements(raw)) {
      const lower = statement.toLowerCase();
      for (const [table, markers] of candidates) {
        if (!lower.includes(table)) continue;
        // Soft delete is withdrawn consent, so it is the marker a reader owes.
        // Archive only binds a table that has no soft delete of its own.
        const marker = markers.softDeleted ?? markers.archived;
        const references = tableReferences(lower, table);
        if (references.length === 0) continue;
        if ((helpersFor.get(table) ?? []).some((symbol) => statement.includes(symbol))) continue;
        if (
          references.every((reference) => markerSatisfied({ statement: lower, reference, marker }))
        )
          continue;
        const key = `${relativePath}#${table}`;
        if (seen.has(key)) continue;
        seen.add(key);
        reads.push({ file: relativePath, table, marker });
      }
    }
  }
  return reads;
}

function checkResourceCoverage({ contract, tables, marked, errors }) {
  for (const [table, markers] of marked) {
    const resource = contract.resources[table];
    if (resource === undefined) {
      errors.push(
        `${CONTRACT_PATH}: ${table} carries ${Object.values(markers).join(' and ')} and declares no ` +
          'lifecycle semantics. A row a surface can withdraw needs its promises written down.',
      );
      continue;
    }
    for (const [kind, column] of Object.entries(markers)) {
      if (resource[kind] === undefined) {
        errors.push(
          `${CONTRACT_PATH}: ${table} carries ${column} and declares no ${kind} semantics.`,
        );
        continue;
      }
      if (resource[kind].column !== column) {
        errors.push(
          `${CONTRACT_PATH}: ${table} declares ${kind} column ${resource[kind].column}, but the ` +
            `migrations give it ${column}.`,
        );
      }
    }
  }

  for (const [table, resource] of Object.entries(contract.resources)) {
    const columns = tables.get(table);
    if (columns === undefined) {
      errors.push(`${CONTRACT_PATH}: declares ${table}, which no migration creates.`);
      continue;
    }
    for (const kind of ['softDeleted', 'archived']) {
      const entry = resource[kind];
      if (entry === undefined) continue;
      if (!columns.has(entry.column)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} claims ${kind} column ${entry.column}, which no migration adds.`,
        );
      }
    }
  }
}

function checkRecovery({ repoRoot, contract, errors }) {
  const gaps = new Map(
    (contract.recoveryGaps ?? []).map((gap) => [`${gap.table}#${gap.facet}`, gap]),
  );
  const seen = new Set();

  const record = (table, facet, message) => {
    const key = `${table}#${facet}`;
    const gap = gaps.get(key);
    if (gap === undefined) {
      errors.push(message);
      return;
    }
    seen.add(key);
  };

  for (const [table, resource] of Object.entries(contract.resources)) {
    for (const kind of ['softDeleted', 'archived']) {
      const entry = resource[kind];
      if (entry === undefined) continue;

      if (entry.restoredBy === null) {
        record(
          table,
          `${kind}.restore`,
          `${CONTRACT_PATH}: ${table} can be ${kind} and names nothing that puts it back. ` +
            'A withdrawal nobody can undo is a deletion with a slower name.',
        );
      } else if (!exists(repoRoot, entry.restoredBy)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} names restore site ${entry.restoredBy}, which does not exist.`,
        );
      } else {
        const source = readSource(repoRoot, entry.restoredBy) ?? '';
        if (!source.includes(entry.column)) {
          errors.push(
            `${CONTRACT_PATH}: ${entry.restoredBy} is named as the restore site for ${table} and ` +
              `never writes ${entry.column}.`,
          );
        }
      }

      if (kind !== 'softDeleted') continue;
      if (entry.purgedBy === null) {
        record(
          table,
          'softDeleted.purge',
          `${CONTRACT_PATH}: ${table} is soft deleted and nothing purges it. "Recoverable until ` +
            'purge" needs a purge; without one the row is kept forever.',
        );
      } else if (!exists(repoRoot, entry.purgedBy)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} names purge site ${entry.purgedBy}, which does not exist.`,
        );
      } else {
        const source = (readSource(repoRoot, entry.purgedBy) ?? '').toLowerCase();
        if (!new RegExp(`delete\\s+from\\s+(?:public\\s*\\.\\s*)?${table}\\b`).test(source)) {
          errors.push(
            `${CONTRACT_PATH}: ${entry.purgedBy} is named as the purge site for ${table} and never ` +
              'deletes from it.',
          );
        }
      }
    }
  }

  for (const [key, gap] of gaps) {
    if (typeof gap.why !== 'string' || gap.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: recovery gap ${key} carries no reason.`);
    }
    if (typeof gap.fix !== 'string' || gap.fix.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: recovery gap ${key} does not say what would close it.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: recovery gap ${key} no longer describes a real gap. Delete it; this list only shrinks.`,
      );
    }
  }
}

function checkSharing({ repoRoot, contract, shareSurfaces, errors }) {
  for (const [table, resource] of Object.entries(contract.resources)) {
    const surfaces = [...(shareSurfaces.get(table) ?? [])].sort();
    if (surfaces.length === 0) continue;
    for (const kind of ['softDeleted', 'archived']) {
      const entry = resource[kind];
      if (entry === undefined) continue;
      if (entry.sharing === undefined) {
        errors.push(
          `${CONTRACT_PATH}: ${table} is handed out through ${surfaces.join(', ')} and does not say ` +
            `what ${kind} does to that link.`,
        );
        continue;
      }
      if (!contract.sharingOutcomes.includes(entry.sharing.outcome)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} declares ${kind} sharing outcome "${entry.sharing.outcome}", ` +
            `which is not one of ${contract.sharingOutcomes.join(', ')}.`,
        );
      }
      const declared = new Set(entry.sharing.surfaces);
      for (const surface of surfaces) {
        if (!declared.has(surface)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} hands itself out through ${surface}, which its ${kind} ` +
              'sharing entry does not name.',
          );
        }
      }
      for (const surface of declared) {
        if (!surfaces.includes(surface)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} names share surface ${surface}, which no longer references it.`,
          );
        }
      }
      if (entry.sharing.outcome === 'revoked') {
        const site = entry.sharing.revokedBy;
        if (typeof site !== 'string' || !exists(repoRoot, site)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} claims ${kind} revokes its share links and names no site that does it.`,
          );
        } else if (
          !surfaces.some((surface) => (readSource(repoRoot, site) ?? '').includes(surface))
        ) {
          errors.push(
            `${CONTRACT_PATH}: ${site} is named as the ${kind} revocation site for ${table} and ` +
              `mentions none of ${surfaces.join(', ')}.`,
          );
        }
      }
    }
  }
}

function checkReads({ contract, reads, errors }) {
  const exemptions = new Map(
    (contract.readExemptions ?? []).map((entry) => [`${entry.file}#${entry.table}`, entry]),
  );
  const seen = new Set();
  const fresh = [];

  for (const read of reads) {
    const key = `${read.file}#${read.table}`;
    if (exemptions.has(key)) {
      seen.add(key);
      continue;
    }
    fresh.push(read);
  }

  for (const [key, entry] of exemptions) {
    if (!READ_CLASSES.includes(entry.class)) {
      errors.push(
        `${CONTRACT_PATH}: read exemption ${key} claims class "${entry.class}", which is not one of ` +
          `${READ_CLASSES.join(', ')}.`,
      );
    }
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: read exemption ${key} carries no reason.`);
    }
    if (
      entry.class === 'defect' &&
      (typeof entry.fix !== 'string' || entry.fix.trim().length === 0)
    ) {
      errors.push(`${CONTRACT_PATH}: read exemption ${key} is a defect and does not name its fix.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: read exemption ${key} no longer reads withdrawn rows. Delete it; this list only shrinks.`,
      );
    }
  }

  return fresh;
}

function checkArchiveAgreement({ repoRoot, contract, errors }) {
  const shared = readArchivedSemantics(repoRoot);
  if (shared === null) {
    errors.push(
      `${SEMANTICS_MODULE}: RESOURCE_LIFECYCLE_SEMANTICS no longer states what archived means. ` +
        'The archive checks are reading nothing.',
    );
    return;
  }
  for (const facet of contract.archiveFacets) {
    if (shared[facet] === undefined) {
      errors.push(
        `${SEMANTICS_MODULE}: archived says nothing about "${facet}", which ${CONTRACT_PATH} requires.`,
      );
    }
  }
  if (shared.searchable !== false || shared.aiRetrievable !== false) {
    errors.push(
      `${SEMANTICS_MODULE}: archived is declared searchable or retrievable, so nothing stops an ` +
        'archived resource reaching a search result or a model context.',
    );
  }
}

/** Tables a module deletes, whether it spells the name or holds it in a list. */
export function tablesClearedBy({ repoRoot, files, tables }) {
  const cleared = new Set();
  for (const relativePath of files) {
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const code = stripComments(source);
    for (const match of code.matchAll(
      /delete\s+from\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gi,
    )) {
      cleared.add(match[1].toLowerCase());
    }
    for (const match of code.matchAll(/['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
      if (tables.has(match[1])) cleared.add(match[1]);
    }
  }
  return cleared;
}

/** Everything a cascade takes with it once one of `roots` is deleted. */
export function cascadeClosure({ roots, foreignKeys }) {
  const children = new Map();
  for (const key of foreignKeys) {
    if (key.action !== 'cascade') continue;
    const entries = children.get(key.parent) ?? new Set();
    entries.add(key.child);
    children.set(key.parent, entries);
  }
  const reached = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    for (const child of children.get(queue.pop()) ?? []) {
      if (reached.has(child)) continue;
      reached.add(child);
      queue.push(child);
    }
  }
  return reached;
}

function storeMembers({ store, tables }) {
  const byName = store.namePattern === undefined ? null : new RegExp(store.namePattern);
  const byColumn = store.columnPattern === undefined ? null : new RegExp(store.columnPattern);
  const members = [];
  for (const [table, columns] of tables) {
    const named = byName !== null && byName.test(table);
    const carried = byColumn !== null && [...columns].some((column) => byColumn.test(column));
    if (named || carried) members.push(table);
  }
  return members.sort();
}

/**
 * A hard delete that stops at the primary row leaves the copy that made the
 * resource findable. Each store names what clears it, and the members are
 * derived from the schema so a new one is in scope the day it is created.
 */
function checkHardDelete({ repoRoot, contract, tables, foreignKeys, errors }) {
  const stores = contract.hardDeleteStores ?? {};
  const exclusions = new Map(
    (contract.hardDeleteExclusions ?? []).map((entry) => [`${entry.table}#${entry.store}`, entry]),
  );
  const seen = new Set();

  for (const [name, store] of Object.entries(stores)) {
    if (typeof store.why !== 'string' || store.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: hard-delete store "${name}" carries no reason for existing.`);
    }
    const members = storeMembers({ store, tables });
    if (members.length === 0) {
      errors.push(
        `${CONTRACT_PATH}: hard-delete store "${name}" matches no table. The pattern is reading ` +
          'nothing, so the store is unguarded.',
      );
      continue;
    }

    const clearedBy = store.clearedBy ?? [];
    for (const site of clearedBy) {
      if (!exists(repoRoot, site)) {
        errors.push(
          `${CONTRACT_PATH}: hard-delete store "${name}" names ${site}, which does not exist.`,
        );
      }
    }

    const cleared = tablesClearedBy({ repoRoot, files: clearedBy, tables });
    const reached = cascadeClosure({ roots: cleared, foreignKeys });

    for (const table of members) {
      const key = `${table}#${name}`;
      if (store.retained === true) {
        if (!cleared.has(table)) continue;
        errors.push(
          `${CONTRACT_PATH}: ${table} is retained by "${name}" and ${clearedBy.join(', ')} deletes it.`,
        );
        continue;
      }
      if (reached.has(table)) continue;
      if (exclusions.has(key)) {
        seen.add(key);
        continue;
      }
      errors.push(
        `${MIGRATIONS_DIR}: ${table} belongs to the "${name}" store and no erasure path reaches it, ` +
          'directly or by cascade. A hard delete leaves it behind.',
      );
    }
  }

  for (const [key, entry] of exclusions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: hard-delete exclusion ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: hard-delete exclusion ${key} is now reached by erasure. Delete it; this list only shrinks.`,
      );
    }
  }
}

export function checkLifecycleSemantics(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const tables = readTableColumns(repoRoot);
  const foreignKeys = readForeignKeys(repoRoot);
  const marked = findMarkedTables({ tables, contract });
  const shareSurfaces = findShareSurfaces({ tables, foreignKeys });
  const files = repositoryFiles(repoRoot);
  const reads = findUnfilteredReads({ repoRoot, files, contract, marked });

  checkResourceCoverage({ contract, tables, marked, errors });
  checkRecovery({ repoRoot, contract, errors });
  checkSharing({ repoRoot, contract, shareSurfaces, errors });
  checkArchiveAgreement({ repoRoot, contract, errors });
  checkHardDelete({ repoRoot, contract, tables, foreignKeys, errors });
  const unrecorded = checkReads({ contract, reads, errors });

  return {
    errors,
    unrecorded,
    report: {
      marked: marked.size,
      resources: Object.keys(contract.resources).length,
      shareSurfaces: [...shareSurfaces.values()].reduce((total, set) => total + set.size, 0),
      exemptions: (contract.readExemptions ?? []).length,
      defects: (contract.readExemptions ?? []).filter((entry) => entry.class === 'defect').length,
      gaps: (contract.recoveryGaps ?? []).length,
      stores: Object.keys(contract.hardDeleteStores ?? {}).length,
    },
  };
}

function main() {
  const { errors, unrecorded, report } = checkLifecycleSemantics(REPO_ROOT);

  if (errors.length > 0 || unrecorded.length > 0) {
    console.error('Lifecycle semantics check failed:');
    for (const error of errors) console.error(`- ${error}`);
    for (const read of unrecorded) {
      console.error(
        `- ${read.file}: reads ${read.table} without naming its withdrawal marker, so a deleted or ` +
          'archived row reaches this caller. Filter it, or record the read and why.',
      );
    }
    process.exit(1);
  }

  console.log(
    `check-lifecycle-semantics: OK (${report.marked} withdrawable tables, ${report.resources} declared, ` +
      `${report.shareSurfaces} share surfaces, ${report.exemptions} recorded reads of which ` +
      `${report.defects} are defects, ${report.gaps} recovery gap(s), ${report.stores} hard-delete stores)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
