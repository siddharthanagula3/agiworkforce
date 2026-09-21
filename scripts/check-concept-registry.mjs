#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { USER_OWNED_TABLES } from './lib/db-isolation-tables.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const REGISTRY_PATH = 'packages/contracts/types/src/concept-registry.json';
export const REGISTRY_TYPES_PATH = 'packages/contracts/types/src/concept-registry.ts';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const VOCABULARY_ROOT = 'packages/contracts/types/src';
export const MUTATOR_ROOTS = Object.freeze(['apps/web/app', 'apps/web/lib', 'apps/web/features']);
export const AUDIT_VOCABULARY_PATH = 'apps/web/lib/security-audit.ts';
export const RETENTION_VOCABULARY_PATH = 'packages/contracts/types/src/audit.ts';
export const DEEP_LINK_PATH = 'packages/contracts/types/src/product-links.ts';
export const ORGANIZATION_PERMISSIONS_PATH =
  'packages/contracts/types/src/enterprise/permissions.ts';
export const WORKSPACE_POLICY_PATH =
  'packages/contracts/types/src/enterprise/workspace-controls.ts';
export const SHARED_SCHEMA_ROOT = 'packages/contracts/';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
]);

const OWNERSHIP_KINDS = new Set([
  'user',
  'organization',
  'user-and-organization',
  'platform',
  'parent',
]);
const SYNC_DIRECTIONS = new Set([
  'server-authoritative',
  'client-authoritative',
  'bidirectional',
  'none',
]);
const VERSIONING_STRATEGIES = new Set([
  'server-version',
  'revision-counter',
  'updated-at',
  'append-only',
  'none',
]);
const LIFECYCLE_STATES = new Set(['active', 'archived', 'soft_deleted', 'purged']);
const CHILD_DISPOSITIONS = new Set(['cascade_delete', 'detach', 'retain']);
const AUDIT_BOUNDARIES = new Set([
  'none',
  'user',
  'organization',
  'retained-after-tenant-deletion',
]);
const DUPLICATE_RESOLUTIONS = new Set(['merge', 'keep-distinct']);
const ACCESS_RULES = new Set([
  'owner-only',
  'owner-or-tenant-member',
  'tenant-role',
  'parent-inherited',
  'share-token',
  'platform-only',
]);
const DATA_CLASSES = new Set([
  'user-content',
  'identity',
  'credential',
  'billing',
  'operational',
  'telemetry',
]);
const STORAGE_SCOPES = new Set(['cloud', 'device', 'both']);
const RETENTION_KINDS = new Set(['until-deleted', 'swept', 'audit-class', 'tenant-policy']);
const TABLE_DISPOSITIONS = new Set([
  'identity',
  'operational',
  'telemetry',
  'pre-account',
  'canonical-gap',
]);
/** Boundaries whose rows are read by somebody outside the account that made them. */
const GOVERNED_BOUNDARIES = new Set(['organization', 'retained-after-tenant-deletion']);

/**
 * A column that holds material a bearer authenticates with. `token_type` and
 * `token_endpoint` describe the exchange rather than carry it, so the match is
 * anchored at the end of the name.
 */
const SECRET_COLUMN =
  /(?:^|_)(?:secret|password|passcode|api_key|private_key|key_hash|token|token_hash|access_token|refresh_token)$|^encrypted_|_enc$/;

/** Two vocabularies this close are one concept spelled twice until proven otherwise. */
const DUPLICATE_SHARED_MEMBER_FLOOR = 5;
const DUPLICATE_OVERLAP_FLOOR = 0.8;

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e)\//.test(relativePath)
  );
}

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function loadRegistry(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, REGISTRY_PATH), 'utf8'));
}

function migrationFiles(repoRoot) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      name,
      ordinal: Number.parseInt(name.slice(0, 4), 10),
      sql: stripSqlComments(readFileSync(path.join(dir, name), 'utf8')).toLowerCase(),
    }));
}

const COLUMN_LINE = /^([a-z_][a-z0-9_]*)\s+/;
const NON_COLUMN_LEADERS = new Set([
  'primary',
  'unique',
  'constraint',
  'foreign',
  'check',
  'exclude',
  'like',
  'references',
]);

const CREATE_TABLE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g;
const ALTER_TABLE =
  /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/g;
const DROP_TABLE = /drop\s+table\s+(?:if\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/g;
const CREATE_FUNCTION =
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/g;
const ADD_COLUMN = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/g;
const DROP_COLUMN = /drop\s+column\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/g;
const RENAME_TABLE_TO = /^rename\s+to\s+([a-z_][a-z0-9_]*)/;
const RENAME_COLUMN = /rename\s+column\s+([a-z_][a-z0-9_]*)\s+to\s+([a-z_][a-z0-9_]*)/g;

function columnsDeclaredIn(body) {
  const columns = [];
  let depth = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    const column = COLUMN_LINE.exec(trimmed);
    if (depth === 0 && column && !NON_COLUMN_LEADERS.has(column[1])) columns.push(column[1]);
    depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
  }
  return columns;
}

/** Every statement that changes the shape of a table, in the order it is written. */
function schemaStatements(sql) {
  const statements = [];
  const collect = (pattern, kind) => {
    for (const match of sql.matchAll(pattern)) statements.push({ at: match.index, kind, match });
  };
  collect(CREATE_TABLE, 'create');
  collect(ALTER_TABLE, 'alter');
  collect(DROP_TABLE, 'drop');
  return statements.sort((a, b) => a.at - b.at);
}

/**
 * Table -> { columns, createdIn }, read from the migration history rather than a
 * declared list. Statements apply in source order, so what comes back is the
 * final schema: a dropped table is gone and a dropped column is not a column.
 */
