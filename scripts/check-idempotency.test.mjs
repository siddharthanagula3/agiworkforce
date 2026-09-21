import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  IDEMPOTENT_OPERATIONS,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkIdempotency,
  findDeduplicatedTables,
  readUniqueKeys,
} from './check-idempotency.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const MIGRATION = `
create table charges (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  amount integer not null
);
`;

const FENCE = 'export const sql = `insert into charges ... on conflict do nothing`;';

function contract(overrides = {}) {
  const operations = {};
  for (const name of IDEMPOTENT_OPERATIONS) {
    operations[name] = {
      why: `running ${name} twice does the work twice`,
      enforcedBy: 'apps/web/lib/fence.ts',
      tables: [],
    };
  }
  operations.billing.tables = ['charges'];
  return {
    keyColumnMatch: '(idempotency_key|dedupe_key)',
    enforcementMatch: 'idempoten|on conflict',
    operations,
    advisoryKeys: [],
    ...overrides,
  };
}

function fixture(overrides = {}, files = {}, migration = MIGRATION) {
  const root = mkdtempSync(path.join(tmpdir(), 'idempotency-'));
  roots.push(root);
  write(root, `${MIGRATIONS_DIR}/0001_charges.sql`, migration);
  write(root, CONTRACT_PATH, JSON.stringify(contract(overrides)));
  write(root, 'apps/web/lib/fence.ts', FENCE);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors } = checkIdempotency(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test('a clean fixture passes', () => {
  assert.deepEqual(checkIdempotency(fixture()).errors, []);
});

test('an operation that declares nothing fails', () => {
  const operations = contract().operations;
  delete operations.webhooks;
  const { errors } = checkIdempotency(fixture({ operations }));
  assert.ok(
    errors.some((error) => error.includes('"webhooks" is an operation that must run at most once')),
    errors.join('\n'),
  );
});

test('a fence that claims no key fails', () => {
  const { errors } = checkIdempotency(
    fixture(
      {},
      { 'apps/web/lib/fence.ts': 'export const sql = `insert into charges values ($1)`;' },
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('claims no key')),
    errors.join('\n'),
  );
});

test('a deduplication key with no unique constraint fails', () => {
  const { errors } = checkIdempotency(
    fixture(
      {},
      {},
      'create table charges (\n  id uuid primary key default gen_random_uuid(),\n  idempotency_key text not null,\n  amount integer not null\n);\n',
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('is a deduplication key with no unique constraint')),
    errors.join('\n'),
  );
});

test('a composite primary key over the deduplication key counts as unique', () => {
  const { errors } = checkIdempotency(
    fixture(
      {},
      {},
      'create table charges (\n  organization_id uuid not null,\n  idempotency_key text not null,\n  amount integer not null,\n  primary key (organization_id, idempotency_key)\n);\n',
    ),
  );
  assert.deepEqual(errors, []);
});

test('a deduplicated table no operation claims fails', () => {
  const { errors } = checkIdempotency(
    fixture(
      {},
      {},
      `${MIGRATION}\ncreate table alerts (\n  id uuid primary key default gen_random_uuid(),\n  dedupe_key text not null unique\n);\n`,
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('alerts carries dedupe_key and no operation claims it')),
    errors.join('\n'),
  );
});

test('an operation that claims a table with no deduplication key fails', () => {
  const operations = contract().operations;
  operations.webhooks.tables = ['charges'];
  operations.billing.tables = [];
  const clean = checkIdempotency(fixture({ operations }));
  assert.deepEqual(clean.errors, []);

  const operations2 = contract().operations;
  operations2.webhooks.tables = ['plain'];
  const { errors } = checkIdempotency(
    fixture(
      { operations: operations2 },
      {},
      `${MIGRATION}\ncreate table plain (\n  id uuid primary key default gen_random_uuid()\n);\n`,
    ),
  );
  assert.ok(
    errors.some((error) => error.includes('carries no deduplication key')),
    errors.join('\n'),
  );
});

test('an advisory key needs a reason and goes when the key becomes unique', () => {
  const loose =
    'create table charges (\n  id uuid primary key default gen_random_uuid(),\n  idempotency_key text not null,\n  amount integer not null\n);\n';
  assert.deepEqual(
    checkIdempotency(
      fixture({ advisoryKeys: [{ table: 'charges', why: 'the writer serialises' }] }, {}, loose),
    ).errors,
    [],
  );
  const stale = checkIdempotency(fixture({ advisoryKeys: [{ table: 'charges', why: '' }] }));
  assert.ok(
    stale.errors.some((error) => error.includes('carries no reason')),
    stale.errors.join('\n'),
  );
  assert.ok(
    stale.errors.some((error) => error.includes('the key is now unique')),
    stale.errors.join('\n'),
  );
});

test('the unique keys and the deduplicated tables are read from the migrations', () => {
  const root = fixture();
  const unique = readUniqueKeys(root);
  assert.deepEqual(unique.get('charges'), [['idempotency_key']]);
  const found = findDeduplicatedTables({
    tables: new Map([['charges', new Set(['id', 'idempotency_key'])]]),
    contract: contract(),
  });
  assert.deepEqual([...found.keys()], ['charges']);
});
