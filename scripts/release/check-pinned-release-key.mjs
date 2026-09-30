#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  pinnedReleaseKeyFailures,
  pinnedReleaseKeys,
} from '../lib/rollout/pinned-release-keys.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INSTALLER = 'apps/web/public/install.sh';

const source = readFileSync(path.join(REPO_ROOT, INSTALLER), 'utf8');
const failures = pinnedReleaseKeyFailures(source);

if (failures.length === 0) {
  console.log(`${INSTALLER} pins ${pinnedReleaseKeys(source).length} P-256 release signing key(s)`);
} else {
  for (const failure of failures) console.error(`ERROR: ${INSTALLER}: ${failure}`);
  console.error(
    'Pin the public half of the AGI_CLI_RELEASE_SIGNING_KEY secret in RELEASE_SIGNING_KEY, deploy the website, then tag the release.',
  );
  process.exit(1);
}
