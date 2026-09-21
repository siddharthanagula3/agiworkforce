import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  checkIdentifierDiscipline,
  findPositionalIdentifiers,
  loadContract,
  readPrimaryKeys,
} from './check-identifier-discipline.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const CLEAN = `
create table widgets (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
`;

function fixture(migration = CLEAN, overrides = {}, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'identifier-discipline-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, `${MIGRATIONS_DIR}/0001_widgets.sql`, migration);
  write(
    root,
    CONTRACT_PATH,
    JSON.stringify({
      ...loadContract(REPO_ROOT),
      ...{
        sequentialKeys: [],
        mintedElsewhereKeys: [],
        keylessTables: [],
        forbiddenKeyExemptions: [],
        positionalExemptions: [],
      },
      ...overrides,
    }),
  );
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors } = checkIdentifierDiscipline(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test('a clean schema passes', () => {
  assert.deepEqual(checkIdentifierDiscipline(fixture()).errors, []);
});

test('a key that is an email address fails', () => {
  const { errors } = checkIdentifierDiscipline(
    fixture('create table people (\n  email text primary key,\n  name text\n);\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('identifies a row by email')),
    errors.join('\n'),
  );
});

test('a key that is a name, a filename, a secret or a position fails', () => {
  for (const [column, fragment] of [
    ['slug', 'identifies a row by slug'],
    ['file_path', 'identifies a row by file_path'],
    ['refresh_token', 'identifies a row by refresh_token'],
    ['ordinal', 'identifies a row by ordinal'],
    ['provider_task_id', 'identifies a row by provider_task_id'],
  ]) {
    const { errors } = checkIdentifierDiscipline(
      fixture(`create table things (\n  ${column} text primary key,\n  body text\n);\n`),
    );
    assert.ok(
      errors.some((error) => error.includes(fragment)),
      `${column}: ${errors.join('\n')}`,
    );
  }
});

test('a forbidden key may be exempted with a reason, and a stale exemption fails', () => {
  const migration = 'create table replicas (\n  object_key text primary key,\n  body text\n);\n';
  assert.deepEqual(
    checkIdentifierDiscipline(
      fixture(migration, {
        forbiddenKeyExemptions: [
          { table: 'replicas', rule: 'filename', why: 'the key is the thing' },
        ],
      }),
    ).errors,
    [],
  );
  const stale = checkIdentifierDiscipline(
    fixture(CLEAN, {
      forbiddenKeyExemptions: [{ table: 'replicas', rule: 'filename', why: '' }],
    }),
  );
  assert.ok(
    stale.errors.some((error) => error.includes('carries no reason')),
    stale.errors.join('\n'),
  );
  assert.ok(
    stale.errors.some((error) => error.includes('no longer matches a key')),
    stale.errors.join('\n'),
  );
});

test('a sequential key fails until it is recorded, and a recorded one that is rewritten fails', () => {
  const migration =
    'create table entries (\n  id bigint generated always as identity primary key,\n  body text\n);\n';
  const unrecorded = checkIdentifierDiscipline(fixture(migration));
  assert.ok(
    unrecorded.errors.some((error) => error.includes('counts its rows in id')),
    unrecorded.errors.join('\n'),
  );

  assert.deepEqual(
    checkIdentifierDiscipline(
      fixture(migration, { sequentialKeys: [{ table: 'entries', why: 'append-only log' }] }),
    ).errors,
    [],
  );

  const rewritten = checkIdentifierDiscipline(
    fixture(
      migration,
      { sequentialKeys: [{ table: 'entries', why: 'append-only log' }] },
      { 'apps/web/lib/entries.ts': 'export const sql = `update entries set body = $1`;' },
    ),
  );
  assert.ok(
    rewritten.errors.some((error) => error.includes('rewrites it in place')),
    rewritten.errors.join('\n'),
  );
});

test('a uuid key with no default fails until the contract says what mints it', () => {
  const migration = 'create table widgets (\n  id uuid primary key,\n  name text\n);\n';
  const unrecorded = checkIdentifierDiscipline(fixture(migration));
  assert.ok(
    unrecorded.errors.some((error) => error.includes('is a uuid with no default')),
    unrecorded.errors.join('\n'),
  );
  assert.deepEqual(
    checkIdentifierDiscipline(
      fixture(migration, { mintedElsewhereKeys: [{ table: 'widgets', mintedBy: 'the device' }] }),
    ).errors,
    [],
  );
  const silent = checkIdentifierDiscipline(
    fixture(migration, { mintedElsewhereKeys: [{ table: 'widgets', mintedBy: '' }] }),
  );
  assert.ok(
    silent.errors.some((error) => error.includes('does not say what mints the id')),
    silent.errors.join('\n'),
  );
});

test('a table with no primary key fails', () => {
  const { errors } = checkIdentifierDiscipline(
    fixture('create table notes (\n  body text not null,\n  created_at timestamptz\n);\n'),
  );
  assert.ok(
    errors.some((error) => error.includes('has no primary key')),
    errors.join('\n'),
  );
});

test('an identifier built out of a loop index fails', () => {
  const contract = loadContract(REPO_ROOT);
  const found = findPositionalIdentifiers({
    repoRoot: REPO_ROOT,
    files: [],
    patterns: contract.positionalIdentifierPatterns,
  });
  assert.deepEqual(found, []);

  const root = fixture(
    CLEAN,
    {},
    {
      'apps/web/lib/rows.ts':
        'export const rows = items.map((item, index) => ({ id: index, label: item }));',
    },
  );
  const { errors } = checkIdentifierDiscipline(root);
  assert.ok(
    errors.some((error) => error.includes('builds an identifier out of a position')),
    errors.join('\n'),
  );
});

test('the primary keys are read from the migrations, inline and composite', () => {
  const root = fixture(
    'create table pairs (\n  left_id uuid not null,\n  right_id uuid not null,\n  primary key (left_id, right_id)\n);\n',
  );
  const keys = readPrimaryKeys(root);
  assert.deepEqual(
    keys.get('pairs').columns.map((entry) => entry.column),
    ['left_id', 'right_id'],
  );
});
