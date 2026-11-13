// A project id travels from the client on every request, so it authorises
// nothing on its own: a project read is scoped only once an account is bound.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTableColumns } from '../check-resource-metadata.mjs';
import { expandProjectReadScope } from './project-scope-sql.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const SERVER_ROOTS = Object.freeze(['apps/web/app', 'apps/web/lib']);

/** The project row itself: its primary key is the project id. */
export const PROJECT_ROOT_TABLE = 'user_projects';

const OWNER_COLUMNS = Object.freeze([
  'user_id',
  'owner_user_id',
  'owner_id',
  'created_by',
  'member_user_id',
  'organization_id',
  'shared_with_user_id',
]);

const OWNER_PREDICATE = new RegExp(
  `\\b(?:[a-z_]+\\s*\\.\\s*)?(?:${OWNER_COLUMNS.join('|')})\\b\\s*(?:=|in\\s*\\(|is\\s+not\\s+distinct\\s+from|=\\s*any\\s*\\()`,
  'i',
);

const PROJECT_PREDICATE =
  /\b(?:[a-z_]+\s*\.\s*)?project_id\b\s*(?:=|in\s*\(|is\s+not\s+distinct\s+from|=\s*any\s*\()/i;

const PROJECT_ROOT_PREDICATE = /\b(?:[a-z_]+\s*\.\s*)?id\b\s*(?:=|in\s*\(|=\s*any\s*\()/i;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isNonProduction(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|\.next|\.turbo)\//.test(
      relativePath,
    )
  );
}

function walk(dir, repoRoot, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    const relative = path.relative(repoRoot, full).split(path.sep).join('/');
    if (info.isDirectory()) {
      if (!isNonProduction(`${relative}/`)) walk(full, repoRoot, out);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry))) continue;
    if (isNonProduction(relative)) continue;
    out.push(relative);
  }
  return out;
}

export function productionFiles(repoRoot = REPO_ROOT) {
  const files = [];
  for (const root of SERVER_ROOTS) walk(path.join(repoRoot, root), repoRoot, files);
  return files.sort();
}

/**
 * Tables the migrations give a project scope to, plus the project row itself.
 * Enumerated from the SQL so a new project-scoped table joins the check.
 */
export function projectScopedTables(repoRoot = REPO_ROOT) {
  const tables = new Set([PROJECT_ROOT_TABLE]);
  for (const [table, columns] of readTableColumns(repoRoot)) {
    if (columns.has('project_id')) tables.add(table);
  }
  return tables;
}

export function extractStatements(source) {
  const statements = [];
  const patterns = [
    /`([^`]*?(?:from|into|update|join)\s+(?:public\s*\.\s*)?[a-z_]+[\s\S]*?)`/gi,
    /'([^'\n]*?(?:from|into|update|join)\s+(?:public\s*\.\s*)?[a-z_]+[^'\n]*?)'/gi,
    /"([^"\n]*?(?:from|into|update|join)\s+(?:public\s*\.\s*)?[a-z_]+[^"\n]*?)"/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      if (/^\s*(?:with|select|insert|update|delete)\b/i.test(match[1])) {
        statements.push({ sql: match[1], index: match.index });
      }
    }
  }
  return statements.sort((left, right) => left.index - right.index);
}

function tablesRead(sql, scoped) {
  const found = new Set();
  for (const match of sql.matchAll(
    /(?:from|join|into|update)\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gi,
  )) {
    const table = match[1].toLowerCase();
    if (scoped.has(table)) found.add(table);
  }
  return [...found];
}

function narrowsByProject(sql, tables) {
  if (PROJECT_PREDICATE.test(sql)) return true;
  return tables.includes(PROJECT_ROOT_TABLE) && PROJECT_ROOT_PREDICATE.test(sql);
}

/**
 * A statement whose own text binds the project row to an account. Reading
 * project rows through it is what makes a later project_id predicate safe.
 */
function authorisesProject(sql, tables) {
  return (
    tables.includes(PROJECT_ROOT_TABLE) &&
    narrowsByProject(sql, tables) &&
    OWNER_PREDICATE.test(sql)
  );
}

/** The one loader that binds the owner, the workspace and the lifecycle. */
export const CONTEXT_LOADER = 'loadProjectContext';

/** Renderers that turn a project into text a model reads. */
export const CONTEXT_RENDERERS = Object.freeze([
  'renderProjectContext',
  'formatProjectSystemPrompt',
]);

/**
 * The loader answers null for a project that is archived, deleted, or no longer
 * this account's, so a caller that does not test the result runs unscoped.
 */
function handlesNull(source, name) {
  return new RegExp(
    [
      `!\\s*${name}\\b`,
      `\\bif\\s*\\(\\s*${name}\\s*\\)`,
      `\\b${name}\\s*(?:===|!==|==|!=)\\s*null`,
      `\\b${name}\\s*\\?`,
      `\\b${name}\\s*&&`,
    ].join('|'),
  ).test(source);
}

/**
 * How far past the call the test may sit. A null test further away than this is
 * not guarding this call, and the same name is often a parameter elsewhere.
 */
const NULL_CHECK_WINDOW_LINES = 25;

function windowAfter(source, index) {
  const rest = source.slice(index);
  return rest.split('\n').slice(0, NULL_CHECK_WINDOW_LINES).join('\n');
}

export function findUncheckedProjectContextLoads(
  repoRoot = REPO_ROOT,
  files = productionFiles(repoRoot),
) {
  const findings = [];
  const call = new RegExp(`\\b${CONTEXT_LOADER}\\s*\\(`, 'g');
  const assignment = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=[^;]*?\\b${CONTEXT_LOADER}\\s*\\($`,
  );

  for (const relative of files) {
    if (relative.endsWith('lib/services/project-context-service.ts')) continue;
    let source;
    try {
      source = stripComments(readFileSync(path.join(repoRoot, relative), 'utf8'));
    } catch {
      continue;
    }
    call.lastIndex = 0;
    let match;
    while ((match = call.exec(source))) {
      const line = source.slice(0, match.index).split('\n').length;
      const assigned = assignment.exec(source.slice(0, match.index + match[0].length));
      if (!assigned) {
        findings.push({ file: relative, line, binding: null });
        continue;
      }
      if (!handlesNull(windowAfter(source, match.index), assigned[1])) {
        findings.push({ file: relative, line, binding: assigned[1] });
      }
    }
  }
  return findings;
}

