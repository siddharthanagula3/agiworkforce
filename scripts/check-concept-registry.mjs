#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { USER_OWNED_TABLES } from './lib/db-isolation-tables.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const REGISTRY_PATH = 'packages/contracts/types/src/concept-registry.json';
export const REGISTRY_TYPES_PATH = 'packages/contracts/types/src/concept-registry.ts';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const VOCABULARY_ROOT = 'packages/contracts/types/src';
export const MUTATOR_ROOTS = Object.freeze(['apps/web/app', 'apps/web/lib', 'apps/web/features']);

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
]);

/**
 * Table -> { columns, createdIn }, read from the migration history rather than a
 * declared list, so a table renamed or a column added elsewhere cannot go stale.
 */
export function readSchemaInventory(migrations) {
  const tables = new Map();
  const functions = new Set();
  const ensure = (table) => {
    if (!tables.has(table)) tables.set(table, { columns: new Set(), createdIn: null });
    return tables.get(table);
  };

  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      const entry = ensure(match[1]);
      if (entry.createdIn === null) entry.createdIn = migration.ordinal;
      let depth = 0;
      for (const line of match[2].split('\n')) {
        const trimmed = line.trim();
        const column = COLUMN_LINE.exec(trimmed);
        if (depth === 0 && column && !NON_COLUMN_LEADERS.has(column[1])) {
          entry.columns.add(column[1]);
        }
        depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
      }
    }

    for (const match of migration.sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/g,
    )) {
      const entry = ensure(match[1]);
      for (const column of match[2].matchAll(
        /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/g,
      )) {
        entry.columns.add(column[1]);
      }
    }

    for (const match of migration.sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/g,
    )) {
      functions.add(match[1]);
    }
  }

  return { tables, functions };
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

const UNION_DECLARATION =
  /export\s+type\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*((?:\s*\|?\s*'[^']+')+)\s*;/g;
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

    UNION_DECLARATION.lastIndex = 0;
    let union;
    while ((union = UNION_DECLARATION.exec(source)) !== null) {
      unionNames.add(union[1]);
      if (derived.has(union[1])) continue;
      const members = [...union[2].matchAll(STRING_LITERAL)].map((literal) => literal[1]);
      if (members.length < DUPLICATE_SHARED_MEMBER_FLOOR) continue;
      vocabularies.set(`${relativePath}#${union[1]}`, {
        file: relativePath,
        name: union[1],
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

  return {
    errors,
    report: {
      generatedFrom: {
        migrations: migrations.length,
        tables: inventory.tables.size,
        vocabularies: vocabularies.size,
      },
      columnContract: registry.columnContract,
      concepts: computed,
      duplicateVocabularies: [...duplicates.values()],
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
      `${report.duplicateVocabularies.length} registered duplicate vocabular(ies))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
