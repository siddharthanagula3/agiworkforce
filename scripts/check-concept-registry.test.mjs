import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AUDIT_VOCABULARY_PATH,
  DEEP_LINK_PATH,
  RETENTION_VOCABULARY_PATH,
  checkAliases,
  checkConceptRegistry,
  checkDesignations,
  checkSchemaHomes,
  checkTableDispositions,
  checkUiState,
  findDuplicateVocabularies,
  loadRegistry,
  missingContractColumns,
  readSchemaInventory,
  readVocabularies,
} from './check-concept-registry.mjs';

function fixtureRoot(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'concept-registry-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return root;
}

const VOCABULARY_DIR = 'packages/contracts/types/src';

test('an unregistered duplicate vocabulary is flagged', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/first.ts`]:
      "export type ProbeStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n",
    [`${VOCABULARY_DIR}/second.ts`]:
      "export type ProbeRunState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n",
  });

  const duplicates = findDuplicateVocabularies(
    readVocabularies(root, [`${VOCABULARY_DIR}/first.ts`, `${VOCABULARY_DIR}/second.ts`]),
  );

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].shared, 5);
  assert.deepEqual([duplicates[0].left.name, duplicates[0].right.name].sort(), [
    'ProbeRunState',
    'ProbeStatus',
  ]);
});

test('a union derived from its const array is one vocabulary, not two', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/derived.ts`]:
      "export const PROBE_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;\n" +
      'export type ProbeStatus = (typeof PROBE_STATUSES)[number];\n',
  });

  const vocabularies = readVocabularies(root, [`${VOCABULARY_DIR}/derived.ts`]);

  assert.equal(vocabularies.size, 1);
  assert.deepEqual(findDuplicateVocabularies(vocabularies), []);
});

