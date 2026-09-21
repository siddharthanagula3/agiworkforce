#!/usr/bin/env node

// The platform safety floor for managed generation: the classifier's policy
// vocabulary, the prompt classified before a job exists, and the bytes screened
// before they enter the library. Subjects are taken from the job creators and
// from the AI-generated provenance stamp, so removing a control shows up as an
// unanswered subject rather than as a shorter list.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BASELINE_FILE, audit } from './lib/managed-safety-floor.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function main() {
  const rootIndex = process.argv.indexOf('--root');
  const repoRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : REPO_ROOT;

  const baselinePath = path.join(repoRoot, BASELINE_FILE);
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { unscreened: {} };

  const verdict = audit(repoRoot, baseline);
  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  for (const key of verdict.baseline?.fixed ?? []) {
    process.stdout.write(
      `FAIL ${key} now screens its output; remove it from ${BASELINE_FILE} so it cannot regress\n`,
    );
  }

  const screened = verdict.delivery.filter((subject) => subject.screened).length;
  process.stdout.write(
    `[managed safety floor] ${verdict.admission.length} generation entry points, ` +
      `${verdict.admission.filter((subject) => subject.gatedBeforeDispatch).length} classifying the prompt first; ` +
      `${verdict.delivery.length} delivery paths, ${screened} screening the output\n`,
  );

  const clean = verdict.problems.length === 0 && (verdict.baseline?.fixed.length ?? 0) === 0;
  process.exitCode = clean ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
