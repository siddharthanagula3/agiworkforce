#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import {
  CORE_TABLES,
  MIGRATION_LEDGER_TABLE,
  checkTablesPresent,
  compareCounts,
  countTableRows,
  redactConnectionSummary,
} from './lib/restore-drill-core.mjs';
import {
  buildPgDumpInvocation,
  buildPgRestoreInvocation,
  pgConnectionParams,
  runCommand,
  withDatabase,
} from './lib/pg-dump-restore.mjs';

export const SOURCE_URL_ENV = 'AGI_RESTORE_DRILL_SOURCE_URL';
export const TARGET_ADMIN_URL_ENV = 'AGI_RESTORE_DRILL_TARGET_ADMIN_URL';
export const SCRATCH_PREFIX_ENV = 'AGI_RESTORE_DRILL_SCRATCH_PREFIX';
export const PG_BIN_DIR_ENV = 'AGI_RESTORE_DRILL_PG_BIN_DIR';
const DEFAULT_SCRATCH_PREFIX = 'agi_restore_drill';

export function loadConfigFromEnv(env = process.env) {
  return {
    sourceUrl: env[SOURCE_URL_ENV],
    targetAdminUrl: env[TARGET_ADMIN_URL_ENV],
    scratchPrefix: env[SCRATCH_PREFIX_ENV] || DEFAULT_SCRATCH_PREFIX,
    binDir: env[PG_BIN_DIR_ENV] || undefined,
  };
}

function defaultSpawn(command, args, { env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

function defaultCreateClient(connectionString) {
  return new Client({ connectionString });
}

function toQuery(client) {
  return async (text, params) => (await client.query(text, params)).rows;
}

export async function runLogicalRestoreDrill(options) {
  const {
    sourceUrl,
    targetAdminUrl,
    scratchPrefix = DEFAULT_SCRATCH_PREFIX,
    binDir,
    spawnImpl,
    createClient,
    tmpDir = tmpdir(),
    removeFile = (path) => rm(path, { force: true }),
    now = () => Date.now(),
    randomSuffix = () => randomBytes(4).toString('hex'),
    tables = CORE_TABLES,
    ledgerTable = MIGRATION_LEDGER_TABLE,
  } = options;

  if (!sourceUrl) throw new Error(`${SOURCE_URL_ENV} is not set`);
  if (!targetAdminUrl) throw new Error(`${TARGET_ADMIN_URL_ENV} is not set`);
  if (!spawnImpl) throw new Error('spawnImpl is required');
  if (!createClient) throw new Error('createClient is required');

  const startedAt = performance.now();
  const scratchDatabase = `${scratchPrefix}_${now()}_${randomSuffix()}`;
  const dumpFilePath = join(tmpDir, `${scratchDatabase}.dump`);
  const sourceParams = pgConnectionParams(sourceUrl);
  const targetAdminParams = pgConnectionParams(targetAdminUrl);
  const targetScratchUrl = withDatabase(targetAdminUrl, scratchDatabase);
  const targetScratchParams = { ...targetAdminParams, database: scratchDatabase };

  const report = {
    scratchDatabase,
    source: redactConnectionSummary(sourceUrl),
    target: redactConnectionSummary(targetScratchUrl),
    pass: false,
  };

  const adminClient = createClient(targetAdminUrl);
  await adminClient.connect();

  try {
    await adminClient.query(`create database "${scratchDatabase}"`);

    let sourceClient;
    let scratchClient;
    try {
      await runCommand(spawnImpl, buildPgDumpInvocation({ binDir, sourceParams, dumpFilePath }));
      await runCommand(
        spawnImpl,
        buildPgRestoreInvocation({ binDir, targetParams: targetScratchParams, dumpFilePath }),
      );

      sourceClient = createClient(sourceUrl);
      scratchClient = createClient(targetScratchUrl);
      await sourceClient.connect();
      await scratchClient.connect();
      const sourceQuery = toQuery(sourceClient);
      const scratchQuery = toQuery(scratchClient);

      const { presence, missing } = await checkTablesPresent(scratchQuery, tables);
      report.presence = presence;
      report.missingTables = missing;

      const sourceCounts = {};
      const targetCounts = {};
      for (const table of tables) {
        sourceCounts[table] = await countTableRows(sourceQuery, table);
        targetCounts[table] = missing.includes(table)
          ? null
          : await countTableRows(scratchQuery, table);
      }
      const countResult = compareCounts(sourceCounts, targetCounts, tables);
      report.counts = countResult.comparisons;

      const sourceLedgerCount = await countTableRows(sourceQuery, ledgerTable);
      const targetLedgerCount = await countTableRows(scratchQuery, ledgerTable);
      report.ledger = {
        table: ledgerTable,
        source: sourceLedgerCount,
        target: targetLedgerCount,
        match: sourceLedgerCount !== null && sourceLedgerCount === targetLedgerCount,
      };

      report.pass = missing.length === 0 && countResult.pass && report.ledger.match;
    } finally {
      if (scratchClient) await scratchClient.end();
      if (sourceClient) await sourceClient.end();
      await removeFile(dumpFilePath);
    }
  } finally {
    try {
      await adminClient.query(`drop database if exists "${scratchDatabase}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }

  report.elapsedMs = Math.round(performance.now() - startedAt);
  return report;
}

function printReport(report) {
  console.log(`Logical restore drill: ${report.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Source: ${report.source.host}/${report.source.database}`);
  console.log(
    `Target: ${report.target.host}/${report.target.database} (scratch database: ${report.scratchDatabase})`,
  );
  console.log(`Elapsed: ${report.elapsedMs}ms`);
  if (report.missingTables?.length) {
    console.log(`Missing tables in target: ${report.missingTables.join(', ')}`);
  }
  for (const [table, result] of Object.entries(report.counts ?? {})) {
    console.log(
      `  ${table}: source=${result.source} target=${result.target} ${result.match ? 'match' : 'MISMATCH'}`,
    );
  }
  if (report.ledger) {
    console.log(
      `  ${report.ledger.table}: source=${report.ledger.source} target=${report.ledger.target} ${report.ledger.match ? 'match' : 'MISMATCH'}`,
    );
  }
}

async function main() {
  const config = loadConfigFromEnv();
  const report = await runLogicalRestoreDrill({
    ...config,
    spawnImpl: defaultSpawn,
    createClient: defaultCreateClient,
  });
  printReport(report);
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
