import assert from 'node:assert/strict';
import test from 'node:test';

import { quotingErrors } from './check-neon-migrations.mjs';
import {
  loadRegistry,
  missingContractColumns,
  readSchemaInventory,
} from './check-concept-registry.mjs';

const path = 'apps/web/db/neon/0000_probe.sql';

function columnsOf(sql, table) {
  const inventory = readSchemaInventory([{ name: '0999_probe.sql', ordinal: 999, sql }]);
  return inventory.tables.get(table)?.columns ?? new Set();
}

test('a doubled apostrophe inside a literal is valid', () => {
  assert.deepEqual(quotingErrors(path, "insert into t values ('quarter''s numbers');"), []);
});

test('a bare apostrophe inside a literal is reported with its line', () => {
  const errors = quotingErrors(path, "insert into t values (\n  'quarter's numbers'\n);");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /:2 /);
  assert.match(errors[0], /never closed/);
});

test('dollar-quoted bodies may contain bare apostrophes', () => {
  const sql =
    "create function f() returns text as $$ select 'it''s'; select 'plain'; $$ language sql;";
  assert.deepEqual(quotingErrors(path, sql), []);
});

test('an unterminated dollar-quote is reported', () => {
  const errors = quotingErrors(path, 'create function f() as $body$ select 1;');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\$body\$/);
});

test('apostrophes inside line and block comments are ignored', () => {
  assert.deepEqual(quotingErrors(path, "-- the visitor's behalf\nselect 1;"), []);
  assert.deepEqual(quotingErrors(path, "/* the visitor's behalf */\nselect 1;"), []);
});

test('a doubled quote inside a quoted identifier is valid', () => {
  assert.deepEqual(quotingErrors(path, 'alter table "od""d" add column x int;'), []);
});

test('an unterminated block comment is reported', () => {
  const errors = quotingErrors(path, '/* never closed\nselect 1;');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /block comment/);
});

test('a new persistent-object table without the column contract is reported', () => {
  const { roles } = loadRegistry().columnContract;
  const columns = columnsOf(
    'create table if not exists public.probe_notes (\n' +
      '  id uuid primary key default gen_random_uuid(),\n' +
      '  body text not null\n' +
      ');',
    'probe_notes',
  );

  assert.deepEqual(missingContractColumns({ columns, roles }).sort(), [
    'createdAt',
    'createdBy',
    'owner',
    'updatedAt',
    'version',
  ]);
});

test('a new table carrying the column contract is accepted', () => {
  const { roles } = loadRegistry().columnContract;
  const columns = columnsOf(
    'create table if not exists public.probe_notes (\n' +
      '  id uuid primary key default gen_random_uuid(),\n' +
      '  user_id text not null,\n' +
      '  created_by text,\n' +
      '  server_version bigint not null,\n' +
      '  created_at timestamptz not null default now(),\n' +
      '  updated_at timestamptz not null default now()\n' +
      ');',
    'probe_notes',
  );

  assert.deepEqual(missingContractColumns({ columns, roles }), []);
});

test('an exempted role is not demanded of a new table', () => {
  const { roles } = loadRegistry().columnContract;
  const columns = columnsOf(
    'create table if not exists public.probe_events (\n' +
      '  id uuid primary key default gen_random_uuid(),\n' +
      '  user_id text not null,\n' +
      '  created_by text,\n' +
      '  created_at timestamptz not null default now()\n' +
      ');',
    'probe_events',
  );

  assert.deepEqual(
    missingContractColumns({ columns, roles, exempt: ['updatedAt', 'version'] }),
    [],
  );
});
