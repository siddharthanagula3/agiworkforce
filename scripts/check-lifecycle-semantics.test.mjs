import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  MIGRATIONS_DIR,
  READ_CLASSES,
  SEMANTICS_MODULE,
  checkLifecycleSemantics,
  findMarkedTables,
  findShareSurfaces,
  findUnfilteredReads,
} from './check-lifecycle-semantics.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const MIGRATION = `
create table web_conversations (
  id uuid primary key,
  user_id text not null,
  deleted_at timestamptz
);
create table published_artifacts (
  id uuid primary key,
  conversation_id uuid references public.web_conversations(id) on delete cascade,
  visibility text not null
);
`;

const RESTORE = `update web_conversations set deleted_at = null where id = $1`;
const PURGE = `delete from web_conversations where deleted_at < now() - interval '30 days'`;
const REVOKE = `update published_artifacts set visibility = 'private' where conversation_id = $1`;

function contract(overrides = {}) {
  return {
    markerColumns: { softDeleted: ['deleted_at'], archived: ['archived_at'] },
    archiveFacets: ['listed', 'searchable', 'aiRetrievable', 'retentionClockRunning', 'restorable'],
    sharingOutcomes: ['revoked', 'preserved', 'narrowed'],
    predicateHelpers: [],
    resources: {
      web_conversations: {
        concept: 'conversation',
        softDeleted: {
          column: 'deleted_at',
          purgedBy: 'apps/web/lib/purge.ts',
          restoredBy: 'apps/web/lib/restore.ts',
          sharing: {
            outcome: 'revoked',
            surfaces: ['published_artifacts'],
            revokedBy: 'apps/web/lib/revoke.ts',
          },
        },
      },
    },
    recoveryGaps: [],
    readExemptions: [],
    ...overrides,
  };
}

function fixture(overrides = {}, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'lifecycle-semantics-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, `${MIGRATIONS_DIR}/0001_chat.sql`, MIGRATION);
  write(root, CONTRACT_PATH, JSON.stringify(contract(overrides)));
  write(
    root,
    SEMANTICS_MODULE,
    `export const RESOURCE_LIFECYCLE_SEMANTICS = {
  active: { listed: true, searchable: true, aiRetrievable: true, retentionClockRunning: true, restorable: false },
  archived: { listed: false, searchable: false, aiRetrievable: false, retentionClockRunning: true, restorable: true },
};`,
  );
  write(root, 'apps/web/lib/restore.ts', `export const sql = \`${RESTORE}\`;`);
  write(root, 'apps/web/lib/purge.ts', `export const sql = \`${PURGE}\`;`);
  write(root, 'apps/web/lib/revoke.ts', `export const sql = \`${REVOKE}\`;`);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a clean fixture passes', () => {
  const { errors, unrecorded } = checkLifecycleSemantics(fixture());
  assert.deepEqual(errors, []);
  assert.deepEqual(unrecorded, []);
});

test('a withdrawable table nobody declared fails', () => {
  const root = fixture({ resources: {} });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('declares no')),
    errors.join('\n'),
  );
});

test('a declared marker column the migrations do not carry fails', () => {
  const root = fixture({
    resources: {
      web_conversations: {
        concept: 'conversation',
        softDeleted: { column: 'removed_at', purgedBy: null, restoredBy: null },
      },
    },
  });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('migrations give it deleted_at')),
    errors.join('\n'),
  );
});

test('a soft delete nobody can undo fails until it is recorded', () => {
  const withoutRestore = contract().resources.web_conversations;
  const root = fixture({
    resources: {
      web_conversations: {
        ...withoutRestore,
        softDeleted: { ...withoutRestore.softDeleted, restoredBy: null },
      },
    },
  });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('names nothing that puts it back')),
    errors.join('\n'),
  );
});

test('a soft delete nothing purges fails until it is recorded', () => {
  const base = contract().resources.web_conversations;
  const root = fixture({
    resources: {
      web_conversations: { ...base, softDeleted: { ...base.softDeleted, purgedBy: null } },
    },
  });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('nothing purges it')),
    errors.join('\n'),
  );
});

test('a recovery gap with no fix fails, and a stale one fails too', () => {
  const base = contract().resources.web_conversations;
  const root = fixture({
    resources: {
      web_conversations: { ...base, softDeleted: { ...base.softDeleted, purgedBy: null } },
    },
    recoveryGaps: [
      { table: 'web_conversations', facet: 'softDeleted.purge', why: 'no sweep yet', fix: '' },
      { table: 'web_conversations', facet: 'archived.restore', why: 'x', fix: 'y' },
    ],
  });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('does not say what would close it')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('no longer describes a real gap')),
    errors.join('\n'),
  );
});

