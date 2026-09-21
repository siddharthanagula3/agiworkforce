import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AUDIT_VOCABULARY_PATH,
  DEEP_LINK_PATH,
  ORGANIZATION_PERMISSIONS_PATH,
  RETENTION_VOCABULARY_PATH,
  WORKSPACE_POLICY_PATH,
  checkAliases,
  checkConceptRegistry,
  checkDesignations,
  checkFacets,
  checkSchemaHomes,
  checkTableDispositions,
  checkUiState,
  findDuplicateVocabularies,
  loadRegistry,
  missingContractColumns,
  readForeignKeys,
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

const PERMISSIONS_FIXTURE =
  "export const ADMIN_PERMISSION_AREAS = ['members', 'roles'] as const;\n" +
  "export const FEATURE_ORGANIZATION_PERMISSIONS = ['feature.content.view'] as const;\n" +
  "export const BUILT_IN_ORGANIZATION_ROLE_KEYS = ['owner', 'admin'] as const;\n" +
  "export type LegacyOrganizationPermission = 'content.read' | 'members.manage';\n";

const POLICY_FIXTURE =
  "export const WORKSPACE_FEATURES = ['work', 'code'] as const;\n" +
  "export const WORKSPACE_CODE_CONTROL_KEYS = ['allowedHosts'] as const;\n" +
  'export interface WorkspaceControls {\n' +
  '  featureAccess: WorkspaceFeatureAccess;\n' +
  '  defaultModelId: string | null;\n' +
  '}\n';

const FACET_SUBJECTS = [{ name: 'probe', table: 'probes', why: 'the object under inventory' }];

function facetInventory(columns = ['id', 'user_id']) {
  return { tables: new Map([['probes', { createdIn: 1, columns: new Set(columns) }]]) };
}

function facetRun({ facets, inventory = facetInventory(), foreignKeys = new Map(), files = {} }) {
  const errors = [];
  const counted = checkFacets({
    registry: {
      concepts: [{ ...CLEAN_CONCEPT, facetSubjects: FACET_SUBJECTS, facets }],
    },
    inventory,
    foreignKeys,
    repoRoot: fixtureRoot({
      [ORGANIZATION_PERMISSIONS_PATH]: PERMISSIONS_FIXTURE,
      [WORKSPACE_POLICY_PATH]: POLICY_FIXTURE,
      ...files,
    }),
    errors,
  });
  return { errors, counted };
}

function facet(kind, source, extra = {}) {
  return {
    id: 'probe-facet',
    subject: 'probe',
    claim: 'the probe carries the thing this facet cites',
    kind,
    source,
    ...extra,
  };
}

test('a facet inventory that matches the tree raises nothing', () => {
  const { errors, counted } = facetRun({
    facets: [facet('column', { table: 'probes', column: 'user_id' })],
  });
  assert.deepEqual(errors, []);
  assert.equal(counted, 1);
});

test('a column facet fails when the column leaves the final schema', () => {
  const { errors } = facetRun({
    facets: [facet('column', { table: 'probes', column: 'retired_at' })],
    inventory: facetInventory(['id']),
  });
  assert.ok(
    errors.some((error) => error.includes('probes.retired_at')),
    errors.join('\n'),
  );
});

test('a table facet fails when the foreign key to the parent is gone', () => {
  const source = { table: 'probe_readings', references: 'probes' };
  const inventory = facetInventory();
  inventory.tables.set('probe_readings', { createdIn: 2, columns: new Set(['id']) });

  const bound = facetRun({
    facets: [facet('table', source)],
    inventory,
    foreignKeys: new Map([['probe_readings', new Map([['probe_id', 'probes']])]]),
  });
  assert.deepEqual(bound.errors, []);

  const orphaned = facetRun({
    facets: [facet('table', source)],
    inventory,
    foreignKeys: new Map([['probe_readings', new Map([['tenant_id', 'organizations']])]]),
  });
  assert.ok(
    orphaned.errors.some((error) => error.includes('nothing keeps the child with its parent')),
    orphaned.errors.join('\n'),
  );
});

test('a contract facet fails when the symbol stops being exported', () => {
  const file = 'packages/contracts/types/src/probe-contract.ts';
  const { errors } = facetRun({
    facets: [facet('contract', { file, symbol: 'PROBE_MODES' })],
    files: { [file]: 'const PROBE_MODES = [];\n' },
  });
  assert.ok(
    errors.some((error) => error.includes('no longer exports PROBE_MODES')),
    errors.join('\n'),
  );
});

test('a permission facet fails when the key leaves the grid', () => {
  const granted = facetRun({ facets: [facet('permission', { key: 'admin.roles.manage' })] });
  assert.deepEqual(granted.errors, []);

  const { errors } = facetRun({ facets: [facet('permission', { key: 'admin.billing.manage' })] });
  assert.ok(
    errors.some((error) => error.includes('admin.billing.manage')),
    errors.join('\n'),
  );
});

test('a policy-key facet fails when the key leaves the workspace policy contract', () => {
  const resolved = facetRun({ facets: [facet('policy-key', { key: 'featureAccess.code' })] });
  assert.deepEqual(resolved.errors, []);

  const { errors } = facetRun({ facets: [facet('policy-key', { key: 'featureAccess.voice' })] });
  assert.ok(
    errors.some((error) => error.includes('featureAccess.voice')),
    errors.join('\n'),
  );
});

