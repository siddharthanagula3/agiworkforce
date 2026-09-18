import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  REHEARSAL_DB_WRITERS,
  staleRehearsalWaivers,
  unauditedWriters,
} from './check-unaudited-db-writes.mjs';

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'db-writes-'));
  mkdirSync(join(root, 'scripts'));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, 'scripts', name), source, 'utf8');
  }
  return root;
}

function run(files) {
  const root = repoWith(files);
  try {
    return unauditedWriters(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const connects = "import { Client } from 'pg';\n";

test('a script that writes and records nothing is reported', () => {
  const failures = run({
    'patch-users.mjs': `${connects}await client.query('update public.profiles set plan = $1');`,
  });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /records nothing/);
});

test('a script that writes an audit row is accepted', () => {
  assert.deepEqual(
    run({
      'patch-users.mjs':
        `${connects}await client.query('update public.profiles set plan = $1');\n` +
        "await client.query('insert into security_audit_logs (event_type) values ($1)');",
    }),
    [],
  );
});

test('a migration runner is accepted on its own ledger', () => {
  assert.deepEqual(
    run({
      'neon-migrate.mjs':
        `${connects}await client.query('alter table public.a add column b text');\n` +
        "await client.query('insert into public.schema_migrations (sequence) values ($1)');",
    }),
    [],
  );
});

test('a read-only script that never writes is not asked for an audit', () => {
  assert.deepEqual(
    run({ 'probe.mjs': `${connects}await client.query('select count(*) from public.profiles');` }),
    [],
  );
});

test('a checker that only names SQL in a pattern is out of scope', () => {
  assert.deepEqual(run({ 'check-something.mjs': `${connects}const pattern = /insert into/;` }), []);
});

test('every rehearsal waiver still names a script that exists', () => {
  assert.ok(REHEARSAL_DB_WRITERS.size > 0);
  assert.deepEqual(staleRehearsalWaivers(process.cwd()), []);
});

test('a waiver for a deleted script is reported', () => {
  const failures = staleRehearsalWaivers(repoWith({ 'probe.mjs': 'export const x = 1;' }));

  assert.equal(failures.length, REHEARSAL_DB_WRITERS.size);
  for (const failure of failures) assert.match(failure, /no longer exists/);
});