export function readSchemaInventory(migrations) {
  const tables = new Map();
  const functions = new Set();
  const ensure = (table) => {
    if (!tables.has(table)) tables.set(table, { columns: new Set(), createdIn: null });
    return tables.get(table);
  };

  for (const migration of migrations) {
    for (const statement of schemaStatements(migration.sql)) {
      const [, name, body] = statement.match;
      if (statement.kind === 'drop') {
        tables.delete(name);
        continue;
      }
      if (statement.kind === 'create') {
        const entry = ensure(name);
        if (entry.createdIn === null) entry.createdIn = migration.ordinal;
        for (const column of columnsDeclaredIn(body)) entry.columns.add(column);
        continue;
      }

      const entry = ensure(name);
      for (const column of body.matchAll(ADD_COLUMN)) entry.columns.add(column[1]);
      for (const column of body.matchAll(DROP_COLUMN)) entry.columns.delete(column[1]);
      for (const renamed of body.matchAll(RENAME_COLUMN)) {
        entry.columns.delete(renamed[1]);
        entry.columns.add(renamed[2]);
      }
      const renamedTable = RENAME_TABLE_TO.exec(body.trim());
      if (renamedTable !== null) {
        tables.delete(name);
        tables.set(renamedTable[1], entry);
      }
    }

    for (const match of migration.sql.matchAll(CREATE_FUNCTION)) functions.add(match[1]);
  }

  return { tables, functions };
}

const INLINE_REFERENCE =
  /^([a-z_][a-z0-9_]*)\s+[^,]*?\breferences\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/;
const CONSTRAINT_REFERENCE =
  /foreign\s+key\s*\(\s*([a-z_][a-z0-9_]*)[^)]*\)\s*references\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/g;
const ADDED_COLUMN_REFERENCE =
  /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s+[^,;]*?\breferences\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/g;

/**
 * Child table -> column -> parent table, over inline, constraint and added-column
 * references. A dropped column takes its foreign key with it.
 */
export function readForeignKeys(migrations) {
  const keys = new Map();
  const ensure = (table) => {
    if (!keys.has(table)) keys.set(table, new Map());
    return keys.get(table);
  };

  for (const migration of migrations) {
    for (const statement of schemaStatements(migration.sql)) {
      const [, name, body] = statement.match;
      if (statement.kind === 'drop') {
        keys.delete(name);
        continue;
      }
      const entry = ensure(name);
      if (statement.kind === 'create') {
        let depth = 0;
        for (const line of body.split('\n')) {
          const trimmed = line.trim();
          const inline = depth === 0 ? INLINE_REFERENCE.exec(trimmed) : null;
          if (inline !== null && !NON_COLUMN_LEADERS.has(inline[1]))
            entry.set(inline[1], inline[2]);
          depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
        }
        for (const constraint of body.matchAll(CONSTRAINT_REFERENCE))
          entry.set(constraint[1], constraint[2]);
        continue;
      }
      for (const added of body.matchAll(ADDED_COLUMN_REFERENCE)) entry.set(added[1], added[2]);
      for (const constraint of body.matchAll(CONSTRAINT_REFERENCE))
        entry.set(constraint[1], constraint[2]);
      for (const column of body.matchAll(DROP_COLUMN)) entry.delete(column[1]);
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

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function writeStatementPattern(table) {
  return new RegExp(
    `(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\s*\\.\\s*)?${table}\\b`,
    'i',
  );
}

/** Every production file that writes one of `tables`, or calls one of `functions`. */
export function findMutators({ repoRoot, files, tables, functions }) {
  const tablePatterns = tables.map((table) => writeStatementPattern(table));
  const functionPatterns = functions.map(
    (name) => new RegExp(`(?:public\\s*\\.\\s*)?${name}\\s*\\(`, 'i'),
  );
  const found = [];
  for (const relativePath of files) {
    if (!MUTATOR_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.split('/').some((segment) => SKIP_PATH_SEGMENTS.has(segment))) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    if (
      tablePatterns.some((pattern) => pattern.test(source)) ||
      functionPatterns.some((pattern) => pattern.test(source))
    ) {
      found.push(relativePath);
    }
  }
  return found;
}

const CONST_ARRAY_DECLARATION =
  /export\s+const\s+([A-Z][A-Z0-9_]*)\s*(:[^=]+)?=\s*\[([^\]]*)\]\s*(as\s+const(?:\s+satisfies[^;]*)?)?/g;
const DERIVED_UNION =
  /export\s+type\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*\(typeof\s+([A-Z][A-Z0-9_]*)\)/g;
const STRING_LITERAL = /'([^']+)'/g;

/** The generated protocol bindings mirror these types by construction, not by drift. */
const GENERATED_SEGMENT = `${VOCABULARY_ROOT}/generated/`;

/**
 * Exported string vocabularies in the contracts package, as name -> member set.
 * Read from source so a vocabulary added without a registry entry is visible.
 * A union derived from a const array is that array, not a second vocabulary.
 */
export function readVocabularies(repoRoot, files) {
  const vocabularies = new Map();
  for (const relativePath of files) {
    if (!relativePath.startsWith(`${VOCABULARY_ROOT}/`)) continue;
    if (relativePath.startsWith(GENERATED_SEGMENT)) continue;
    if (path.extname(relativePath) !== '.ts') continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;

    DERIVED_UNION.lastIndex = 0;
    const derived = new Set([...source.matchAll(DERIVED_UNION)].map((match) => match[1]));
    const unionNames = new Set();

    const parsed = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, false);
    for (const statement of parsed.statements) {
      if (!ts.isTypeAliasDeclaration(statement)) continue;
      if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
        continue;
      const nodes = ts.isUnionTypeNode(statement.type) ? statement.type.types : [statement.type];
      if (!nodes.every((node) => ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)))
        continue;
      const name = statement.name.text;
      unionNames.add(name);
      if (derived.has(name)) continue;
      const members = nodes.map((node) => node.literal.text);
      if (members.length < DUPLICATE_SHARED_MEMBER_FLOOR) continue;
      vocabularies.set(`${relativePath}#${name}`, {
        file: relativePath,
        name,
        members: new Set(members),
      });
    }

    CONST_ARRAY_DECLARATION.lastIndex = 0;
    let array;
    while ((array = CONST_ARRAY_DECLARATION.exec(source)) !== null) {
      const typing = `${array[2] ?? ''} ${array[4] ?? ''}`;
      if ([...unionNames].some((name) => new RegExp(`\\b${name}\\b`).test(typing))) continue;
      const members = [...array[3].matchAll(STRING_LITERAL)].map((literal) => literal[1]);
      if (members.length < DUPLICATE_SHARED_MEMBER_FLOOR) continue;
      vocabularies.set(`${relativePath}#${array[1]}`, {
        file: relativePath,
        name: array[1],
        members: new Set(members),
      });
    }
  }
  return vocabularies;
}

