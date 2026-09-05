import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PG_BIN_DIR_ENV,
  SCRATCH_PREFIX_ENV,
  SOURCE_URL_ENV,
  TARGET_ADMIN_URL_ENV,
  loadConfigFromEnv,
  runLogicalRestoreDrill,
} from './db-restore-drill-logical.mjs';
import {
  buildPgDumpInvocation,
  buildPgRestoreInvocation,
  pgConnectionParams,
  withDatabase,
} from './lib/pg-dump-restore.mjs';
import {
  CORE_TABLES,
  MIGRATION_LEDGER_TABLE,
  checkTablesPresent,
  compareCounts,
  countTableRows,
  redactConnectionSummary,
} from './lib/restore-drill-core.mjs';

const SOURCE_URL = 'postgresql://sourceuser:PLACEHOLDER@source.example.com:5432/agiworkforce_dev';
const TARGET_ADMIN_URL = 'postgresql://targetuser:PLACEHOLDER@target.example.com:5433/postgres';

function makeFakeClient(queryImpl, calls) {
  return {
    connect: async () => calls.push('connect'),
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows: await queryImpl(text, params) };
    },
    end: async () => calls.push('end'),
  };
}

function makeDataQueryImpl({ counts, presentTables }) {
  return async (text, params) => {
    if (text.startsWith('select to_regclass')) {
      const table = params[0];
      return presentTables.has(table) ? [{ relation: table }] : [{ relation: null }];
    }
    const table = text.slice(text.lastIndexOf('from ') + 'from '.length);
    return [{ count: counts[table] ?? 0 }];
  };
}

function makeSpawnImpl({ calls, dumpExitCode = 0, restoreExitCode = 0 }) {
  return async (command, args, { env }) => {
    calls.push({ command, args, env });
    if (command === 'pg_restore') return { code: restoreExitCode, stderr: '' };
    return { code: dumpExitCode, stderr: '' };
  };
}

function buildHarness({
  sourceCounts,
  targetCounts,
  targetPresentTables,
  dumpExitCode,
  restoreExitCode,
}) {
  const adminCalls = [];
  const sourceCalls = [];
  const scratchCalls = [];
  const spawnCalls = [];
  const removedFiles = [];

  const adminClient = makeFakeClient(async () => [], adminCalls);
  const sourceClient = makeFakeClient(
    makeDataQueryImpl({ counts: sourceCounts, presentTables: new Set(CORE_TABLES) }),
    sourceCalls,
  );
  const scratchClient = makeFakeClient(
    makeDataQueryImpl({ counts: targetCounts, presentTables: targetPresentTables }),
    scratchCalls,
  );

  const createClient = (connectionString) => {
    if (connectionString === TARGET_ADMIN_URL) return adminClient;
    if (connectionString === SOURCE_URL) return sourceClient;
    return scratchClient;
  };

  const spawnImpl = makeSpawnImpl({ calls: spawnCalls, dumpExitCode, restoreExitCode });
  const removeFile = async (path) => removedFiles.push(path);

  return {
    adminCalls,
    sourceCalls,
    scratchCalls,
    spawnCalls,
    removedFiles,
    createClient,
    spawnImpl,
    removeFile,
  };
}

test('loadConfigFromEnv reads the four env names and defaults the scratch prefix', () => {
  const config = loadConfigFromEnv({
    [SOURCE_URL_ENV]: 'postgresql://a@h/db',
    [TARGET_ADMIN_URL_ENV]: 'postgresql://b@h2/postgres',
  });
  assert.equal(config.sourceUrl, 'postgresql://a@h/db');
  assert.equal(config.targetAdminUrl, 'postgresql://b@h2/postgres');
  assert.equal(config.scratchPrefix, 'agi_restore_drill');
  assert.equal(config.binDir, undefined);

  const withOverrides = loadConfigFromEnv({
    [SOURCE_URL_ENV]: 'postgresql://a@h/db',
    [TARGET_ADMIN_URL_ENV]: 'postgresql://b@h2/postgres',
    [SCRATCH_PREFIX_ENV]: 'custom_prefix',
    [PG_BIN_DIR_ENV]: '/opt/homebrew/opt/postgresql@17/bin',
  });
  assert.equal(withOverrides.scratchPrefix, 'custom_prefix');
  assert.equal(withOverrides.binDir, '/opt/homebrew/opt/postgresql@17/bin');
});

