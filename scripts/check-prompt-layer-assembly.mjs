#!/usr/bin/env node
/**
 * One resolver decides which instruction wins. This enumerates the files that
 * assemble a system message and refuses a new one that decides for itself.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  assemblySites,
  auditAssembly,
  readBaseline,
  BASELINE_FILE,
} from './lib/prompt-layer-assembly.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const sites = assemblySites(REPO_ROOT);
  if (sites.length === 0) {
    process.stdout.write(
      'FAIL no file assembles a system message; the scan roots moved and this check is measuring nothing\n',
    );
    process.exitCode = 1;
    return;
  }

  const verdict = auditAssembly(sites, readBaseline(REPO_ROOT));
  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  process.stdout.write(
    `[prompt layers] ${verdict.resolved} of ${verdict.total} system-message assemblers resolve the instruction layers, ${verdict.total - verdict.resolved} recorded in ${BASELINE_FILE}\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