function overlap(first, second) {
  let shared = 0;
  for (const member of first) if (second.has(member)) shared += 1;
  const union = first.size + second.size - shared;
  return { shared, ratio: union === 0 ? 0 : shared / union };
}

export function findDuplicateVocabularies(vocabularies) {
  const entries = [...vocabularies.values()];
  const pairs = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const left = entries[i];
      const right = entries[j];
      if (left.name === right.name && left.file === right.file) continue;
      const { shared, ratio } = overlap(left.members, right.members);
      if (shared < DUPLICATE_SHARED_MEMBER_FLOOR || ratio < DUPLICATE_OVERLAP_FLOOR) continue;
      pairs.push({
        left: { file: left.file, name: left.name },
        right: { file: right.file, name: right.name },
        shared,
        ratio: Number(ratio.toFixed(2)),
      });
    }
  }
  return pairs.sort((a, b) => b.shared - a.shared);
}

function duplicateKey(first, second) {
  return [`${first.file}#${first.name}`, `${second.file}#${second.name}`].sort().join(' :: ');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkDuplicates(registry, vocabularies, errors) {
  const registered = new Map();
  for (const entry of registry.duplicateVocabularies) {
    const key = duplicateKey(entry.first, entry.second);
    if (registered.has(key)) {
      errors.push(`${REGISTRY_PATH}: duplicate vocabulary ${key} is registered twice.`);
    }
    registered.set(key, entry);

    if (!DUPLICATE_RESOLUTIONS.has(entry.resolution)) {
      errors.push(
        `${REGISTRY_PATH}: ${key} declares resolution "${entry.resolution}"; use one of ${[...DUPLICATE_RESOLUTIONS].join(', ')}.`,
      );
    }
    if (!ISO_DATE.test(entry.migrateBy)) {
      errors.push(
        `${REGISTRY_PATH}: ${key} needs a migrateBy date (YYYY-MM-DD). A duplicate kept without one is a duplicate nobody owns.`,
      );
    }
    for (const side of [entry.first, entry.second]) {
      if (!vocabularies.has(`${side.file}#${side.name}`)) {
        errors.push(
          `${REGISTRY_PATH}: ${side.file} no longer exports the vocabulary ${side.name}. Remove the duplicate entry now that the merge landed.`,
        );
      }
    }
  }

  for (const pair of findDuplicateVocabularies(vocabularies)) {
    const key = duplicateKey(pair.left, pair.right);
    if (registered.has(key)) continue;
    errors.push(
      `${pair.left.file}#${pair.left.name} and ${pair.right.file}#${pair.right.name} share ` +
        `${pair.shared} members (${pair.ratio} overlap) and are not registered as one concept. ` +
        `Merge them, or record the pair in ${REGISTRY_PATH} under duplicateVocabularies with a migrateBy date.`,
    );
  }

  return registered;
}

function requiredRoles(concept) {
  const roles = ['createdAt'];
  if (concept.ownership === 'user' || concept.ownership === 'user-and-organization')
    roles.push('owner');
  if (concept.ownership === 'organization' || concept.ownership === 'user-and-organization')
    roles.push('tenant');
  if (concept.ownership === 'parent') roles.push('parent');
  if (concept.versioning !== 'append-only') roles.push('updatedAt');
  if (concept.versioning === 'server-version' || concept.versioning === 'revision-counter')
    roles.push('version');
  if (concept.lifecycle === 'soft_deleted') roles.push('deletedAt');
  return roles;
}

/**
 * The column roles a table created after the baseline has to carry. Older tables
 * are grandfathered by ordinal, which is what keeps this a ratchet.
 */
export function missingContractColumns({ columns, roles, exempt = [] }) {
  const required = ['owner', 'createdAt', 'updatedAt', 'createdBy', 'version'];
  return required.filter((role) => !exempt.includes(role) && !columns.has(roles[role]?.column));
}

function checkConcepts({ registry, inventory, files, repoRoot, errors }) {
  const claimedTables = new Map();
  const computed = [];

  for (const concept of registry.concepts) {
    const where = `${REGISTRY_PATH}#${concept.name}`;

    if (!OWNERSHIP_KINDS.has(concept.ownership))
      errors.push(`${where}: unknown ownership "${concept.ownership}".`);
    if (!SYNC_DIRECTIONS.has(concept.sync))
      errors.push(`${where}: unknown sync direction "${concept.sync}".`);
    if (!VERSIONING_STRATEGIES.has(concept.versioning))
      errors.push(`${where}: unknown versioning strategy "${concept.versioning}".`);
    if (!LIFECYCLE_STATES.has(concept.lifecycle))
      errors.push(`${where}: unknown lifecycle state "${concept.lifecycle}".`);
    if (!CHILD_DISPOSITIONS.has(concept.childDisposition))
      errors.push(`${where}: unknown child disposition "${concept.childDisposition}".`);
    if (!AUDIT_BOUNDARIES.has(concept.auditBoundary))
      errors.push(`${where}: unknown audit boundary "${concept.auditBoundary}".`);

    const schema = readSource(repoRoot, concept.schema);
    if (schema === null) {
      errors.push(`${where}: canonical schema ${concept.schema} does not exist.`);
    } else if (!new RegExp(`export\\s+(?:[a-z ]*\\s)?\\b${concept.symbol}\\b`).test(schema)) {
      errors.push(`${where}: ${concept.schema} does not export ${concept.symbol}.`);
    }

    for (const relativePath of [...concept.projections, ...concept.providerCopies]) {
      if (readSource(repoRoot, relativePath) === null) {
        errors.push(`${where}: names ${relativePath}, which does not exist.`);
      }
    }

    for (const table of concept.tables) {
      if (!inventory.tables.has(table)) {
        errors.push(`${where}: no migration creates table ${table}.`);
        continue;
      }
      const owner = claimedTables.get(table);
      if (owner !== undefined) {
        errors.push(
          `${where}: table ${table} is already owned by concept "${owner}". One persistent object has one owning concept.`,
        );
        continue;
      }
      claimedTables.set(table, concept.name);
    }

    for (const name of concept.writeFunctions) {
      if (!inventory.functions.has(name)) {
        errors.push(`${where}: no migration creates function ${name}.`);
      }
    }

    const primary = inventory.tables.get(concept.tables[0]);
    if (primary) {
      for (const [role, column] of Object.entries(concept.columns)) {
        if (column === null) continue;
        if (!primary.columns.has(column)) {
          errors.push(
            `${where}: claims ${role} column ${concept.tables[0]}.${column}, which no migration adds.`,
          );
        }
      }
      for (const role of requiredRoles(concept)) {
        if (concept.columns[role] === null || concept.columns[role] === undefined) {
          errors.push(
            `${where}: ownership "${concept.ownership}", versioning "${concept.versioning}" and ` +
              `lifecycle "${concept.lifecycle}" require a ${role} column; the registry names none.`,
          );
        }
      }
    }

    const mutators = findMutators({
      repoRoot,
      files,
      tables: concept.tables,
      functions: concept.writeFunctions,
    });
    for (const declared of concept.mutators) {
      if (!mutators.includes(declared)) {
        errors.push(
          `${where}: declares mutator ${declared}, which writes none of ${concept.tables.join(', ')}.`,
        );
      }
    }
    if (mutators.length > 0 && concept.mutators.length === 0) {
      errors.push(
        `${where}: ${mutators.length} file(s) mutate this concept and the registry names no owning service.`,
      );
    }

    computed.push({
      ...concept,
      storage: concept.tables.map((table) => ({
        table,
        createdIn: inventory.tables.get(table)?.createdIn ?? null,
        columns: [...(inventory.tables.get(table)?.columns ?? [])].sort(),
      })),
      mutatorsFound: mutators,
    });
  }

  return { claimedTables, computed };
}

function checkNewTableColumns({ registry, inventory, claimedTables, errors }) {
  const { baselineMigration, roles } = registry.columnContract;
  const exemptions = new Map(
    registry.columnExemptions.map((entry) => [entry.table, entry.exempt ?? []]),
  );

  for (const [table, entry] of inventory.tables) {
    if (entry.createdIn === null || entry.createdIn <= baselineMigration) continue;
    // Tenant-owned resource tables only. An operational run log or an event
    // row is not a persistent object a user owns, versions or transfers.
    if (!USER_OWNED_TABLES.has(table)) continue;
    const exempt = exemptions.get(table);
    if (exempt !== undefined && exempt.length === 0) continue;
    const missing = missingContractColumns({
      columns: entry.columns,
      roles,
      exempt: exempt ?? [],
    });
    if (missing.length === 0) continue;
    errors.push(
      `${MIGRATIONS_DIR}: ${table} is a user-owned resource created after ` +
        `${String(baselineMigration).padStart(4, '0')} ` +
        `without ${missing.map((role) => roles[role].column).join(', ')}. ` +
        `Add the columns, or record ${table} in ${REGISTRY_PATH} under columnExemptions with a reason` +
        `${claimedTables.has(table) ? '' : ' and give it an owning concept'}.`,
    );
  }
}

/** Primary keys as the migration history declares them, inline or composite. */
export function readPrimaryKeyColumns(migrations) {
  const keys = new Map();
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      const body = match[2];
      const columns = [];
      for (const line of body.split('\n')) {
        if (!/\bprimary\s+key\b/.test(line)) continue;
        const inline = /^\s*([a-z_][a-z0-9_]*)\s+/.exec(line);
        if (inline !== null && inline[1] !== 'primary') columns.push(inline[1]);
      }
      if (columns.length === 0) {
        const composite = /primary\s+key\s*\(([^)]*)\)/.exec(body);
        if (composite !== null) {
          for (const column of composite[1].split(','))
            columns.push(column.trim().replace(/"/g, ''));
        }
      }
      if (columns.length > 0 && !keys.has(match[1])) keys.set(match[1], columns);
    }
  }
  return keys;
}

function stripTsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

function unionMembers(source, symbol) {
  if (source === null) return null;
  const match = new RegExp(`export type ${symbol} =([\\s\\S]*?);`).exec(stripTsComments(source));
  if (match === null) return null;
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]));
}

function arrayMembers(source, symbol) {
  const match = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source ?? '');
  if (match === null) return null;
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]));
}

/** Every single-quoted literal the production tree spells, read in one pass. */
export function productionStringLiterals(repoRoot, files) {
  const literals = new Set();
  for (const relativePath of files) {
    if (!MUTATOR_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.split('/').some((segment) => SKIP_PATH_SEGMENTS.has(segment))) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    for (const match of source.matchAll(/'([a-z][a-z0-9_]{2,63})'/g)) literals.add(match[1]);
  }
  return literals;
}

export function checkAliases({ registry, repoRoot, errors }) {
  const owners = new Map();
  for (const concept of registry.concepts) {
    for (const alias of concept.aliases) {
      const where = `${REGISTRY_PATH}#${concept.name}`;
      if (alias !== alias.toLowerCase()) {
        errors.push(`${where}: alias "${alias}" is not the lower case name the code spells.`);
      }
      if (registry.concepts.some((other) => other.name === alias)) {
        errors.push(
          `${where}: alias "${alias}" is another concept's canonical name, so one word names two objects.`,
        );
      }
      const owner = owners.get(alias);
      if (owner !== undefined && owner !== concept.name) {
        errors.push(
          `${where}: alias "${alias}" is already claimed by "${owner}". An alias two concepts share ` +
            'is the ambiguity this registry exists to remove.',
        );
        continue;
      }
      owners.set(alias, concept.name);

      const sources = [concept.schema, ...concept.mutators];
      const spelled = sources.some((relativePath) => {
        const source = readSource(repoRoot, relativePath);
        return source !== null && new RegExp(`\\b${alias}\\b`, 'i').test(source);
      });
      if (!spelled) {
        errors.push(
          `${where}: alias "${alias}" appears in neither ${concept.schema} nor any declared mutator, ` +
            'so it is a name nothing uses rather than a second name for this object.',
        );
      }
    }
  }
}

