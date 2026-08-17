import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIGRATION_RUNNER_VERSION,
  expectedTablesAfter,
  inspectMigrationState,
  ledgerDigest,
  loadMigrationInventory,
  planMigrations,
  readDeploymentRecords,
  recordDeployment,
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
    surface: undefined,
    commit: undefined,
    deploymentRef: undefined,
    limit: undefined,
    confirmBaseline: false,
    confirmProduction: false,
    json: false,
  });
});

test('CLI parses the deployment record identity', () => {
  const options = parseCliArgs([
    '--',
    'record',
    '--surface',
    'web',
    '--commit',
    'a'.repeat(40),
    '--target',
    'production',
    '--confirm-production',
    '--deployment-ref',
    'https://example.invalid/deployment',
  ]);
  assert.equal(options.command, 'record');
  assert.equal(options.surface, 'web');
  assert.equal(options.commit, 'a'.repeat(40));
  assert.equal(options.target, 'production');
  assert.equal(options.confirmProduction, true);
  assert.equal(options.deploymentRef, 'https://example.invalid/deployment');
});

function deploymentDatabase(migrations, appliedCount) {
  const ledger = migrations.slice(0, appliedCount).map((migration) => ledgerRow(migration));
  const deployments = [];
  const statements = [];
  let deploymentLedgerExists = false;

  const client = {
    async query(statement, params = []) {
      statements.push(statement);
      if (/to_regclass\('public\.schema_migrations'\)/.test(statement)) {
        return { rows: [{ relation: 'schema_migrations' }] };
      }
      if (/FROM public\.schema_migrations\b/.test(statement)) {
        return { rows: ledger };
      }
      if (/CREATE TABLE IF NOT EXISTS public\.schema_migration_deployments/.test(statement)) {
        deploymentLedgerExists = true;
        return { rows: [] };
      }
      if (/to_regclass\('public\.schema_migration_deployments'\)/.test(statement)) {
        return {
          rows: [{ relation: deploymentLedgerExists ? 'schema_migration_deployments' : null }],
        };
      }
      if (/INSERT INTO public\.schema_migration_deployments/.test(statement)) {
        if (!deploymentLedgerExists) throw new Error('deployment ledger does not exist');
        const row = {
          surface: params[0],
          target: params[1],
          commit_sha: params[2],
          deployment_ref: params[3],
          head_sequence: params[4],
          head_filename: params[5],
          head_checksum: params[6],
          applied_count: params[7],
          ledger_digest: params[8],
          runner_version: params[9],
          metadata: JSON.parse(params[10]),
          verified_at: new Date(),
        };
        const existing = deployments.findIndex(
          (record) =>
            record.surface === row.surface &&
            record.target === row.target &&
            record.commit_sha === row.commit_sha,
        );
        if (existing >= 0) deployments[existing] = row;
        else deployments.push(row);
        return { rows: [row] };
      }
      if (/FROM public\.schema_migration_deployments/.test(statement)) {
        const [surface, limit] = params;
        return {
          rows: deployments
            .filter((record) => surface === null || record.surface === surface)
            .slice(0, limit),
        };
      }
      throw new Error(`unexpected statement: ${statement}`);
    },
  };

  return { client, ledger, statements, deployments };
}

test('a deployment refuses to record itself while the database is behind the head', async () => {
  const migrations = loadMigrationInventory().slice(0, 3);
  const database = deploymentDatabase(migrations, 2);

  await assert.rejects(
    recordDeployment(database.client, migrations, {
      surface: 'web',
      target: 'production',
      commitSha: 'b'.repeat(40),
    }),
    (error) => {
      assert.equal(error.name, 'MigrationContractError');
      assert.match(error.message, /unapplied migrations/);
      assert.deepEqual(error.details, [migrations[2].filename]);
      return true;
    },
  );
  assert.equal(
    database.statements.some((statement) => /schema_migration_deployments/.test(statement)),
    false,
  );
  assert.equal(database.deployments.length, 0);
});

test('a verified deployment records its migration head and stays queryable', async () => {
  const migrations = loadMigrationInventory().slice(0, 3);
  const database = deploymentDatabase(migrations, migrations.length);
  const commitSha = 'c'.repeat(40);

  const result = await recordDeployment(database.client, migrations, {
    surface: 'web',
    target: 'production',
    commitSha,
    deploymentRef: 'https://example.invalid/deployment',
  });

  assert.equal(result.record.head_filename, migrations.at(-1).filename);
  assert.equal(result.record.head_checksum, migrations.at(-1).checksum);
  assert.equal(result.record.applied_count, migrations.length);
  assert.equal(result.record.ledger_digest, ledgerDigest(database.ledger));
  assert.equal(result.record.runner_version, MIGRATION_RUNNER_VERSION);

  await recordDeployment(database.client, migrations, {
    surface: 'web',
    target: 'production',
    commitSha,
  });

  const history = await readDeploymentRecords(database.client, { surface: 'web' });
  assert.equal(history.length, 1);
  assert.equal(history[0].commit_sha, commitSha);
  assert.equal(history[0].head_sequence, migrations.at(-1).sequence);
  assert.deepEqual(await readDeploymentRecords(database.client, { surface: 'gateway' }), []);
});

test('a deployment record demands a known surface and a real commit sha', async () => {
  const migrations = loadMigrationInventory().slice(0, 3);
  const database = deploymentDatabase(migrations, migrations.length);

  await assert.rejects(
    recordDeployment(database.client, migrations, {
      surface: 'marketing',
      target: 'production',
      commitSha: 'not-a-sha',
    }),
    (error) => {
      assert.equal(error.name, 'MigrationContractError');
      assert.equal(error.details.length, 2);
      return true;
    },
  );
});

test('deployment history is empty until a deployment records one', async () => {
  const migrations = loadMigrationInventory().slice(0, 3);
  const database = deploymentDatabase(migrations, migrations.length);
  assert.deepEqual(await readDeploymentRecords(database.client), []);
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
