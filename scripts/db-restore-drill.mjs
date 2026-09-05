#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  createDrillBranch,
  deleteDrillBranch,
  waitUntilQueryable,
} from './lib/neon-branch-api.mjs';
import { CORE_TABLES, countTableRows } from './lib/restore-drill-core.mjs';

export { CORE_TABLES };

const BRANCH_NAME_PREFIX = 'drill-restore';

export function parseArgs(argv) {
  const args = { at: null, keep: false, project: process.env.NEON_PROJECT_ID };
  for (const arg of argv) {
    if (arg === '--keep') args.keep = true;
    else if (arg.startsWith('--at=')) args.at = arg.slice('--at='.length);
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.at) {
    throw new Error('--at=<ISO 8601 timestamp> is required, e.g. --at=2026-08-30T00:00:00Z');
  }
  if (Number.isNaN(Date.parse(args.at))) {
    throw new Error(`--at is not a valid timestamp: ${args.at}`);
  }
  return args;
}

export async function runRestoreDrill({
  at,
  keep = false,
  apiKey,
  projectId,
  fetchImpl = fetch,
  buildQueryImpl,
  tables = CORE_TABLES,
  onRetry = () => {},
}) {
  if (!apiKey) throw new Error('NEON_API_KEY is not set');
  if (!projectId) throw new Error('NEON_PROJECT_ID is not set');

  const { branchId, connectionUri } = await createDrillBranch({
    apiKey,
    projectId,
    name: `${BRANCH_NAME_PREFIX}-${Date.now()}`,
    parentTimestamp: at,
    fetchImpl,
  });

  const report = { branchId, recoveryPoint: at, tables: {}, kept: keep };

  try {
    const query = buildQueryImpl(connectionUri);
    await waitUntilQueryable(query, { onRetry });

    for (const table of tables) {
      report.tables[table] = await countTableRows(query, table);
    }
  } finally {
    if (!keep) {
      await deleteDrillBranch({ apiKey, projectId, branchId, fetchImpl });
    }
  }

  return report;
}

function printReport(report) {
  console.log(`Restore drill against recovery point ${report.recoveryPoint}`);
  console.log(`Branch: ${report.branchId}${report.kept ? ' (kept)' : ' (deleted)'}`);
  for (const [table, count] of Object.entries(report.tables)) {
    console.log(`  ${table}: ${count} rows`);
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const apiKey = process.env.NEON_API_KEY;
  const projectId = args.project;

  const report = await runRestoreDrill({
    at: args.at,
    keep: args.keep,
    apiKey,
    projectId,
    buildQueryImpl: (connectionUri) => {
      const promise = import('@neondatabase/serverless').then(({ neon }) => neon(connectionUri));
      return async (text, params) => (await promise).query(text, params);
    },
    onRetry: (attempt) => console.log(`Branch not queryable yet, retry ${attempt}...`),
  });

  printReport(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