test('a const array typed by a union in the same file is that union', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/annotated.ts`]:
      "export type ProbeStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n" +
      'export const PROBE_STATUSES: readonly ProbeStatus[] = [\n' +
      "  'queued', 'running', 'done', 'failed', 'cancelled',\n" +
      '] as const;\n',
  });

  assert.equal(readVocabularies(root, [`${VOCABULARY_DIR}/annotated.ts`]).size, 1);
});

test('vocabularies below the member floor are not compared', () => {
  const root = fixtureRoot({
    [`${VOCABULARY_DIR}/small-a.ts`]: "export type ProbeA = 'one' | 'two' | 'three';\n",
    [`${VOCABULARY_DIR}/small-b.ts`]: "export type ProbeB = 'one' | 'two' | 'three';\n",
  });

  assert.deepEqual(
    findDuplicateVocabularies(
      readVocabularies(root, [`${VOCABULARY_DIR}/small-a.ts`, `${VOCABULARY_DIR}/small-b.ts`]),
    ),
    [],
  );
});

test('the schema inventory reads columns from create and alter statements', () => {
  const inventory = readSchemaInventory([
    {
      name: '0100_probe.sql',
      ordinal: 100,
      sql: 'create table if not exists public.probe (\n  id uuid primary key,\n  user_id text not null\n);',
    },
    {
      name: '0101_probe_columns.sql',
      ordinal: 101,
      sql: 'alter table public.probe add column if not exists created_by text;',
    },
  ]);

  const probe = inventory.tables.get('probe');
  assert.equal(probe.createdIn, 100);
  assert.deepEqual([...probe.columns].sort(), ['created_by', 'id', 'user_id']);
});

test('the shipped registry keeps every duplicate pair dated', () => {
  const registry = loadRegistry();
  assert.ok(registry.duplicateVocabularies.length > 0);
  for (const entry of registry.duplicateVocabularies) {
    assert.match(entry.migrateBy, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.why.length > 20);
  }
});

test('the shipped column contract names a column for every required role', () => {
  const { roles } = loadRegistry().columnContract;
  assert.deepEqual(missingContractColumns({ columns: new Set(), roles }).sort(), [
    'createdAt',
    'createdBy',
    'owner',
    'updatedAt',
    'version',
  ]);
  for (const role of ['owner', 'createdAt', 'updatedAt', 'createdBy', 'version']) {
    assert.equal(typeof roles[role].column, 'string');
    assert.ok(roles[role].why.length > 10);
  }
});

test('parses leading union separators and rejects long incomplete declarations', () => {
  const file = `${VOCABULARY_DIR}/unions.ts`;
  const root = fixtureRoot({
    [file]:
      "export type Valid = | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';\n" +
      'export type Incomplete = ' +
      " '&'".repeat(10_000),
  });
  const vocabularies = readVocabularies(root, [file]);
  assert.deepEqual(
    [...vocabularies.values()].map((v) => v.name),
    ['Valid'],
  );
});

const AUDIT_FIXTURE = "export type AuditEventType =\n  | 'probe_created'\n  | 'probe_revoked';\n";
const RETENTION_FIXTURE =
  "export const AUDIT_RETENTION_CLASSES = ['operational', 'security', 'compliance'] as const;\n";
const DEEP_LINK_FIXTURE = "export const PRODUCT_LINK_TARGETS = ['file', 'artifact'] as const;\n";

const CLEAN_CONCEPT = {
  name: 'probe',
  label: 'Probe',
  schema: 'packages/contracts/types/src/probe.ts',
  symbol: 'Probe',
  aliases: [],
  tables: ['probes'],
  identity: 'id',
  writeFunctions: [],
  mutators: [],
  projections: [],
  providerCopies: [],
  ownership: 'user',
  access: 'owner-only',
  sync: 'server-authoritative',
  storage: 'cloud',
  versioning: 'updated-at',
  lifecycle: 'active',
  childDisposition: 'retain',
  retention: { kind: 'until-deleted' },
  classification: ['user-content'],
  auditBoundary: 'user',
  events: [],
  deepLink: null,
  columns: { owner: 'user_id', createdAt: 'created_at', updatedAt: 'updated_at' },
};

function designationRoot(extra = {}) {
  return fixtureRoot({
    [AUDIT_VOCABULARY_PATH]: AUDIT_FIXTURE,
    [RETENTION_VOCABULARY_PATH]: RETENTION_FIXTURE,
    [DEEP_LINK_PATH]: DEEP_LINK_FIXTURE,
    'packages/contracts/types/src/probe.ts': 'export interface Probe { id: string }\n',
    ...extra,
  });
}

function designate(concept, { inventory, literals, primaryKeys, extraFiles } = {}) {
  const errors = [];
  checkDesignations({
    registry: { concepts: [{ ...CLEAN_CONCEPT, ...concept }] },
    inventory: inventory ?? { tables: new Map([['probes', { columns: new Set(['user_id']) }]]) },
    primaryKeys: primaryKeys ?? new Map([['probes', ['id']]]),
    repoRoot: designationRoot(extraFiles),
    literals: literals ?? new Set(['probe_created', 'probe_revoked']),
    errors,
  });
  return errors;
}

test('the real guard passes on the repository as it stands', () => {
  assert.deepEqual(checkConceptRegistry().errors, []);
});

test('a clean concept designation passes', () => {
  assert.deepEqual(designate({}), []);
});

test('an identity the migrations do not key the table by fails', () => {
  const errors = designate({ identity: 'slug' });
  assert.ok(
    errors.some((error) => error.includes('claims identity probes.slug')),
    errors.join('\n'),
  );
});

test('a table holding authenticating material must be classified as credential', () => {
  const errors = designate(
    {},
    { inventory: { tables: new Map([['probes', { columns: new Set(['user_id', 'key_hash']) }]]) } },
  );
  assert.ok(
    errors.some((error) => error.includes('probes.key_hash')),
    errors.join('\n'),
  );
});

test('a credential class nothing in the schema backs is rejected as over-wide', () => {
  const errors = designate({ classification: ['user-content', 'credential'] });
  assert.ok(
    errors.some((error) => error.includes('no column of it holds authenticating material')),
    errors.join('\n'),
  );
});

test('an owner-only concept that also carries a tenant column fails', () => {
  const errors = designate({
    columns: { ...CLEAN_CONCEPT.columns, tenant: 'organization_id' },
  });
  assert.ok(
    errors.some((error) => error.includes('declared owner-only and carries a tenant column')),
    errors.join('\n'),
  );
});

test('an object read outside its account and emitting nothing fails', () => {
  const errors = designate({
    auditBoundary: 'organization',
    columns: { ...CLEAN_CONCEPT.columns, tenant: 'organization_id' },
    access: 'tenant-role',
  });
  assert.ok(
    errors.some((error) => error.includes('names no audit event')),
    errors.join('\n'),
  );
});

test('an audit event no production module emits fails', () => {
  const errors = designate({ events: ['probe_created'] }, { literals: new Set() });
  assert.ok(
    errors.some((error) => error.includes('that no production module emits')),
    errors.join('\n'),
  );
});

test('an audit event the vocabulary does not define fails', () => {
  const errors = designate({ events: ['probe_exploded'] });
  assert.ok(
    errors.some((error) => error.includes('does not define')),
    errors.join('\n'),
  );
});

test('a sweep that never names the table it is claimed to clear fails', () => {
  const errors = designate(
    { retention: { kind: 'swept', purgedBy: 'apps/web/app/api/cron/sweep/route.ts' } },
    { extraFiles: { 'apps/web/app/api/cron/sweep/route.ts': 'export async function GET() {}\n' } },
  );
  assert.ok(
    errors.some((error) => error.includes('mentions none of probes')),
    errors.join('\n'),
  );
});

test('a device-only object that also has a table fails', () => {
  const errors = designate({ storage: 'device' });
  assert.ok(
    errors.some((error) => error.includes('declared device-only')),
    errors.join('\n'),
  );
});

test('a deep link the product does not target fails', () => {
  const errors = designate({ deepLink: 'probe' });
  assert.ok(
    errors.some((error) => error.includes('does not target')),
    errors.join('\n'),
  );
});

test('a canonical schema outside the shared packages fails without a recorded move', () => {
  const errors = [];
  checkSchemaHomes({
    registry: {
      concepts: [{ ...CLEAN_CONCEPT, schema: 'apps/web/lib/services/probe-service.ts' }],
      vendorImports: ['@clerk/'],
      schemaHomeExemptions: [],
    },
    repoRoot: designationRoot({
      'apps/web/lib/services/probe-service.ts': 'export interface Probe {}\n',
    }),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('outside packages/contracts/')),
    errors.join('\n'),
  );
});

test('a canonical schema that imports a vendor sdk fails', () => {
  const errors = [];
  checkSchemaHomes({
    registry: {
      concepts: [CLEAN_CONCEPT],
      vendorImports: ['@clerk/'],
      schemaHomeExemptions: [],
    },
    repoRoot: designationRoot({
      'packages/contracts/types/src/probe.ts':
        "import { auth } from '@clerk/nextjs';\nexport interface Probe { id: string }\n",
    }),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('imports @clerk/')),
    errors.join('\n'),
  );
});

test('a document named as part of an object fails', () => {
  const errors = [];
  checkSchemaHomes({
    registry: {
      concepts: [{ ...CLEAN_CONCEPT, projections: ['docs/architecture/probe.md'] }],
      vendorImports: [],
      schemaHomeExemptions: [],
    },
    repoRoot: designationRoot(),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('read by people and never by the running product')),
    errors.join('\n'),
  );
});

test('a user-owned table that belongs to no concept and no disposition fails', () => {
  const errors = [];
  checkTableDispositions({
    registry: { concepts: [], tableDispositions: [] },
    claimedTables: new Map(),
    userOwnedTables: new Set(['probes']),
    errors,
  });
  assert.ok(
    errors.some((error) =>
      error.includes('probes holds rows a user owns and belongs to no concept'),
    ),
    errors.join('\n'),
  );
});

test('a recorded gap that names no object and no fix fails', () => {
  const errors = [];
  checkTableDispositions({
    registry: {
      concepts: [],
      tableDispositions: [{ table: 'probes', disposition: 'canonical-gap', why: 'no shared type' }],
    },
    claimedTables: new Map(),
    userOwnedTables: new Set(['probes']),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('does not name the object it should become')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('names no change that would close it')),
    errors.join('\n'),
  );
});

test('a disposition for a table a concept now owns is stale and fails', () => {
  const errors = [];
  checkTableDispositions({
    registry: {
      concepts: [],
      tableDispositions: [{ table: 'probes', disposition: 'operational', why: 'a run record' }],
    },
    claimedTables: new Map([['probes', 'probe']]),
    userOwnedTables: new Set(['probes']),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('Delete the disposition')),
    errors.join('\n'),
  );
});

test('view state stored on a canonical object fails', () => {
  const errors = [];
  checkUiState({
    registry: {
      uiStateColumns: [{ match: '^(is_)?collapsed$', why: 'one browser tab, not the row.' }],
    },
    inventory: { tables: new Map([['probes', { columns: new Set(['id', 'is_collapsed']) }]]) },
    claimedTables: new Map([['probes', 'probe']]),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('probes.is_collapsed stores view state')),
    errors.join('\n'),
  );
});

test('an alias two concepts claim fails', () => {
  const errors = [];
  checkAliases({
    registry: {
      concepts: [
        { ...CLEAN_CONCEPT, aliases: ['sensor'] },
        { ...CLEAN_CONCEPT, name: 'gauge', aliases: ['sensor'] },
      ],
    },
    repoRoot: designationRoot({
      'packages/contracts/types/src/probe.ts': 'export interface Probe { sensor: string }\n',
    }),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('is already claimed by')),
    errors.join('\n'),
  );
});

test('an alias nothing in the object spells fails', () => {
  const errors = [];
  checkAliases({
    registry: { concepts: [{ ...CLEAN_CONCEPT, aliases: ['sensor'] }] },
    repoRoot: designationRoot(),
    errors,
  });
  assert.ok(
    errors.some((error) => error.includes('a name nothing uses')),
    errors.join('\n'),
  );
});
