import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { authorityQueries } from '../../../../scripts/public-runtime/database-authority.mjs';
import {
  digest,
  PROOF_VERSION,
  validateRuntimeProof,
  matchDocumentProof,
  validateRawReceipt,
} from '../../../../scripts/public-runtime/proof.mjs';
import type { PublicRuntimeFixtures } from './public-runtime-fixtures';
import type { PublicRuntimeCase } from './public-runtime-cases';

export function loadPublicRuntimeArtifact(filename: string | undefined) {
  if (!filename) throw new Error('The public matrix requires completed cold runtime evidence');
  const artifact = JSON.parse(readFileSync(filename, 'utf8'));
  if (
    artifact.version !== PROOF_VERSION ||
    artifact.scope !== 'full' ||
    !/^[a-f0-9]{40}$/.test(artifact.revision) ||
    artifact.revision !== process.env['GITHUB_SHA'] ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.imageId) ||
    typeof artifact.buildId !== 'string' ||
    !artifact.buildId ||
    !/^[a-f0-9]{24}$/.test(artifact.runId) ||
    !artifact.fixtures ||
    digest(artifact.fixtures) !== artifact.fixtureDigest ||
    !Number.isFinite(Date.parse(artifact.fixtures.expiresAt)) ||
    Date.parse(artifact.fixtures.expiresAt) <= Date.now() ||
    !Array.isArray(artifact.proofs) ||
    !artifact.proofs.length ||
    new Set(artifact.proofs.map((proof: { stateId: string }) => proof.stateId)).size !==
      artifact.proofs.length
  ) {
    throw new Error(
      'Cold runtime evidence is absent, stale, duplicated or bound to a different build',
    );
  }
  for (const proof of artifact.proofs) {
    if (
      !/^[a-f0-9]{64}$/.test(proof.stateId) ||
      proof.evidence?.filename !== `evidence/${proof.stateId}.json.gz`
    )
      throw new Error('Raw execution evidence is missing or has an unsafe path');
    const archive = readFileSync(path.join(path.dirname(filename), proof.evidence.filename));
    if (archive.byteLength > 64 * 1024 * 1024)
      throw new Error('Raw execution evidence archive exceeds the case budget');
    if (digest(archive) !== proof.evidence.digest)
      throw new Error('Raw execution evidence archive changed');
    const receipt = JSON.parse(
      gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8'),
    );
    validateRawReceipt(receipt, proof, authorityQueries(artifact.runId));
  }
  return { ...artifact, fixtures: artifact.fixtures as PublicRuntimeFixtures };
}

export function runtimeWitness(
  artifact: ReturnType<typeof loadPublicRuntimeArtifact>,
  route: PublicRuntimeCase,
) {
  if (Date.parse(artifact.fixtures.expiresAt) <= Date.now())
    throw new Error('Public runtime fixture evidence expired');
  const expected = {
    ...route,
    runId: artifact.runId,
    revision: artifact.revision,
    imageId: artifact.imageId,
    buildId: artifact.buildId,
    fixtureDigest: artifact.fixtureDigest,
    migrationDigest: artifact.migrationDigest,
  };
  const matches = artifact.proofs.filter(
    (proof: { stateId: string }) => proof.stateId === route.stateId,
  );
  if (matches.length !== 1) throw new Error(`No unique cold runtime witness for ${route.path}`);
  return { proof: validateRuntimeProof(matches[0], expected), expected };
}

export function assertRuntimeInputMatch(
  artifact: ReturnType<typeof loadPublicRuntimeArtifact>,
  route: PublicRuntimeCase,
  evidence: { document: unknown; clientExecution: { url: string; scriptDigest: string } | null },
) {
  const { proof, expected } = runtimeWitness(artifact, route);
  if (
    route.executionRequired &&
    route.renderRuntime === 'browser' &&
    !proof.observer.clientChunks.some(
      (chunk: { url: string; digest: string }) =>
        chunk.url === evidence.clientExecution?.url &&
        chunk.digest === evidence.clientExecution.scriptDigest,
    )
  ) {
    throw new Error('Visual client execution differs from the immutable witnessed build');
  }
  return matchDocumentProof(proof, evidence.document, expected);
}
