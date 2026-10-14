import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicRuntimeContainers } from './containers.mjs';
import { PROOF_LABEL } from './proof.mjs';

export async function assertNoUnrecordedResources(docker) {
  const containers = await docker([
    'ps',
    '--all',
    '--no-trunc',
    '--filter',
    `label=${PROOF_LABEL}`,
    '--format',
    '{{.ID}}',
  ]);
  const volumes = await docker([
    'volume',
    'ls',
    '--filter',
    `label=${PROOF_LABEL}`,
    '--format',
    '{{.Name}}',
  ]);
  if (containers.trim() || volumes.trim())
    throw new Error(
      'Unmatched proof-labelled Docker resources remain; refusing deletion without recorded ownership',
    );
}

export function restoreOwnership(harness, record) {
  if (!Number.isSafeInteger(record.producerPid) || record.producerPid <= 0)
    throw new Error('Invalid runtime cleanup producer identity');
  if (
    record.revision !== harness.revision ||
    !/^[a-f0-9]{24}$/.test(record.runId) ||
    !Array.isArray(record.containers) ||
    !Array.isArray(record.volumes)
  )
    throw new Error('Invalid runtime cleanup ledger');
  const prefix = `agi-public-${record.runId}-`;
  if (
    record.containers.some(
      ([name, owner]) =>
        typeof name !== 'string' ||
        !name.startsWith(prefix) ||
        !/^[a-f0-9]{64}$/.test(owner?.id) ||
        !/^sha256:[a-f0-9]{64}$/.test(owner?.image),
    ) ||
    record.volumes.some((name) => typeof name !== 'string' || !name.startsWith(prefix)) ||
    new Set(record.containers.map(([name]) => name)).size !== record.containers.length ||
    new Set(record.volumes).size !== record.volumes.length
  )
    throw new Error('Cleanup ledger contains an unverified owner');
  harness.producerPid = record.producerPid;
  harness.runId = record.runId;
  harness.names = new Map(record.containers);
  harness.volumes = new Set(record.volumes);
}

export async function cleanupLedger(harness, ledger, { timeoutMs = 30_000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000)
    throw new Error('Invalid producer shutdown deadline');
  const readRecord = async () => {
    try {
      return JSON.parse(await readFile(ledger, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const initial = await readRecord();
  if (!initial) return;
  if (path.basename(ledger) !== `${initial.runId}.json`)
    throw new Error('Cleanup ledger identity changed');
  restoreOwnership(harness, initial);
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(initial.producerPid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') break;
      throw new Error('Runtime cleanup producer liveness is unknown', { cause: error });
    }
    if (performance.now() >= deadline)
      throw new Error(`Runtime cleanup producer ${initial.producerPid} is still alive`);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(100, deadline - performance.now())),
    );
  }
  const final = await readRecord();
  if (!final) return;
  if (final.runId !== initial.runId || final.producerPid !== initial.producerPid)
    throw new Error('Runtime cleanup producer identity changed');
  restoreOwnership(harness, final);
  harness.producerPid = process.pid;
  harness.lifecycleFile = ledger;
  await harness.persistOwnership();
  await harness.close();
}

if (process.argv[1]?.endsWith('/cleanup.mjs')) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const directory = path.join(root, 'apps/web/.cache/public-runtime-lifecycle');
  let files;
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    files = [];
  }
  for (const filename of files.filter((name) => /^[a-f0-9]{24}\.json$/.test(name))) {
    const ledger = path.join(directory, filename);
    const harness = new PublicRuntimeContainers({
      root,
      revision: process.env.GITHUB_SHA,
      fixtures: {},
    });
    await cleanupLedger(harness, ledger);
  }
  const inventory = new PublicRuntimeContainers({
    root,
    revision: process.env.GITHUB_SHA,
    fixtures: {},
  });
  await assertNoUnrecordedResources((args) => inventory.docker(args));
}
