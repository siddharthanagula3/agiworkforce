import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  expectedTablesAfter,
  inspectMigrationState,
  loadMigrationInventory,
  planMigrations,
} from './lib/neon-migrations.mjs';
import {
  extractRouteReferencesFromSource,
  missingRouteTableMigrations,
} from './lib/route-table-contract.mjs';
import { parseCliArgs } from './neon-migrate.mjs';

function ledgerRow(migration, overrides = {}) {
  return {
    sequence: migration.sequence,
    filename: migration.filename,
    checksum: migration.checksum,
    ...overrides,
  };
}

test('the canonical inventory is contiguous and checksum-addressed', () => {
  const migrations = loadMigrationInventory();
  assert.ok(migrations.length >= 75);
  assert.equal(migrations[0].sequence, 1);
  assert.equal(migrations.at(-1).sequence, migrations.length);
  for (const migration of migrations) {
    assert.match(migration.filename, /^\d{4}_[a-z0-9_]+\.sql$/);
    assert.match(migration.checksum, /^[0-9a-f]{64}$/);
  }
});

test('plan reports a clean applied prefix and remaining files', () => {
  const migrations = loadMigrationInventory();
  const ledger = migrations.slice(0, 3).map((migration) => ledgerRow(migration));
  const plan = planMigrations(migrations, ledger);
  assert.deepEqual(plan.drift, []);
  assert.equal(plan.applied.length, 3);
  assert.equal(plan.pending[0].sequence, 4);
});

test('plan rejects edited, renamed, unknown, and gapped ledger history', () => {
  const migrations = loadMigrationInventory();
  const ledger = [
    ledgerRow(migrations[0], { checksum: '0'.repeat(64) }),
    ledgerRow(migrations[2]),
    { sequence: 9999, filename: '9999_unknown.sql', checksum: 'f'.repeat(64) },
  ];
  const plan = planMigrations(migrations, ledger);
  assert.ok(plan.drift.some((detail) => detail.includes('checksum differs')));
  assert.ok(plan.drift.some((detail) => detail.includes('gap before applied')));
  assert.ok(plan.drift.some((detail) => detail.includes('unknown migration')));
});

test('status inspection treats a missing ledger as pending without mutating the database', async () => {
  const statements = [];
  const client = {
    async query(statement) {
      statements.push(statement);
      return { rows: [{ relation: null }] };
    },
  };
  const migrations = loadMigrationInventory().slice(0, 2);
  const state = await inspectMigrationState(client, migrations);

  assert.equal(state.plan.applied.length, 0);
  assert.equal(state.plan.pending.length, 2);
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0], /\bcreate\b/i);
});

test('expected-table projection accounts for later DROP TABLE migrations', () => {
  const tables = expectedTablesAfter([
    { sql: 'CREATE TABLE public.keep_me (id int); CREATE TABLE drop_me (id int);' },
    { sql: 'DROP TABLE IF EXISTS public.drop_me;' },
  ]);
  assert.deepEqual(tables, ['keep_me']);
});

test('CLI accepts the pnpm separator and explicit safety confirmations', () => {
  assert.deepEqual(parseCliArgs(['--', 'apply', '--target', 'branch']), {
    command: 'apply',
    target: 'branch',
    through: undefined,
    reason: undefined,
    evidence: undefined,
    confirmBaseline: false,
    confirmProduction: false,
    json: false,
  });
});

test('route-table extraction reads query builders and SQL while excluding CTE aliases', () => {
  const references = extractRouteReferencesFromSource(`
    db.from('direct_table').select('*');
    db.query('with selected as (select * from source_table) select * from selected');
    db.execute('insert into target_table (id) values ($1)');
  `);
  assert.deepEqual([...references.keys()].sort(), ['direct_table', 'source_table', 'target_table']);
});

test('every literal route relation is owned by the canonical migration chain', () => {
  assert.deepEqual(missingRouteTableMigrations(process.cwd()), []);
});