test('a named restore site that never writes the marker fails', () => {
  const root = fixture({}, { 'apps/web/lib/restore.ts': 'export const sql = `select 1`;' });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('never writes deleted_at')),
    errors.join('\n'),
  );
});

test('a named purge site that never deletes the table fails', () => {
  const root = fixture({}, { 'apps/web/lib/purge.ts': 'export const sql = `select deleted_at`;' });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('never deletes from it')),
    errors.join('\n'),
  );
});

test('a share surface the resource does not name fails', () => {
  const base = contract().resources.web_conversations;
  const root = fixture({
    resources: {
      web_conversations: {
        ...base,
        softDeleted: {
          ...base.softDeleted,
          sharing: { outcome: 'revoked', surfaces: [], revokedBy: 'apps/web/lib/revoke.ts' },
        },
      },
    },
  });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('which its softDeleted')),
    errors.join('\n'),
  );
});

test('claiming revocation without a site that touches the share surface fails', () => {
  const root = fixture({}, { 'apps/web/lib/revoke.ts': 'export const sql = `select 1`;' });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('mentions none of')),
    errors.join('\n'),
  );
});

test('an unfiltered production read fails', () => {
  const root = fixture(
    {},
    {
      'apps/web/lib/services/thread.ts':
        'export const sql = `select id from web_conversations where user_id = $1`;',
    },
  );
  const { unrecorded } = checkLifecycleSemantics(root);
  assert.deepEqual(
    unrecorded.map((read) => `${read.file}#${read.table}`),
    ['apps/web/lib/services/thread.ts#web_conversations'],
  );
});

test('a filtered production read passes, and a comment does not count as one', () => {
  const root = fixture(
    {},
    {
      'apps/web/lib/services/thread.ts':
        'export const sql = `select id from web_conversations where deleted_at is null`;',
      'apps/web/lib/services/doc.ts':
        '// reads from web_conversations one day\nexport const x = 1;',
    },
  );
  const { unrecorded, errors } = checkLifecycleSemantics(root);
  assert.deepEqual(unrecorded, []);
  assert.deepEqual(errors, []);
});

test('a declared predicate helper stands in for the marker', () => {
  const root = fixture(
    {
      predicateHelpers: [
        {
          symbol: 'activePredicate',
          module: 'apps/web/lib/p.ts',
          resources: ['web_conversations'],
        },
      ],
    },
    {
      'apps/web/lib/services/thread.ts':
        'export const sql = `select id from web_conversations where ${activePredicate()}`;',
    },
  );
  const { unrecorded } = checkLifecycleSemantics(root);
  assert.deepEqual(unrecorded, []);
});

test('a recorded read needs a known class, a reason, and a fix when it is a defect', () => {
  const root = fixture(
    {
      readExemptions: [
        {
          file: 'apps/web/lib/services/thread.ts',
          table: 'web_conversations',
          class: 'wishful',
          why: '',
        },
        {
          file: 'apps/web/lib/services/gone.ts',
          table: 'web_conversations',
          class: 'defect',
          why: 'x',
        },
      ],
    },
    {
      'apps/web/lib/services/thread.ts':
        'export const sql = `select id from web_conversations where user_id = $1`;',
    },
  );
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes(`which is not one of ${READ_CLASSES.join(', ')}`)),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('carries no reason')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('does not name its fix')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('no longer reads withdrawn rows')),
    errors.join('\n'),
  );
});

test('an archive the shared contract calls searchable fails', () => {
  const root = fixture();
  write(
    root,
    SEMANTICS_MODULE,
    `export const RESOURCE_LIFECYCLE_SEMANTICS = {
  archived: { listed: false, searchable: true, aiRetrievable: true, retentionClockRunning: true, restorable: true },
};`,
  );
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('searchable or retrievable')),
    errors.join('\n'),
  );
});

