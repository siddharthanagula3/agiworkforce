import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ts from 'typescript';
import { expectedTablesAfter, loadMigrationInventory } from './neon-migrations.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DEFAULT_SOURCE_ROOTS = [
  'apps/web/app/api',
  'services/api-gateway/src/routes',
  'services/api-gateway/src/websocket.ts',
];

function walkSourceFiles(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === 'node_modules' ||
      entry.name === '__tests__' ||
      entry.name.startsWith('.') ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      return [];
    }
    const child = join(path, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(child);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [child] : [];
  });
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function sqlRelationReferences(sql) {
  const cteNames = new Set();
  for (const match of sql.matchAll(
    /(?:\bwith\b(?:\s+recursive\b)?|,)\s*"?([a-z_][a-z0-9_]*)"?(?:\s*\([^)]*\))?\s+as\s+(?:materialized\s+)?\(/gi,
  )) {
    cteNames.add(match[1].toLowerCase());
  }

  const relations = new Set();
  const pattern =
    /\b(from|join|insert\s+into|update|delete\s+from)\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const match of sql.matchAll(pattern)) {
    const operation = match[1].toLowerCase().replace(/\s+/g, ' ');
    const relation = match[2].toLowerCase();
    const prefix = sql.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0);
    const remainder = sql.slice((match.index ?? 0) + match[0].length);
    if (
      (operation === 'from' && /\bdistinct\s*$/i.test(prefix)) ||
      (operation === 'update' && /\b(?:do|for|for\s+no\s+key)\s*$/i.test(prefix)) ||
      ((operation === 'from' || operation === 'join') && remainder.match(/^\s*\(/)) ||
      cteNames.has(relation)
    ) {
      continue;
    }
    relations.add(relation);
  }
  return relations;
}

function addReference(references, table, file, sourceFile, position, kind) {
  const normalized = table.toLowerCase();
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  const entries = references.get(normalized) ?? [];
  entries.push({
    file,
    line: location.line + 1,
    column: location.character + 1,
    kind,
  });
  references.set(normalized, entries);
}

export function extractRouteReferencesFromSource(source, file = '<source>') {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const references = new Map();

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.arguments.length > 0
    ) {
      const method = node.expression.name.text;
      const firstArgument = literalText(node.arguments[0]);
      if (method === 'from' && firstArgument?.match(/^[A-Za-z_][A-Za-z0-9_]*$/)) {
        addReference(
          references,
          firstArgument,
          file,
          sourceFile,
          node.getStart(sourceFile),
          'from',
        );
      } else if ((method === 'query' || method === 'execute') && firstArgument) {
        for (const relation of sqlRelationReferences(firstArgument)) {
          addReference(references, relation, file, sourceFile, node.getStart(sourceFile), 'sql');
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

export function extractRouteTableReferences(repoRoot, sourceRoots = DEFAULT_SOURCE_ROOTS) {
  const references = new Map();
  const sourceFiles = sourceRoots.flatMap((sourceRoot) =>
    walkSourceFiles(join(repoRoot, sourceRoot)),
  );

  for (const sourceFile of sourceFiles) {
    const repoPath = relative(repoRoot, sourceFile);
    const extracted = extractRouteReferencesFromSource(readFileSync(sourceFile, 'utf8'), repoPath);
    for (const [table, locations] of extracted) {
      references.set(table, [...(references.get(table) ?? []), ...locations]);
    }
  }
  return references;
}

function expectedViewsAfter(migrations) {
  const views = new Set();
  const pattern =
    /\b(create|drop)\s+(?:materialized\s+)?view\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(pattern)) {
      const name = match[2].toLowerCase();
      if (match[1].toLowerCase() === 'create') views.add(name);
      else views.delete(name);
    }
  }
  return views;
}

export function canonicalRouteRelations(migrations = loadMigrationInventory()) {
  return new Set([...expectedTablesAfter(migrations), ...expectedViewsAfter(migrations)]);
}

export function missingRouteTableMigrations(repoRoot, options = {}) {
  const migrations = options.migrations ?? loadMigrationInventory();
  const canonicalRelations = canonicalRouteRelations(migrations);
  const references = extractRouteTableReferences(repoRoot, options.sourceRoots);
  return [...references.entries()]
    .filter(([table]) => !canonicalRelations.has(table))
    .map(([table, locations]) => ({ table, locations }))
    .sort((left, right) => left.table.localeCompare(right.table));
}
