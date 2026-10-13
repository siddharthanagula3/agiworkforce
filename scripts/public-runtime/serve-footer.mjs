import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PublicRuntimeContainers } from './containers.mjs';
import { digest, PROOF_VERSION } from './proof.mjs';

const artifactFile = process.env.PUBLIC_RUNTIME_PROOF_ARTIFACT;
if (!artifactFile) throw new Error('The footer server requires a completed runtime artifact');
const artifact = JSON.parse(await readFile(artifactFile, 'utf8'));
if (
  artifact.version !== PROOF_VERSION ||
  artifact.scope !== 'full' ||
  artifact.revision !== process.env.GITHUB_SHA ||
  digest(artifact.fixtures) !== artifact.fixtureDigest ||
  artifact.snapshot?.filename !== 'template.dump' ||
  Date.parse(artifact.fixtures.expiresAt) <= Date.now()
)
  throw new Error('Footer runtime evidence is stale or invalid');
const runtime = new PublicRuntimeContainers({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  image: artifact.imageId,
  postgresImage: artifact.postgresImageId,
  fixtures: artifact.fixtures,
  revision: artifact.revision,
  snapshot: artifact.snapshot,
  snapshotFile: path.join(path.dirname(artifactFile), artifact.snapshot.filename),
});
let handle;
try {
  await runtime.initialize();
  if (runtime.buildId !== artifact.buildId || runtime.migrationDigest !== artifact.migrationDigest)
    throw new Error('Footer server does not match the observed build');
  handle = await runtime.startCase(
    { stateId: 'footer', pattern: '/', path: '/' },
    { visual: true },
  );
  process.stdout.write(`Public footer runtime ready at ${handle.origin}\n`);
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
  });
  await runtime.finishVisual(handle);
} finally {
  await runtime.close();
}
