#!/usr/bin/env node

import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import {
  DEPLOYMENT_SURFACES,
  MIGRATION_TARGETS,
  MigrationContractError,
  applyMigrations,
  baselineMigrations,
  inspectMigrationState,
  loadMigrationInventory,
  readDeploymentRecords,
  recordDeployment,
  verifyMigrations,
} from './lib/neon-migrations.mjs';

const COMMANDS = new Set([
  'inventory',
  'status',
  'apply',
  'verify',
  'baseline',
  'record',
  'deployments',
]);
const TARGETS = new Set(MIGRATION_TARGETS);

export function parseCliArgs(argv) {
  const options = {
    command: null,
    target: process.env.AGI_MIGRATION_TARGET,
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
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (!argument.startsWith('-') && options.command === null) {
      options.command = argument;
    } else if (argument === '--target') {
      options.target = argv[++index];
    } else if (argument === '--through') {
      options.through = argv[++index];
    } else if (argument === '--reason') {
      options.reason = argv[++index];
    } else if (argument === '--evidence') {
      options.evidence = argv[++index];
    } else if (argument === '--surface') {
      options.surface = argv[++index];
    } else if (argument === '--commit') {
      options.commit = argv[++index];
    } else if (argument === '--deployment-ref') {
      options.deploymentRef = argv[++index];
    } else if (argument === '--limit') {
      options.limit = Number(argv[++index]);
    } else if (argument === '--confirm-baseline') {
      options.confirmBaseline = true;
    } else if (argument === '--confirm-production') {
      options.confirmProduction = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--help' || argument === '-h') {
      options.command = 'help';
    } else {
      throw new MigrationContractError(`Unknown argument: ${argument}`);
    }
  }
  options.command ??= 'status';
  return options;
}

function databaseUrl(env) {
  return env.AGI_DATABASE_URL ?? env.DATABASE_URL ?? env.NEON_DATABASE_URL;
}

function inferLocalTarget(connectionString) {
  const hostname = new URL(connectionString).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function assertMutationTarget(options, connectionString) {
  options.target ??= inferLocalTarget(connectionString) ? 'local' : undefined;
  if (!options.target || !TARGETS.has(options.target)) {
    throw new MigrationContractError(
      'Mutating commands require --target local|ci|branch|production (or AGI_MIGRATION_TARGET)',
    );
  }
  if (options.target === 'local' && !inferLocalTarget(connectionString)) {
    throw new MigrationContractError('--target local refuses a non-local database host');
  }
  if (options.target === 'production' && !options.confirmProduction) {
    throw new MigrationContractError('Production mutation requires --confirm-production');
  }
}

function printHelp() {
  console.log(`Usage:
  pnpm db:migrate -- inventory
  pnpm db:migrate -- status
  pnpm db:migrate -- apply --target local|ci|branch|production
  pnpm db:migrate -- verify
  pnpm db:migrate -- record --surface web|gateway --commit SHA \\
    --target local|ci|branch|production [--confirm-production] [--deployment-ref URL]
  pnpm db:migrate -- deployments [--surface web|gateway] [--limit N]
  pnpm db:migrate -- baseline --through N --reason TEXT --evidence TEXT \\
    --target branch|production --confirm-baseline [--confirm-production]

Connection precedence: AGI_DATABASE_URL, DATABASE_URL, NEON_DATABASE_URL.
The runner reads process.env only and never prints the connection string.`);
}

function reportState(state, options) {
  const payload = {
    applied: state.plan.applied.length,
    pending: state.plan.pending.length,
    drift: state.plan.drift,
    pendingFiles: state.plan.pending.map((migration) => migration.filename),
  };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(
      `migration state: ${payload.applied} applied, ${payload.pending} pending, ${payload.drift.length} drift`,
    );
    for (const filename of payload.pendingFiles) console.log(`- pending ${filename}`);
    for (const detail of payload.drift) console.log(`- drift ${detail}`);
  }
}