export function checkDesignations({
  registry,
  inventory,
  primaryKeys,
  repoRoot,
  literals,
  errors,
}) {
  const auditSource = readSource(repoRoot, AUDIT_VOCABULARY_PATH);
  const eventTypes = unionMembers(auditSource, 'AuditEventType');
  const retentionClasses = arrayMembers(
    readSource(repoRoot, RETENTION_VOCABULARY_PATH),
    'AUDIT_RETENTION_CLASSES',
  );
  const deepLinks = arrayMembers(readSource(repoRoot, DEEP_LINK_PATH), 'PRODUCT_LINK_TARGETS');

  if (eventTypes === null)
    errors.push(`${AUDIT_VOCABULARY_PATH}: no AuditEventType union to resolve against.`);
  if (retentionClasses === null)
    errors.push(`${RETENTION_VOCABULARY_PATH}: no AUDIT_RETENTION_CLASSES to resolve against.`);
  if (deepLinks === null)
    errors.push(`${DEEP_LINK_PATH}: no PRODUCT_LINK_TARGETS to resolve against.`);

  for (const concept of registry.concepts) {
    const where = `${REGISTRY_PATH}#${concept.name}`;

    if (!ACCESS_RULES.has(concept.access)) {
      errors.push(`${where}: unknown access rule "${concept.access}".`);
    }
    if (!STORAGE_SCOPES.has(concept.storage)) {
      errors.push(`${where}: unknown storage scope "${concept.storage}".`);
    }
    if (!Array.isArray(concept.classification) || concept.classification.length === 0) {
      errors.push(
        `${where}: names no data classification, so nothing decides where its rows may go.`,
      );
    }
    for (const entry of concept.classification ?? []) {
      if (!DATA_CLASSES.has(entry))
        errors.push(`${where}: unknown data classification "${entry}".`);
    }

    if (concept.storage === 'cloud' && concept.tables.length === 0) {
      errors.push(`${where}: is stored in the cloud and names no table.`);
    }
    if (concept.storage === 'device' && concept.tables.length > 0) {
      errors.push(
        `${where}: is declared device-only and names ${concept.tables.length} table(s), so the row a ` +
          'second device reads is not the one this claims to be local.',
      );
    }

    const first = concept.tables[0];
    if (first === undefined) {
      if (concept.identity !== null) {
        errors.push(`${where}: names identity "${concept.identity}" and has no table to carry it.`);
      }
    } else {
      const key = primaryKeys.get(first);
      if (key === undefined) {
        errors.push(`${where}: ${first} has no primary key, so the concept has no identity.`);
      } else if (!key.includes(concept.identity)) {
        errors.push(
          `${where}: claims identity ${first}.${concept.identity}; the migrations key that table by ` +
            `${key.join(', ')}.`,
        );
      }
    }

    const columns = concept.columns ?? {};
    if (concept.access === 'parent-inherited' && concept.ownership !== 'parent') {
      errors.push(`${where}: inherits access from a parent and is not owned by one.`);
    }
    if (concept.access === 'platform-only' && concept.ownership !== 'platform') {
      errors.push(`${where}: is reachable only by the platform and is owned by an account.`);
    }
    if (concept.access === 'owner-only' && columns.tenant !== undefined) {
      errors.push(
        `${where}: is declared owner-only and carries a tenant column, so an organization reader has ` +
          'a scope the access rule never mentions.',
      );
    }
    if (
      concept.access === 'owner-or-tenant-member' &&
      (columns.owner === undefined || columns.tenant === undefined)
    ) {
      errors.push(
        `${where}: is reachable by an owner or a tenant member and names only one of the two columns.`,
      );
    }
    if (concept.access === 'tenant-role' && columns.tenant === undefined) {
      errors.push(`${where}: decides access by a tenant role and names no tenant column.`);
    }

    const secrets = concept.tables.flatMap((table) =>
      [...(inventory.tables.get(table)?.columns ?? [])]
        .filter((column) => SECRET_COLUMN.test(column))
        .map((column) => `${table}.${column}`),
    );
    const classified = (concept.classification ?? []).includes('credential');
    if (secrets.length > 0 && !classified) {
      errors.push(
        `${where}: stores ${secrets.join(', ')} and is not classified as credential, so a rule that ` +
          'redacts credentials will not reach it.',
      );
    }
    if (secrets.length === 0 && classified) {
      errors.push(
        `${where}: is classified as credential and no column of it holds authenticating material. ` +
          'Remove the class; it only widens what has to be redacted.',
      );
    }

    const retention = concept.retention ?? {};
    if (!RETENTION_KINDS.has(retention.kind)) {
      errors.push(`${where}: unknown retention kind "${retention.kind}".`);
    }
    if (retention.kind === 'swept') {
      const source = readSource(repoRoot, retention.purgedBy ?? '');
      if (source === null) {
        errors.push(`${where}: retention names ${retention.purgedBy}, which does not exist.`);
      } else if (!concept.tables.some((table) => source.includes(table))) {
        errors.push(
          `${where}: ${retention.purgedBy} is named as the sweep and mentions none of ` +
            `${concept.tables.join(', ')}, so nothing ends these rows.`,
        );
      }
    }
    if (
      retention.kind === 'audit-class' &&
      retentionClasses !== null &&
      !retentionClasses.has(retention.class)
    ) {
      errors.push(
        `${where}: retention class "${retention.class}" is not one the audit contract defines.`,
      );
    }
    if (
      retention.kind === 'tenant-policy' &&
      readSource(repoRoot, retention.policy ?? '') === null
    ) {
      errors.push(`${where}: retention names policy ${retention.policy}, which does not exist.`);
    }

    for (const event of concept.events ?? []) {
      if (eventTypes !== null && !eventTypes.has(event)) {
        errors.push(
          `${where}: names audit event "${event}", which ${AUDIT_VOCABULARY_PATH} does not define.`,
        );
        continue;
      }
      if (!literals.has(event)) {
        errors.push(
          `${where}: names audit event "${event}" that no production module emits, so the trail this ` +
            'concept claims is a list rather than a record.',
        );
      }
    }
    if (GOVERNED_BOUNDARIES.has(concept.auditBoundary) && (concept.events ?? []).length === 0) {
      errors.push(
        `${where}: is read outside the account that wrote it and names no audit event, so nothing in ` +
          'the trail says it changed.',
      );
    }

    if (concept.deepLink !== null && deepLinks !== null && !deepLinks.has(concept.deepLink)) {
      errors.push(
        `${where}: is addressed by deep link "${concept.deepLink}", which ${DEEP_LINK_PATH} does not target.`,
      );
    }
  }
}