test('pgConnectionParams and withDatabase parse and rewrite a connection string', () => {
  const params = pgConnectionParams(SOURCE_URL);
  assert.equal(params.host, 'source.example.com');
  assert.equal(params.port, '5432');
  assert.equal(params.user, 'sourceuser');
  assert.equal(params.password, 'PLACEHOLDER');
  assert.equal(params.database, 'agiworkforce_dev');

  const rewritten = withDatabase(TARGET_ADMIN_URL, 'agi_restore_drill_scratch');
  assert.match(rewritten, /\/agi_restore_drill_scratch$/);
  assert.match(rewritten, /^postgresql:\/\/targetuser:PLACEHOLDER@target\.example\.com:5433\//);
});

test('redactConnectionSummary never carries user or password', () => {
  const summary = redactConnectionSummary(SOURCE_URL);
  assert.deepEqual(summary, {
    host: 'source.example.com',
    port: '5432',
    database: 'agiworkforce_dev',
  });
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes('sourceuser'));
  assert.ok(!serialized.includes('PLACEHOLDER'));
});

test('buildPgDumpInvocation and buildPgRestoreInvocation carry credentials only in env, never in args', () => {
  const sourceParams = pgConnectionParams(SOURCE_URL);
  const dump = buildPgDumpInvocation({
    sourceParams,
    dumpFilePath: '/tmp/scratch.dump',
    baseEnv: {},
  });
  assert.equal(dump.command, 'pg_dump');
  assert.deepEqual(dump.args, [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    'agiworkforce_dev',
    '--file',
    '/tmp/scratch.dump',
  ]);
  assert.equal(dump.env.PGHOST, 'source.example.com');
  assert.equal(dump.env.PGPASSWORD, 'PLACEHOLDER');
  assert.ok(!dump.args.some((arg) => arg.includes('PLACEHOLDER')));

  const restoreParams = { ...pgConnectionParams(TARGET_ADMIN_URL), database: 'scratch_db' };
  const restore = buildPgRestoreInvocation({
    binDir: '/opt/homebrew/opt/postgresql@17/bin',
    targetParams: restoreParams,
    dumpFilePath: '/tmp/scratch.dump',
    baseEnv: {},
  });
  assert.equal(restore.command, '/opt/homebrew/opt/postgresql@17/bin/pg_restore');
  assert.deepEqual(restore.args, [
    '--no-owner',
    '--no-privileges',
    '--dbname',
    'scratch_db',
    '/tmp/scratch.dump',
  ]);
  assert.equal(restore.env.PGPASSWORD, 'PLACEHOLDER');
  assert.ok(!restore.args.some((arg) => arg.includes('PLACEHOLDER')));
});

test('checkTablesPresent and compareCounts flag missing tables and count mismatches', async () => {
  const presentTables = new Set(CORE_TABLES.slice(1));
  const query = makeDataQueryImpl({ counts: {}, presentTables });
  const { presence, missing } = await checkTablesPresent(query, CORE_TABLES);
  assert.deepEqual(missing, [CORE_TABLES[0]]);
  assert.equal(presence[CORE_TABLES[0]], false);
  assert.equal(presence[CORE_TABLES[1]], true);

  const result = compareCounts({ a: 5, b: 3 }, { a: 5, b: 4 }, ['a', 'b']);
  assert.equal(result.pass, false);
  assert.deepEqual(result.mismatched, ['b']);
  assert.equal(result.comparisons.a.match, true);
});

test('countTableRows reuses the shared count(*) query shape', async () => {
  const calls = [];
  const query = async (text) => {
    calls.push(text);
    return [{ count: 42 }];
  };
  const count = await countTableRows(query, 'public.profiles');
  assert.equal(count, 42);
  assert.equal(calls[0], 'select count(*)::int as count from public.profiles');
});

