#!/usr/bin/env node
/**
 * A published prompt version's hash never changes. Checked against the commit,
 * because editing the text and its recorded digest together passes every test
 * that only compares the two to each other.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  auditAppendOnly,
  committedLock,
  digestsOf,
  LOCK_FILE,
} from './lib/prompt-versions-append-only.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const revisionFlag = process.argv.indexOf('--base');
  const revision = revisionFlag === -1 ? 'HEAD' : process.argv[revisionFlag + 1];
  const committed = committedLock(REPO_ROOT, revision);

  if (committed === null) {
    process.stdout.write(
      `[prompt versions] ${LOCK_FILE} is not in ${revision}; nothing published yet to hold it to\n`,
    );
    return;
  }

  const current = digestsOf(fs.readFileSync(path.join(REPO_ROOT, LOCK_FILE), 'utf8'));
  const verdict = auditAppendOnly(digestsOf(committed), current);

  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  process.stdout.write(
    `[prompt versions] ${verdict.published} published in ${revision}, ${verdict.added} added since, 0 rewritten allowed\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