test('a route facet fails when the route stops naming the table', () => {
  const file = 'apps/web/app/api/probes/route.ts';
  const reading = facetRun({
    facets: [facet('route', { file, table: 'probes' })],
    files: { [file]: "await db.query('select id from public.probes');\n" },
  });
  assert.deepEqual(reading.errors, []);

  const { errors } = facetRun({
    facets: [facet('route', { file, table: 'probes' })],
    files: { [file]: 'return listProbes();\n' },
  });
  assert.ok(
    errors.some((error) => error.includes('no longer names probes')),
    errors.join('\n'),
  );
});

test('a route facet outside the route tree is not a route', () => {
  const file = 'apps/web/lib/services/probe-service.ts';
  const { errors } = facetRun({
    facets: [facet('route', { file, table: 'probes' })],
    files: { [file]: 'public.probes\n' },
  });
  assert.ok(
    errors.some((error) => error.includes('is not a route under')),
    errors.join('\n'),
  );
});

test('an absent facet fails once the product grows the facet', () => {
  const missing = facetRun({
    facets: [
      facet('absent', { instead: 'the reading rows carry it', absentColumn: 'last_reading_at' }),
    ],
  });
  assert.deepEqual(missing.errors, []);

  const { errors } = facetRun({
    facets: [
      facet('absent', { instead: 'the reading rows carry it', absentColumn: 'last_reading_at' }),
    ],
    inventory: facetInventory(['id', 'user_id', 'last_reading_at']),
  });
  assert.ok(
    errors.some((error) => error.includes('Record it as a column facet')),
    errors.join('\n'),
  );
});

test('an absent facet with no substitute is a gap nobody can act on', () => {
  const { errors } = facetRun({ facets: [facet('absent', { instead: '  ' })] });
  assert.ok(
    errors.some((error) => error.includes('names nothing that stands in for it')),
    errors.join('\n'),
  );
});

test('a facet naming an undeclared subject or an unknown kind is refused', () => {
  const stray = facetRun({
    facets: [facet('column', { table: 'probes', column: 'id' }, { subject: 'sensor' })],
  });
  assert.ok(
    stray.errors.some((error) => error.includes('which this concept does not declare')),
    stray.errors.join('\n'),
  );

  const unknown = facetRun({ facets: [facet('presence', { table: 'probes' })] });
  assert.ok(
    unknown.errors.some((error) => error.includes('unknown facet kind')),
    unknown.errors.join('\n'),
  );
});

test('a facet citing a table the concept does not own is refused', () => {
  const { errors } = facetRun({
    facets: [facet('column', { table: 'organizations', column: 'id' })],
  });
  assert.ok(
    errors.some((error) => error.includes('which this concept does not own')),
    errors.join('\n'),
  );
});

test('the schema inventory drops what a later migration drops', () => {
  const inventory = readSchemaInventory([
    {
      name: '0100_probe.sql',
      ordinal: 100,
      sql:
        'create table if not exists public.probe (\n  id uuid primary key,\n  legacy_token text\n);\n' +
        'create table if not exists public.probe_legacy (\n  id uuid primary key\n);',
    },
    {
      name: '0101_probe_cleanup.sql',
      ordinal: 101,
      sql:
        'alter table public.probe drop column if exists legacy_token;\n' +
        'alter table public.probe rename column id to probe_id;\n' +
        'drop table if exists public.probe_legacy;',
    },
  ]);

  assert.equal(inventory.tables.has('probe_legacy'), false);
  assert.deepEqual([...inventory.tables.get('probe').columns].sort(), ['probe_id']);
});

test('a renamed table keeps its columns under the new name', () => {
  const inventory = readSchemaInventory([
    {
      name: '0100_probe.sql',
      ordinal: 100,
      sql: 'create table if not exists public.probe (\n  id uuid primary key\n);',
    },
    { name: '0101_rename.sql', ordinal: 101, sql: 'alter table public.probe rename to sensor;' },
  ]);

  assert.equal(inventory.tables.has('probe'), false);
  assert.deepEqual([...inventory.tables.get('sensor').columns], ['id']);
});

test('foreign keys come from inline, constraint and added-column references', () => {
  const keys = readForeignKeys([
    {
      name: '0100_probe.sql',
      ordinal: 100,
      sql:
        'create table if not exists public.probe_readings (\n' +
        '  id uuid primary key,\n' +
        '  probe_id uuid not null references public.probes(id) on delete cascade,\n' +
        '  foreign key (tenant_id) references public.organizations(id)\n' +
        ');',
    },
    {
      name: '0101_probe_owner.sql',
      ordinal: 101,
      sql: 'alter table public.probe_readings\n  add column if not exists workspace_id uuid references public.workspaces(id);',
    },
  ]);

  assert.deepEqual(
    [...keys.get('probe_readings')].sort(),
    [
      ['probe_id', 'probes'],
      ['tenant_id', 'organizations'],
      ['workspace_id', 'workspaces'],
    ].sort(),
  );
});

test('the shipped hierarchy inventory names every facet subject and dates every gap', () => {
  const concept = loadRegistry().concepts.find((entry) => entry.name === 'workspace');
  const subjects = new Set(concept.facetSubjects.map((entry) => entry.name));

  assert.deepEqual([...subjects].sort(), ['membership', 'organization', 'workspace']);
  for (const entry of concept.facets) {
    assert.ok(subjects.has(entry.subject), entry.id);
    assert.ok(entry.claim.length > 20, entry.id);
    if (entry.kind !== 'absent') continue;
    assert.ok(entry.source.instead.length > 20, entry.id);
  }
});