export function checkSchemaHomes({ registry, repoRoot, errors }) {
  const exempt = new Map(
    (registry.schemaHomeExemptions ?? []).map((entry) => [entry.concept, entry]),
  );
  const used = new Set();

  for (const concept of registry.concepts) {
    const where = `${REGISTRY_PATH}#${concept.name}`;
    const named = [
      concept.schema,
      ...concept.projections,
      ...concept.providerCopies,
      ...concept.mutators,
    ];

    for (const relativePath of named) {
      if (relativePath.startsWith('docs/') || relativePath.endsWith('.md')) {
        errors.push(
          `${where}: names ${relativePath} as part of the object. A document is read by people and ` +
            'never by the running product, so it cannot be a source of runtime truth.',
        );
      }
    }

    if (!concept.schema.startsWith(SHARED_SCHEMA_ROOT)) {
      const entry = exempt.get(concept.name);
      if (entry === undefined) {
        errors.push(
          `${where}: its canonical schema lives at ${concept.schema}, outside ${SHARED_SCHEMA_ROOT}. ` +
            'Every other surface has to copy a type it cannot import.',
        );
      } else {
        used.add(concept.name);
        if (entry.schema !== concept.schema) {
          errors.push(
            `${where}: the recorded exemption points at ${entry.schema}, not ${concept.schema}.`,
          );
        }
        for (const field of ['why', 'fix']) {
          if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
            errors.push(
              `${REGISTRY_PATH}: schema-home exemption "${concept.name}" carries no ${field}.`,
            );
          }
        }
      }
    }

    const source = readSource(repoRoot, concept.schema);
    if (source === null) continue;
    for (const vendor of registry.vendorImports) {
      if (new RegExp(`from '${vendor.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`).test(source)) {
        errors.push(
          `${where}: ${concept.schema} imports ${vendor}, so the shape of this object is pinned to ` +
            'one vendor and cannot be read where that vendor is not installed.',
        );
      }
    }
  }

  for (const name of exempt.keys()) {
    if (used.has(name)) continue;
    errors.push(
      `${REGISTRY_PATH}: schema-home exemption "${name}" no longer matches a concept outside ` +
        `${SHARED_SCHEMA_ROOT}. Delete it; this list only shrinks.`,
    );
  }
}