test('the markers, the share surfaces and the reads are derived, not listed', () => {
  const root = fixture();
  const tables = new Map([
    ['web_conversations', new Set(['id', 'deleted_at'])],
    ['published_artifacts', new Set(['id', 'conversation_id', 'visibility'])],
  ]);
  const marked = findMarkedTables({ tables, contract: contract() });
  assert.deepEqual([...marked.keys()], ['web_conversations']);

  const surfaces = findShareSurfaces({
    tables,
    foreignKeys: [{ child: 'published_artifacts', parent: 'web_conversations' }],
  });
  assert.deepEqual([...(surfaces.get('web_conversations') ?? [])], ['published_artifacts']);

  write(
    root,
    'apps/web/lib/services/thread.ts',
    'export const sql = `select id from web_conversations`;',
  );
  const reads = findUnfilteredReads({
    repoRoot: root,
    files: ['apps/web/lib/services/thread.ts'],
    contract: contract(),
    marked,
  });
  assert.deepEqual(reads, [
    { file: 'apps/web/lib/services/thread.ts', table: 'web_conversations', marker: 'deleted_at' },
  ]);
});

const STORE_MIGRATION = `
create table retrieval_documents (
  id uuid primary key,
  user_id text not null,
  created_at timestamptz not null
);
create table retrieval_chunks (
  id uuid primary key,
  document_id uuid not null references public.retrieval_documents(id) on delete cascade,
  embedding vector(1536),
  created_at timestamptz not null
);
create table security_audit_logs (
  id uuid primary key,
  user_id text not null,
  created_at timestamptz not null
);
`;

function storeFixture(stores, files = {}) {
  const root = fixture(
    {
      hardDeleteStores: stores,
      hardDeleteExclusions: [],
    },
    files,
  );
  write(root, `${MIGRATIONS_DIR}/0002_stores.sql`, STORE_MIGRATION);
  return root;
}

const ERASURE = `export const sql = \`delete from retrieval_documents where user_id = $1\`;`;

test('a derived store nothing erases fails, and a cascade from an erased root passes', () => {
  const reached = storeFixture(
    {
      'derived-index': {
        why: 'a copy made searchable',
        namePattern: '(_index|retrieval_documents)$',
        clearedBy: ['apps/web/lib/erase.ts'],
      },
      embeddings: {
        why: 'the resource in a form a model can recall',
        columnPattern: 'embedding',
        clearedBy: ['apps/web/lib/erase.ts'],
      },
    },
    { 'apps/web/lib/erase.ts': ERASURE },
  );
  assert.deepEqual(checkLifecycleSemantics(reached).errors, []);

  const orphaned = storeFixture(
    {
      embeddings: {
        why: 'the resource in a form a model can recall',
        columnPattern: 'embedding',
        clearedBy: ['apps/web/lib/erase.ts'],
      },
    },
    { 'apps/web/lib/erase.ts': 'export const sql = `select 1`;' },
  );
  const { errors } = checkLifecycleSemantics(orphaned);
  assert.ok(
    errors.some((error) => error.includes('retrieval_chunks belongs to the "embeddings" store')),
    errors.join('\n'),
  );
});

test('a store pattern that matches nothing fails', () => {
  const root = storeFixture({
    caches: { why: 'a cached body outlives its row', namePattern: '_cache$', clearedBy: [] },
  });
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('matches no table')),
    errors.join('\n'),
  );
});

test('a retained store that erasure deletes fails', () => {
  const root = storeFixture(
    {
      'audit-trail': {
        why: 'the record that something happened',
        namePattern: '(audit_logs|audit_events)$',
        retained: true,
        clearedBy: ['apps/web/lib/erase.ts'],
      },
    },
    {
      'apps/web/lib/erase.ts':
        'export const sql = `delete from security_audit_logs where id = $1`;',
    },
  );
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('is retained by "audit-trail"')),
    errors.join('\n'),
  );
});

test('a hard-delete exclusion needs a reason and goes when erasure reaches the table', () => {
  const root = storeFixture(
    {
      embeddings: {
        why: 'the resource in a form a model can recall',
        columnPattern: 'embedding',
        clearedBy: ['apps/web/lib/erase.ts'],
      },
    },
    { 'apps/web/lib/erase.ts': ERASURE },
  );
  write(
    root,
    CONTRACT_PATH,
    JSON.stringify({
      ...JSON.parse(readFileSync(path.join(root, CONTRACT_PATH), 'utf8')),
      hardDeleteExclusions: [{ table: 'retrieval_chunks', store: 'embeddings', why: '' }],
    }),
  );
  const { errors } = checkLifecycleSemantics(root);
  assert.ok(
    errors.some((error) => error.includes('is now reached by erasure')),
    errors.join('\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('carries no reason')),
    errors.join('\n'),
  );
});