test('runLogicalRestoreDrill passes when every core table and the ledger match', async () => {
  const counts = Object.fromEntries(CORE_TABLES.map((table, index) => [table, index + 1]));
  counts[MIGRATION_LEDGER_TABLE] = 168;
  const harness = buildHarness({
    sourceCounts: counts,
    targetCounts: counts,
    targetPresentTables: new Set(CORE_TABLES),
  });

  const report = await runLogicalRestoreDrill({
    sourceUrl: SOURCE_URL,
    targetAdminUrl: TARGET_ADMIN_URL,
    createClient: harness.createClient,
    spawnImpl: harness.spawnImpl,
    removeFile: harness.removeFile,
    now: () => 1000,
    randomSuffix: () => 'abcd1234',
  });

  assert.equal(report.pass, true);
  assert.equal(report.scratchDatabase, 'agi_restore_drill_1000_abcd1234');
  assert.equal(report.ledger.match, true);
  assert.equal(report.missingTables.length, 0);
  assert.equal(report.source.host, 'source.example.com');
  assert.equal(report.target.database, 'agi_restore_drill_1000_abcd1234');

  assert.ok(
    harness.adminCalls.some(
      (call) => call.text === 'create database "agi_restore_drill_1000_abcd1234"',
    ),
  );
  assert.ok(
    harness.adminCalls.some(
      (call) =>
        call.text === 'drop database if exists "agi_restore_drill_1000_abcd1234" with (force)',
    ),
  );
  assert.equal(harness.spawnCalls[0].command, 'pg_dump');
  assert.equal(harness.spawnCalls[1].command, 'pg_restore');
  assert.equal(harness.removedFiles.length, 1);
  assert.ok(harness.sourceCalls.includes('end'));
  assert.ok(harness.scratchCalls.includes('end'));
});

test('runLogicalRestoreDrill fails without throwing when a table count diverges', async () => {
  const sourceCounts = Object.fromEntries(CORE_TABLES.map((table) => [table, 10]));
  sourceCounts[MIGRATION_LEDGER_TABLE] = 168;
  const targetCounts = { ...sourceCounts, [CORE_TABLES[0]]: 9 };
  const harness = buildHarness({
    sourceCounts,
    targetCounts,
    targetPresentTables: new Set(CORE_TABLES),
  });

  const report = await runLogicalRestoreDrill({
    sourceUrl: SOURCE_URL,
    targetAdminUrl: TARGET_ADMIN_URL,
    createClient: harness.createClient,
    spawnImpl: harness.spawnImpl,
    removeFile: harness.removeFile,
  });

  assert.equal(report.pass, false);
  assert.equal(report.counts[CORE_TABLES[0]].match, false);
  assert.ok(harness.adminCalls.some((call) => String(call.text).startsWith('drop database')));
});

test('runLogicalRestoreDrill fails and still drops the scratch database when a table is missing', async () => {
  const sourceCounts = Object.fromEntries(CORE_TABLES.map((table) => [table, 10]));
  sourceCounts[MIGRATION_LEDGER_TABLE] = 168;
  const harness = buildHarness({
    sourceCounts,
    targetCounts: sourceCounts,
    targetPresentTables: new Set(CORE_TABLES.slice(1)),
  });

  const report = await runLogicalRestoreDrill({
    sourceUrl: SOURCE_URL,
    targetAdminUrl: TARGET_ADMIN_URL,
    createClient: harness.createClient,
    spawnImpl: harness.spawnImpl,
    removeFile: harness.removeFile,
  });

  assert.equal(report.pass, false);
  assert.deepEqual(report.missingTables, [CORE_TABLES[0]]);
  assert.equal(report.counts[CORE_TABLES[0]].target, null);
  assert.ok(harness.adminCalls.some((call) => String(call.text).startsWith('drop database')));
});

test('runLogicalRestoreDrill drops the scratch database and rethrows when pg_restore fails', async () => {
  const sourceCounts = Object.fromEntries(CORE_TABLES.map((table) => [table, 10]));
  const harness = buildHarness({
    sourceCounts,
    targetCounts: sourceCounts,
    targetPresentTables: new Set(CORE_TABLES),
    restoreExitCode: 1,
  });

  await assert.rejects(
    runLogicalRestoreDrill({
      sourceUrl: SOURCE_URL,
      targetAdminUrl: TARGET_ADMIN_URL,
      createClient: harness.createClient,
      spawnImpl: harness.spawnImpl,
      removeFile: harness.removeFile,
    }),
    /pg_restore exited with code 1/,
  );

  assert.ok(harness.adminCalls.some((call) => String(call.text).startsWith('create database')));
  assert.ok(harness.adminCalls.some((call) => String(call.text).startsWith('drop database')));
  assert.equal(harness.removedFiles.length, 1);
});

test('runLogicalRestoreDrill requires a source url and a target admin url', async () => {
  await assert.rejects(
    runLogicalRestoreDrill({
      targetAdminUrl: TARGET_ADMIN_URL,
      createClient: () => {},
      spawnImpl: async () => ({ code: 0 }),
    }),
    new RegExp(SOURCE_URL_ENV),
  );
  await assert.rejects(
    runLogicalRestoreDrill({
      sourceUrl: SOURCE_URL,
      createClient: () => {},
      spawnImpl: async () => ({ code: 0 }),
    }),
    new RegExp(TARGET_ADMIN_URL_ENV),
  );
});
