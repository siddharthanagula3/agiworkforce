import assert from 'node:assert/strict';
import test from 'node:test';

import {
  destructiveMarkerErrors,
  destructiveStatements,
  expandContractErrors,
  quotingErrors,
} from './check-neon-migrations.mjs';
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

const newMigration = '0900_probe.sql';

test('a drop, a truncate and a retype are each destructive', () => {
  assert.deepEqual(destructiveStatements('drop table public.widgets;'), ['DROP TABLE']);
  assert.deepEqual(destructiveStatements('truncate public.widgets;'), ['TRUNCATE']);
  assert.deepEqual(destructiveStatements('alter table public.w alter column p type jsonb;'), [
    'ALTER COLUMN ... TYPE',
  ]);
});

test('a policy the same migration re-creates is a redefinition, not a loss', () => {
  const sql =
    'drop policy if exists widgets_isolation on public.widgets;\n' +
    'create policy widgets_isolation on public.widgets for all to app_rls using (true);';

  assert.deepEqual(destructiveStatements(sql), []);
  assert.deepEqual(destructiveStatements('drop policy widgets_isolation on public.widgets;'), [
    'DROP POLICY widgets_isolation',
  ]);
});

test('NOT NULL is destructive on a populated table and free on a new one', () => {
  assert.deepEqual(
    destructiveStatements('alter table public.widgets alter column a set not null;'),
    ['SET NOT NULL on the populated table widgets'],
  );
  assert.deepEqual(
    destructiveStatements(
      'create table public.widgets (id uuid primary key, a text);\n' +
        'alter table public.widgets alter column a set not null;',
    ),
    [],
  );
});

test('a destructive migration is refused until it says what it is giving up', () => {
  const sql = 'begin; drop table public.widgets; commit;';
  const errors = destructiveMarkerErrors(newMigration, sql);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /DROP TABLE/);
  assert.deepEqual(
    destructiveMarkerErrors(newMigration, `-- destructive: dead since 0899.\n${sql}`),
    [],
  );
});

test('the destructive marker is refused when nothing in the file needs it', () => {
  const errors = destructiveMarkerErrors(
    newMigration,
    '-- destructive: I would like the attention.\ncreate table public.widgets (id uuid primary key);',
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /Remove the marker/);
});

test('a waiver for a migration that is no longer destructive is reported', () => {
  const errors = destructiveMarkerErrors(
    '0031_drop_legacy_user_id_mapping.sql',
    'create table public.widgets (id uuid primary key);',
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /no longer/);
});

test('a rename is refused: the running release still writes the old name', () => {
  assert.match(
    expandContractErrors(newMigration, 'alter table public.widgets rename column a to b;')[0],
    /Add the new column, backfill it/,
  );
  assert.match(
    expandContractErrors(newMigration, 'alter table public.widgets rename to gizmos;')[0],
    /still queries widgets/,
  );
});

test('NOT NULL with no default is refused on a table this migration did not create', () => {
  assert.match(
    expandContractErrors(
      newMigration,
      'alter table public.widgets add column if not exists owner_id text not null;',
    )[0],
    /Every INSERT the running release issues omits it/,
  );
  assert.deepEqual(
    expandContractErrors(
      newMigration,
      "alter table public.widgets add column if not exists owner_id text not null default '';",
    ),
    [],
  );
  assert.deepEqual(
    expandContractErrors(
      newMigration,
      'create table public.widgets (id uuid primary key);\n' +
        'alter table public.widgets add column owner_id text not null;',
    ),
    [],
  );
});

test('a NOT NULL default behind a comma inside parentheses still counts', () => {
  assert.deepEqual(
    expandContractErrors(
      newMigration,
      'alter table public.widgets add column amount numeric(20, 6) not null default 0;',
    ),
    [],
  );
});

test('expanding and contracting one table in one migration is refused', () => {
  const errors = expandContractErrors(
    newMigration,
    'alter table public.widgets add column owner_id text;\n' +
      'alter table public.widgets drop column legacy_owner;',
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /expand and the contract in a single step/);
});
