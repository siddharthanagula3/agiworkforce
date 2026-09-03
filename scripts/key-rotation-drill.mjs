#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { openEnvelope, loadKeyRing } from '../apps/web/lib/crypto/envelope.ts';
import { REENCRYPT_TARGETS, reencryptTarget } from './reencrypt.mjs';
import {
  createDrillBranch,
  deleteDrillBranch,
  waitUntilQueryable,
} from './lib/neon-branch-api.mjs';

const BRANCH_NAME_PREFIX = 'drill-rotation';
const DEFAULT_SAMPLE_SIZE = 5;

export function parseArgs(argv) {
  const args = {
    target: null,
    sample: DEFAULT_SAMPLE_SIZE,
    keep: false,
    project: process.env.NEON_PROJECT_ID,
  };
  for (const arg of argv) {
    if (arg === '--keep') args.keep = true;
    else if (arg.startsWith('--target=')) args.target = arg.slice('--target='.length);
    else if (arg.startsWith('--sample=')) args.sample = Number(arg.slice('--sample='.length));
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.target) {
    throw new Error(
      `--target=<name> is required. Known targets: ${Object.keys(REENCRYPT_TARGETS).join(', ')}, all`,
    );
  }
  if (args.target !== 'all' && !REENCRYPT_TARGETS[args.target]) {
    throw new Error(`Unknown target "${args.target}"`);
  }
  if (!Number.isInteger(args.sample) || args.sample < 1) {
    throw new Error('--sample must be a positive integer');
  }
  return args;
}

async function sampleDecrypt({ query, target, ring, sampleSize }) {
  const columns = [target.idColumn, ...target.secretColumns].join(', ');
  const rows = await query(
    `select ${columns} from ${target.table} where ${target.keyVersionColumn} = $1 order by random() limit $2`,
    [ring.active.id, sampleSize],
  );

  let checked = 0;
  let failed = 0;
  for (const row of rows) {
    for (const column of target.secretColumns) {
      const value = row[column];
      if (value === null || value === undefined || value === '') continue;
      checked += 1;
      try {
        const opened = openEnvelope(ring, value, target.legacyLayout);
        if (opened.keyId !== ring.active.id) failed += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { checked, failed };
}

export async function runRotationDrill({
  targetName,
  apiKey,
  projectId,
  sampleSize = DEFAULT_SAMPLE_SIZE,
  keep = false,
  fetchImpl = fetch,
  buildQueryImpl,
  loadRing = (target) => loadKeyRing(target.keyEnv, { encoding: target.keyEncoding }),
  onRetry = () => {},
}) {
  if (!apiKey) throw new Error('NEON_API_KEY is not set');
  if (!projectId) throw new Error('NEON_PROJECT_ID is not set');

  const names = targetName === 'all' ? Object.keys(REENCRYPT_TARGETS) : [targetName];

  const { branchId, connectionUri } = await createDrillBranch({
    apiKey,
    projectId,
    name: `${BRANCH_NAME_PREFIX}-${Date.now()}`,
    fetchImpl,
  });

  const report = { branchId, kept: keep, targets: {} };

  try {
    const query = buildQueryImpl(connectionUri);
    await waitUntilQueryable(query, { onRetry });

    for (const name of names) {
      const target = REENCRYPT_TARGETS[name];
      const ring = loadRing(target);
      const sweep = await reencryptTarget({ target, ring, client: { query }, apply: true });
      const sample = await sampleDecrypt({ query, target, ring, sampleSize });
      report.targets[name] = { ...sweep, sample };
    }
  } finally {
    if (!keep) {
      await deleteDrillBranch({ apiKey, projectId, branchId, fetchImpl });
    }
  }

  return report;
}

function printReport(report) {
  console.log(
    `Key rotation drill on branch ${report.branchId}${report.kept ? ' (kept)' : ' (deleted)'}`,
  );
  for (const [name, outcome] of Object.entries(report.targets)) {
    console.log(
      `  ${name}: scanned=${outcome.scanned} rewritten=${outcome.rewritten} ` +
        `stamped=${outcome.stamped} plaintext=${outcome.plaintext} ` +
        `sample=${outcome.sample.checked - outcome.sample.failed}/${outcome.sample.checked} decrypted`,
    );
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const apiKey = process.env.NEON_API_KEY;

  const report = await runRotationDrill({
    targetName: args.target,
    sampleSize: args.sample,
    keep: args.keep,
    apiKey,
    projectId: args.project,
    buildQueryImpl: (connectionUri) => {
      const promise = import('@neondatabase/serverless').then(({ neon }) => neon(connectionUri));
      return async (text, params) => (await promise).query(text, params);
    },
    onRetry: (attempt) => console.log(`Branch not queryable yet, retry ${attempt}...`),
  });

  printReport(report);

  const anyFailure = Object.values(report.targets).some((outcome) => outcome.sample.failed > 0);
  if (anyFailure) {
    console.error('At least one sampled row failed to decrypt under the new key.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