function reportDeploymentRecord(record, options) {
  if (options.json) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  console.log(
    `recorded ${record.surface} ${record.target} deployment ${record.commit_sha} at migration ` +
      `${record.head_filename} (${record.applied_count} applied, ledger ${record.ledger_digest.slice(0, 12)})`,
  );
}

function reportDeploymentHistory(records, options) {
  if (options.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (records.length === 0) {
    console.log('no migration deployment records');
    return;
  }
  for (const record of records) {
    console.log(
      `${new Date(record.verified_at).toISOString()} ${record.surface} ${record.target} ` +
        `${record.commit_sha} ${record.head_filename} (${record.applied_count} applied)`,
    );
  }
}

async function execute(argv = process.argv.slice(2), env = process.env) {
  const options = parseCliArgs(argv);
  if (options.command === 'help') {
    printHelp();
    return;
  }
  if (!COMMANDS.has(options.command)) {
    throw new MigrationContractError(`Unknown command: ${options.command}`);
  }

  const migrations = loadMigrationInventory();
  if (options.command === 'inventory') {
    const payload = {
      count: migrations.length,
      first: migrations[0].filename,
      latest: migrations.at(-1).filename,
    };
    if (options.json) console.log(JSON.stringify(payload, null, 2));
    else
      console.log(
        `migration inventory: ${payload.count} files (${payload.first}..${payload.latest})`,
      );
    return;
  }

  const connectionString = databaseUrl(env);
  if (!connectionString) {
    throw new MigrationContractError(
      'AGI_DATABASE_URL, DATABASE_URL, or NEON_DATABASE_URL must be exported',
    );
  }
  if (
    options.command === 'apply' ||
    options.command === 'baseline' ||
    options.command === 'record'
  ) {
    assertMutationTarget(options, connectionString);
  }
  if (options.command === 'baseline') {
    if (!options.confirmBaseline) {
      throw new MigrationContractError('Baseline requires --confirm-baseline');
    }
    if (!['branch', 'production'].includes(options.target)) {
      throw new MigrationContractError('Baseline is allowed only for --target branch|production');
    }
    if (!options.reason?.trim() || !options.evidence?.trim()) {
      throw new MigrationContractError('Baseline requires non-empty --reason and --evidence');
    }
  }

  const client = new Client({
    connectionString,
    application_name: 'agiworkforce-migration-runner',
  });
  await client.connect();
  try {
    if (options.command === 'status') {
      reportState(await inspectMigrationState(client, migrations), options);
      return;
    }
    if (options.command === 'verify') {
      const state = await verifyMigrations(client, migrations);
      reportState(state, options);
      return;
    }
    if (options.command === 'record') {
      const result = await recordDeployment(client, migrations, {
        surface: options.surface,
        target: options.target,
        commitSha: options.commit ?? env.GITHUB_SHA,
        deploymentRef: options.deploymentRef,
      });
      reportDeploymentRecord(result.record, options);
      return;
    }
    if (options.command === 'deployments') {
      if (options.surface !== undefined && !DEPLOYMENT_SURFACES.includes(options.surface)) {
        throw new MigrationContractError(
          `Unknown surface: ${options.surface} (expected ${DEPLOYMENT_SURFACES.join('|')})`,
        );
      }
      const records = await readDeploymentRecords(client, {
        surface: options.surface,
        limit: options.limit,
      });
      reportDeploymentHistory(records, options);
      return;
    }
    if (options.command === 'apply') {
      const result = await applyMigrations(client, migrations, { target: options.target });
      for (const migration of result.appliedNow) {
        console.log(`applied ${migration.filename} (${migration.durationMs}ms)`);
      }
      reportState(result, options);
      return;
    }
    const result = await baselineMigrations(client, migrations, {
      through: options.through,
      target: options.target,
      reason: options.reason.trim(),
      evidence: options.evidence.trim(),
    });
    console.log(`baselined ${result.baselined.length} migrations after schema verification`);
    reportState(result, options);
  } finally {
    await client.end();
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    await execute(argv, env);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof MigrationContractError) {
      for (const detail of error.details) console.error(`- ${detail}`);
    }
    return 1;
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = await main();