/**
 * Modules that render a project into a prompt without loading it through the
 * scoped loader, which is how an unscoped project reaches a model.
 */
export function findUnloadedProjectRenders(
  repoRoot = REPO_ROOT,
  files = productionFiles(repoRoot),
) {
  const findings = [];
  for (const relative of files) {
    if (relative.endsWith('lib/services/project-context-service.ts')) continue;
    let source;
    try {
      source = stripComments(readFileSync(path.join(repoRoot, relative), 'utf8'));
    } catch {
      continue;
    }
    const rendered = CONTEXT_RENDERERS.filter((name) =>
      new RegExp(`\\b${name}\\s*\\(`).test(source),
    );
    if (rendered.length === 0) continue;
    if (new RegExp(`\\b${CONTEXT_LOADER}\\s*\\(`).test(source)) continue;
    findings.push({ file: relative, renderers: rendered });
  }
  return findings;
}

const TEMPLATE_CONSTANT = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*`([^`]*)`/g;
const NAMED_IMPORT = /import\s+\{([^}]*)\}\s*from\s*'@\/([^']+)'/g;
const BARE_INTERPOLATION = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

function templateConstants(source) {
  return new Map([...source.matchAll(TEMPLATE_CONSTANT)].map((match) => [match[1], match[2]]));
}

/**
 * The SQL fragments a module can splice into a statement by name: its own
 * template constants and the ones it imports from another server module.
 * A fragment that binds the owner binds it in every statement it is spliced
 * into, so the statement is judged with the fragment's text in place.
 */
function spliceableFragments(source, repoRoot) {
  const fragments = templateConstants(source);
  for (const match of source.matchAll(NAMED_IMPORT)) {
    let imported;
    try {
      imported = stripComments(
        readFileSync(path.join(repoRoot, `apps/web/${match[2]}.ts`), 'utf8'),
      );
    } catch {
      continue;
    }
    const exported = templateConstants(imported);
    for (const specifier of match[1].split(',')) {
      const [name, local = name] = specifier.trim().split(/\s+as\s+/);
      if (name && exported.has(name)) fragments.set(local, exported.get(name));
    }
  }
  return fragments;
}

function spliceFragments(sql, fragments) {
  return sql.replace(BARE_INTERPOLATION, (whole, name) => fragments.get(name) ?? whole);
}

export function findUnscopedProjectReads(repoRoot = REPO_ROOT, files = productionFiles(repoRoot)) {
  const scoped = projectScopedTables(repoRoot);
  const findings = [];

  for (const relative of files) {
    let source;
    try {
      source = stripComments(readFileSync(path.join(repoRoot, relative), 'utf8'));
    } catch {
      continue;
    }
    let statements = extractStatements(source);
    if (statements.some((statement) => statement.sql.includes('${'))) {
      const fragments = spliceableFragments(source, repoRoot);
      statements = statements.map((statement) => ({
        ...statement,
        sql: spliceFragments(statement.sql, fragments),
      }));
    }
    let authorisedAt = Number.POSITIVE_INFINITY;
    let expandConstants;
    for (const statement of statements) {
      statement.sql = expandProjectReadScope(statement.sql, source, relative, repoRoot);
      const tables = tablesRead(statement.sql, scoped);
      if (tables.length === 0) continue;
      if (authorisesProject(sql, tables)) {
        authorisedAt = Math.min(authorisedAt, statement.index);
        continue;
      }
      if (!narrowsByProject(sql, tables)) continue;
      if (OWNER_PREDICATE.test(sql)) continue;
      if (statement.index > authorisedAt) continue;
      findings.push({
        file: relative,
        tables: tables.sort(),
        line: source.slice(0, statement.index).split('\n').length,
        sql: statement.sql.replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
  }

  return findings;
}