export function checkTableDispositions({ registry, claimedTables, userOwnedTables, errors }) {
  const recorded = new Map();

  for (const entry of registry.tableDispositions) {
    const where = `${REGISTRY_PATH}#${entry.table}`;
    if (recorded.has(entry.table)) errors.push(`${where}: recorded twice.`);
    recorded.set(entry.table, entry);

    if (!TABLE_DISPOSITIONS.has(entry.disposition)) {
      errors.push(`${where}: unknown disposition "${entry.disposition}".`);
    }
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${where}: carries no reason.`);
    }
    if (!userOwnedTables.has(entry.table)) {
      errors.push(`${where}: is not a table a user owns. Delete it; this list only shrinks.`);
    }
    if (claimedTables.has(entry.table)) {
      errors.push(
        `${where}: is now owned by concept "${claimedTables.get(entry.table)}". Delete the disposition.`,
      );
    }
    if (entry.disposition === 'canonical-gap') {
      if (typeof entry.becomes !== 'string' || entry.becomes.length === 0) {
        errors.push(`${where}: is a gap and does not name the object it should become.`);
      }
      if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
        errors.push(`${where}: is a gap and names no change that would close it.`);
      }
      if (registry.concepts.some((concept) => concept.name === entry.becomes)) {
        errors.push(`${where}: names "${entry.becomes}", which is already a registered concept.`);
      }
    }
  }

  for (const table of [...userOwnedTables].sort()) {
    if (claimedTables.has(table) || recorded.has(table)) continue;
    errors.push(
      `${MIGRATIONS_DIR}: ${table} holds rows a user owns and belongs to no concept. Give it an ` +
        `owning concept, or record it in ${REGISTRY_PATH} under tableDispositions with the reason it ` +
        'is not a product object.',
    );
  }
}

export function checkUiState({ registry, inventory, claimedTables, errors }) {
  for (const rule of registry.uiStateColumns) {
    if (typeof rule.why !== 'string' || rule.why.trim().length === 0) {
      errors.push(`${REGISTRY_PATH}: view-state rule "${rule.match}" carries no reason.`);
      continue;
    }
    const matcher = new RegExp(rule.match);
    for (const [table, concept] of [...claimedTables].sort(([a], [b]) => a.localeCompare(b))) {
      for (const column of inventory.tables.get(table)?.columns ?? []) {
        if (!matcher.test(column)) continue;
        errors.push(
          `${MIGRATIONS_DIR}: ${table}.${column} stores view state on concept "${concept}". ${rule.why}`,
        );
      }
    }
  }
}

const FACET_KINDS = new Set([
  'column',
  'table',
  'contract',
  'permission',
  'policy-key',
  'route',
  'absent',
]);
const FACET_ID = /^[a-z][a-z0-9-]*$/;
const ROUTE_ROOT = 'apps/web/app/';

function exportsSymbol(source, symbol) {
  return new RegExp(`export\\s+(?:[a-z ]*\\s)?\\b${symbol}\\b`).test(source);
}

function interfaceFields(source, name) {
  const match = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source ?? '');
  if (match === null) return null;
  return new Set([...match[1].matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((f) => f[1]));
}

/** Every permission and role key the grid defines, expanded the way the source expands it. */
export function readPermissionKeys(source) {
  if (source === null) return null;
  const areas = arrayMembers(source, 'ADMIN_PERMISSION_AREAS');
  const features = arrayMembers(source, 'FEATURE_ORGANIZATION_PERMISSIONS');
  const roles = arrayMembers(source, 'BUILT_IN_ORGANIZATION_ROLE_KEYS');
  const legacy = unionMembers(source, 'LegacyOrganizationPermission');
  if (areas === null || features === null || roles === null || legacy === null) return null;
  const keys = new Set([...features, ...roles, ...legacy]);
  for (const area of areas) {
    keys.add(`admin.${area}.view`);
    keys.add(`admin.${area}.manage`);
  }
  return keys;
}

/** Every key the workspace policy contract resolves, including its two nested layers. */
export function readPolicyKeys(source) {
  if (source === null) return null;
  const controls = interfaceFields(source, 'WorkspaceControls');
  const features = arrayMembers(source, 'WORKSPACE_FEATURES');
  const code = arrayMembers(source, 'WORKSPACE_CODE_CONTROL_KEYS');
  if (controls === null || features === null || code === null) return null;
  const keys = new Set(controls);
  for (const feature of features) keys.add(`featureAccess.${feature}`);
  for (const control of code) keys.add(`code.${control}`);
  return keys;
}

function checkFacetSubjects({ concept, inventory, errors }) {
  const where = `${REGISTRY_PATH}#${concept.name}`;
  const subjects = new Map();
  for (const subject of concept.facetSubjects ?? []) {
    if (subjects.has(subject.name)) {
      errors.push(`${where}: facet subject "${subject.name}" is declared twice.`);
    }
    if (!concept.tables.includes(subject.table)) {
      errors.push(
        `${where}: facet subject "${subject.name}" names ${subject.table}, a table this concept ` +
          'does not own, so its facets would describe an object nothing here is responsible for.',
      );
    } else if (!inventory.tables.has(subject.table)) {
      errors.push(
        `${where}: facet subject "${subject.name}" names table ${subject.table}, which the final schema does not have.`,
      );
    }
    if (typeof subject.why !== 'string' || subject.why.trim().length === 0) {
      errors.push(`${where}: facet subject "${subject.name}" carries no reason.`);
    }
    subjects.set(subject.name, subject);
  }
  return subjects;
}

function checkFacetCitation({
  facet,
  concept,
  subjects,
  inventory,
  foreignKeys,
  keys,
  repoRoot,
  errors,
}) {
  const where = `${REGISTRY_PATH}#${concept.name}/${facet.id}`;
  const source = facet.source ?? {};
  const subjectTable = subjects.get(facet.subject)?.table;

  if (facet.kind === 'column') {
    if (!concept.tables.includes(source.table)) {
      errors.push(`${where}: cites ${source.table}, which this concept does not own.`);
      return;
    }
    const entry = inventory.tables.get(source.table);
    if (entry === undefined) {
      errors.push(`${where}: cites ${source.table}, which the final schema does not have.`);
    } else if (!entry.columns.has(source.column)) {
      errors.push(
        `${where}: claims ${source.table}.${source.column}, which no migration leaves in the final ` +
          'schema. Either the column went, or this facet was never true.',
      );
    }
    return;
  }

  if (facet.kind === 'table') {
    if (!concept.tables.includes(source.references)) {
      errors.push(`${where}: names parent ${source.references}, which this concept does not own.`);
      return;
    }
    if (!inventory.tables.has(source.table)) {
      errors.push(
        `${where}: names child table ${source.table}, which the final schema does not have.`,
      );
      return;
    }
    const parents = foreignKeys.get(source.table);
    const bound = parents !== undefined && [...parents.values()].includes(source.references);
    if (!bound) {
      errors.push(
        `${where}: holds ${source.table} to be a child of ${source.references} and no foreign key of ` +
          `${source.table} points at it, so nothing keeps the child with its parent.`,
      );
    }
    return;
  }

  if (facet.kind === 'contract') {
    const file = readSource(repoRoot, source.file);
    if (file === null) errors.push(`${where}: names ${source.file}, which does not exist.`);
    else if (!exportsSymbol(file, source.symbol)) {
      errors.push(`${where}: ${source.file} no longer exports ${source.symbol}.`);
    }
    return;
  }

  if (facet.kind === 'permission') {
    if (keys.permissions !== null && !keys.permissions.has(source.key)) {
      errors.push(
        `${where}: names permission or role key "${source.key}", which ${ORGANIZATION_PERMISSIONS_PATH} ` +
          'no longer defines.',
      );
    }
    return;
  }

  if (facet.kind === 'policy-key') {
    if (keys.policy !== null && !keys.policy.has(source.key)) {
      errors.push(
        `${where}: names policy key "${source.key}", which ${WORKSPACE_POLICY_PATH} no longer resolves.`,
      );
    }
    return;
  }

  if (facet.kind === 'route') {
    if (!concept.tables.includes(source.table)) {
      errors.push(`${where}: names ${source.table}, which this concept does not own.`);
    }
    if (!source.file?.startsWith(ROUTE_ROOT)) {
      errors.push(`${where}: names ${source.file}, which is not a route under ${ROUTE_ROOT}.`);
      return;
    }
    const file = readSource(repoRoot, source.file);
    if (file === null) errors.push(`${where}: names route ${source.file}, which does not exist.`);
    else if (!new RegExp(`\\b${source.table}\\b`).test(file)) {
      errors.push(
        `${where}: route ${source.file} no longer names ${source.table}, so the facet has no reader.`,
      );
    }
    return;
  }

  if (typeof source.instead !== 'string' || source.instead.trim().length === 0) {
    errors.push(
      `${where}: is recorded absent and names nothing that stands in for it. An absent facet without ` +
        'a substitute is a gap nobody can act on.',
    );
  }
  const absentTable = source.absentTable ?? subjectTable;
  const entry = inventory.tables.get(absentTable);
  if (source.absentColumn !== undefined && entry?.columns.has(source.absentColumn)) {
    errors.push(
      `${where}: is recorded absent and ${absentTable}.${source.absentColumn} now exists. Record it ` +
        'as a column facet and close the row it was opened for.',
    );
  }
  if (
    source.absentColumn === undefined &&
    source.absentTable !== undefined &&
    entry !== undefined
  ) {
    errors.push(
      `${where}: is recorded absent and table ${source.absentTable} now exists. Record it as a table ` +
        'facet and close the row it was opened for.',
    );
  }
}

export function checkFacets({ registry, inventory, foreignKeys, repoRoot, errors }) {
  const permissions = readPermissionKeys(readSource(repoRoot, ORGANIZATION_PERMISSIONS_PATH));
  const policy = readPolicyKeys(readSource(repoRoot, WORKSPACE_POLICY_PATH));
  if (permissions === null) {
    errors.push(
      `${ORGANIZATION_PERMISSIONS_PATH}: no permission vocabulary to resolve facets against.`,
    );
  }
  if (policy === null) {
    errors.push(
      `${WORKSPACE_POLICY_PATH}: no workspace policy contract to resolve facets against.`,
    );
  }

  const seen = new Map();
  let counted = 0;
  for (const concept of registry.concepts) {
    const facets = concept.facets ?? [];
    const subjects = checkFacetSubjects({ concept, inventory, errors });
    const where = `${REGISTRY_PATH}#${concept.name}`;
    if (facets.length === 0 && subjects.size > 0) {
      errors.push(`${where}: declares facet subjects and no facets.`);
    }

    for (const facet of facets) {
      counted += 1;
      const at = `${where}/${facet.id}`;
      if (!FACET_ID.test(facet.id ?? '')) {
        errors.push(`${where}: facet id "${facet.id}" is not a lower case slug.`);
      }
      const owner = seen.get(facet.id);
      if (owner !== undefined) {
        errors.push(`${at}: facet id is already used by concept "${owner}".`);
      }
      seen.set(facet.id, concept.name);
      if (typeof facet.claim !== 'string' || facet.claim.trim().length < 10) {
        errors.push(`${at}: carries no claim a reader could check.`);
      }
      if (!FACET_KINDS.has(facet.kind)) {
        errors.push(`${at}: unknown facet kind "${facet.kind}".`);
        continue;
      }
      if (!subjects.has(facet.subject)) {
        errors.push(
          `${at}: names subject "${facet.subject}", which this concept does not declare.`,
        );
        continue;
      }
      checkFacetCitation({
        facet,
        concept,
        subjects,
        inventory,
        foreignKeys,
        keys: { permissions, policy },
        repoRoot,
        errors,
      });
    }

    for (const name of subjects.keys()) {
      if (facets.some((facet) => facet.subject === name)) continue;
      errors.push(
        `${where}: facet subject "${name}" has no facets. Delete it, or inventory the object.`,
      );
    }
  }

  return counted;
}

function checkVocabularyBinding(registry, repoRoot, errors) {
  const source = readSource(repoRoot, REGISTRY_TYPES_PATH);
  if (source === null) {
    errors.push(`${REGISTRY_TYPES_PATH} is missing; product code has no typed concept vocabulary.`);
    return;
  }
  const block = /export const CONCEPT_NAMES = \[([\s\S]*?)\] as const;/.exec(source);
  if (block === null) {
    errors.push(`${REGISTRY_TYPES_PATH}: no CONCEPT_NAMES array for the registry to bind to.`);
    return;
  }
  const named = new Set([...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));

  for (const concept of registry.concepts) {
    if (!named.has(concept.name)) {
      errors.push(
        `${REGISTRY_TYPES_PATH}: CONCEPT_NAMES omits "${concept.name}". The registry and the type ` +
          `product code consumes must name the same concepts.`,
      );
    }
  }
  for (const name of named) {
    if (!registry.concepts.some((concept) => concept.name === name)) {
      errors.push(
        `${REGISTRY_TYPES_PATH}: names concept "${name}", which ${REGISTRY_PATH} does not define.`,
      );
    }
  }
}

export function checkConceptRegistry(repoRoot = REPO_ROOT) {
  const errors = [];
  const registry = loadRegistry(repoRoot);
  const migrations = migrationFiles(repoRoot);
  const inventory = readSchemaInventory(migrations);
  const files = repositoryFiles(repoRoot);
  const vocabularies = readVocabularies(repoRoot, files);

  checkVocabularyBinding(registry, repoRoot, errors);
  const duplicates = checkDuplicates(registry, vocabularies, errors);
  const { claimedTables, computed } = checkConcepts({
    registry,
    inventory,
    files,
    repoRoot,
    errors,
  });
  checkNewTableColumns({ registry, inventory, claimedTables, errors });

  const primaryKeys = readPrimaryKeyColumns(migrations);
  const literals = productionStringLiterals(repoRoot, files);
  checkAliases({ registry, repoRoot, errors });
  checkDesignations({ registry, inventory, primaryKeys, repoRoot, literals, errors });
  checkSchemaHomes({ registry, repoRoot, errors });
  checkTableDispositions({ registry, claimedTables, userOwnedTables: USER_OWNED_TABLES, errors });
  checkUiState({ registry, inventory, claimedTables, errors });
  const foreignKeys = readForeignKeys(migrations);
  const facets = checkFacets({ registry, inventory, foreignKeys, repoRoot, errors });

  return {
    errors,
    report: {
      generatedFrom: {
        migrations: migrations.length,
        tables: inventory.tables.size,
        vocabularies: vocabularies.size,
        userOwnedTables: USER_OWNED_TABLES.size,
        facets,
      },
      columnContract: registry.columnContract,
      concepts: computed,
      duplicateVocabularies: [...duplicates.values()],
      tableDispositions: registry.tableDispositions,
      canonicalGaps: registry.tableDispositions.filter(
        (entry) => entry.disposition === 'canonical-gap',
      ),
    },
  };
}

function main() {
  const { errors, report } = checkConceptRegistry(REPO_ROOT);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    if (errors.length === 0) return;
  }

  if (errors.length > 0) {
    console.error('Concept registry check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-concept-registry: OK (${report.concepts.length} concepts, ` +
      `${report.concepts.reduce((total, concept) => total + concept.tables.length, 0)} tables, ` +
      `${report.generatedFrom.facets} facets re-derived, ` +
      `${report.generatedFrom.userOwnedTables} user-owned tables accounted for, ` +
      `${report.canonicalGaps.length} recorded canonical gap(s), ` +
      `${report.duplicateVocabularies.length} registered duplicate vocabular(ies))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
