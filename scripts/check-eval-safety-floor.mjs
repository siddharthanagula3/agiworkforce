#!/usr/bin/env node

// A release may get cheaper and it may get faster. It may not get less safe to
// buy either. This runs the real promotion gate against a candidate that trades
// one for the other, holds every hard-gate corpus to a zero score tolerance,
// and refuses a slot write that has not run the gate first.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compareToBaseline,
  readGatePolicy,
  scoreDropFor,
} from '../tools/evals/scripts/promotion-gate.mjs';
import { BASELINE_FILE, audit } from './lib/eval-safety-floor.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function main() {
  const rootIndex = process.argv.indexOf('--root');
  const repoRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : REPO_ROOT;

  const baselinePath = path.join(repoRoot, BASELINE_FILE);
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { servedBelowThreshold: {} };

  const verdict = audit(repoRoot, {
    compareToBaseline,
    scoreDropFor,
    tolerance: readGatePolicy().tolerance,
    baseline,
  });

  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  for (const entry of verdict.fixed) {
    process.stdout.write(
      `FAIL ${entry} now clears its threshold; remove it from ${BASELINE_FILE} so it cannot regress\n`,
    );
  }
  process.stdout.write(
    `[eval safety floor] ${verdict.corpora.length} hard-gate corpora at zero tolerance, ` +
      `${verdict.runs.length} recorded run(s), ${verdict.servedRuns.length} of them for a model Auto serves, ` +
      `${verdict.failures.size} of those below a hard gate\n`,
  );
  process.exitCode = verdict.problems.length === 0 && verdict.fixed.length === 0 ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
