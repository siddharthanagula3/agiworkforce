#!/usr/bin/env node
/**
 * Every corpus is gated on its own floor. This refuses a suite with no
 * threshold, a threshold of zero, and a hard gate anything is allowed to
 * average away.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { scoreDropFor } from '../tools/evals/scripts/promotion-gate.mjs';
import {
  auditGatePolicy,
  corpora,
  GATE_POLICY_FILE,
  PROMOTION_GATE_FILE,
  toleranceKeysRead,
} from './lib/eval-gate-policy.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GATE_POLICY_FILE), 'utf8'));
  const toleranceKeys = toleranceKeysRead(
    fs.readFileSync(path.join(REPO_ROOT, PROMOTION_GATE_FILE), 'utf8'),
  );
  const verdict = auditGatePolicy({
    suites: corpora(REPO_ROOT),
    policy,
    toleranceKeys,
    scoreDropFor,
  });

  for (const problem of verdict.problems) process.stdout.write(`FAIL ${problem}\n`);
  process.stdout.write(
    `[evals gate] ${verdict.gated} corpora gated, ${verdict.hardGates} of them hard gates, ${toleranceKeys.length} tolerances declared\n`,
  );
  process.exitCode = verdict.passed ? 0 : 1;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) main();
