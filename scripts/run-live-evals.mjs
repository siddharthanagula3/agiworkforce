#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { missingEnvironment, reportNotRun } from './lib/ci-prerequisites.mjs';

export function runLiveEvals({
  env = process.env,
  spawnImpl = spawnSync,
  report = reportNotRun,
} = {}) {
  const missing = missingEnvironment(['ANTHROPIC_API_KEY'], env);
  if (missing.length > 0) {
    report(
      {
        title: 'Live model quality',
        reason: `Missing repository secret: ${missing.join(', ')}. No live corpus was measured.`,
        unblockedBy: 'Add a funded ANTHROPIC_API_KEY repository secret and rerun this workflow.',
        flawId: 'CI-LIVE-EVAL-CREDENTIAL-MISSING-01',
      },
      { env },
    );
    return 0;
  }

  const result = spawnImpl('pnpm', ['exec', 'vitest', 'run', 'tools/evals'], {
    env: { ...env, AGIWORKFORCE_LIVE_TEST: '1' },
    stdio: 'inherit',
  });
  if (result.error) console.error(`Cannot start the live eval runner: ${result.error.message}`);
  return result.status ?? 1;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = runLiveEvals();
