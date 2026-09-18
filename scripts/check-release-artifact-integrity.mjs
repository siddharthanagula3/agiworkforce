#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WORKFLOWS_DIR = '.github/workflows';

// Producing a checksum proves nothing on its own: the file travels through an
// artifact store between the job that made it and the job that publishes it, so
// the publishing side has to check it.
const VERIFIES_CHECKSUM = [
  /sha256sum\s+(?:--check|-c)\b/,
  /shasum\s+[^\n]*\s-c\b/,
  /cosign\s+verify-blob\b/,
  /Get-FileHash[^\n]*-eq/,
];

/**
 * Release surfaces that publish an artifact no step in this repo verifies. Each
 * entry says what stands in for the check, so the list is a decision rather
 * than a backlog nobody reads.
 */
export const UNVERIFIED_RELEASE_SURFACES = new Map([
  [
    'release-mobile.yml',
    'the binary is signed and its integrity enforced by the App Store and Play Store, which re-sign every build they accept',
  ],
]);

export function releaseWorkflows(root) {
  return fs
    .readdirSync(path.join(root, WORKFLOWS_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^release-.+\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function unverifiedReleaseArtifacts(root) {
  const failures = [];
  const workflows = releaseWorkflows(root);

  for (const filename of workflows) {
    const source = fs.readFileSync(path.join(root, WORKFLOWS_DIR, filename), 'utf8');
    const verifies = VERIFIES_CHECKSUM.some((pattern) => pattern.test(source));
    const waived = UNVERIFIED_RELEASE_SURFACES.get(filename);

    if (verifies && waived) {
      failures.push(
        `${WORKFLOWS_DIR}/${filename} now verifies a checksum before publishing. Remove it from ` +
          `UNVERIFIED_RELEASE_SURFACES.`,
      );
      continue;
    }
    if (!verifies && !waived) {
      failures.push(
        `${WORKFLOWS_DIR}/${filename} publishes an artifact without checking a checksum or a ` +
          `signature over it. Verify it where it is published, or record in ` +
          `UNVERIFIED_RELEASE_SURFACES what enforces integrity instead.`,
      );
    }
  }

  return failures;
}

export function staleReleaseWaivers(root) {
  const workflows = releaseWorkflows(root);
  return [...UNVERIFIED_RELEASE_SURFACES.keys()]
    .filter((filename) => !workflows.includes(filename))
    .map(
      (filename) =>
        `UNVERIFIED_RELEASE_SURFACES names ${WORKFLOWS_DIR}/${filename}, which does not exist.`,
    );
}

function main() {
  const failures = [
    ...unverifiedReleaseArtifacts(process.cwd()),
    ...staleReleaseWaivers(process.cwd()),
  ];
  if (failures.length > 0) {
    console.error('Release artifact integrity check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Release artifact integrity check passed.');
}

function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const realpath = (value) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return value;
    }
  };
  return realpath(fileURLToPath(import.meta.url)) === realpath(path.resolve(entry));
}

if (isEntryPoint()) main();
