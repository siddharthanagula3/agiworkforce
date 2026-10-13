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
  harness.runId = record.runId;
  harness.names = new Map(record.containers);
  harness.volumes = new Set(record.volumes);
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
    const record = JSON.parse(await readFile(ledger, 'utf8'));
    if (filename !== `${record.runId}.json`) throw new Error('Cleanup ledger identity changed');
    const harness = new PublicRuntimeContainers({
      root,
      revision: process.env.GITHUB_SHA,
      fixtures: {},
    });
    restoreOwnership(harness, record);
    harness.lifecycleFile = ledger;
    await harness.close();
  }
  const inventory = new PublicRuntimeContainers({
    root,
    revision: process.env.GITHUB_SHA,
    fixtures: {},
  });
  await assertNoUnrecordedResources((args) => inventory.docker(args));
}
