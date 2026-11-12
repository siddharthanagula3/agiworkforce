#!/usr/bin/env node

import { createPublicKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  pinnedReleaseKeyFailures,
  pinnedReleaseKeys,
  releaseSigningKeyAssignment,
} from '../lib/rollout/pinned-release-keys.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const INSTALLER = 'apps/web/public/install.sh';
const SIGNING_KEY_LINE = /^RELEASE_SIGNING_KEY='[^']*'$/mu;

function normalizedPublicKey(pem) {
  return createPublicKey(pem).export({ type: 'spki', format: 'pem' }).trim();
}

export function pinReleaseKey(installerSource, publicKeyPem) {
  if (releaseSigningKeyAssignment(installerSource) === null) {
    throw new Error(`${INSTALLER} has no RELEASE_SIGNING_KEY='...' assignment to pin a key in`);
  }
  const key = normalizedPublicKey(publicKeyPem);
  const pinned = pinnedReleaseKeys(installerSource).map(normalizedPublicKey);
  if (pinned.includes(key)) return { source: installerSource, added: false };
  const value = [...pinned, key].join('\n');
  const source = installerSource.replace(SIGNING_KEY_LINE, () => `RELEASE_SIGNING_KEY='${value}'`);
  const failures = pinnedReleaseKeyFailures(source);
  if (failures.length > 0) throw new Error(failures.join('; '));
  return { source, added: true };
}

export function exportPinnedReleaseKeys(installerSource, directory) {
  mkdirSync(directory, { recursive: true });
  const keys = pinnedReleaseKeys(installerSource);
  keys.forEach((pem, index) => {
    writeFileSync(path.join(directory, `${index + 1}.pem`), `${pem}\n`);
  });
  return keys.length;
}

function main(argv) {
  const [command, argument, installerPath = path.join(REPO_ROOT, INSTALLER)] = argv;
  if (command === 'pin' && argument) {
    const { source, added } = pinReleaseKey(
      readFileSync(installerPath, 'utf8'),
      readFileSync(argument, 'utf8'),
    );
    if (added) writeFileSync(installerPath, source);
    console.log(
      `${added ? 'Pinned' : 'Already pinned'}: ${pinnedReleaseKeys(source).length} release signing key(s) in ${installerPath}`,
    );
    return 0;
  }
  if (command === 'export' && argument) {
    const count = exportPinnedReleaseKeys(readFileSync(installerPath, 'utf8'), argument);
    console.log(`Wrote ${count} pinned release signing key(s) to ${argument}`);
    return 0;
  }
  console.error(
    'Usage: node scripts/release/release-signing-key.mjs pin <public-key.pem> [install.sh]\n' +
      '       node scripts/release/release-signing-key.mjs export <directory> [install.sh]',
  );
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
