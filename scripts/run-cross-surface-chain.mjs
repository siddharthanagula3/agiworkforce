#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { missingEnvironment, reportNotRun } from './lib/ci-prerequisites.mjs';

const SURFACE_CHAIN = '.github/cross-surface-e2e-chain.json';

const root = process.cwd();
const chain = JSON.parse(fs.readFileSync(path.join(root, SURFACE_CHAIN), 'utf8'));

/**
 * The chain writes conversations, projects, files and schedules, so it runs
 * against the QA enterprise tenant and against nothing else. Without those two
 * secrets there is no safe place to run it, and the honest report is the list
 * of steps that did not run and the action that would let them.
 */
export function tenantCredentials(env, chainSpec = chain) {
  const id = env[chainSpec.tenant.id]?.trim();
  const token = env[chainSpec.tenant.token]?.trim();
  return id && token ? { id, token } : null;
}

export function blockedExplanations(step, chainSpec = chain) {
  return (step.blockedBy ?? []).map((cause) =>
    cause === 'tenant'
      ? `no QA enterprise tenant (${chainSpec.tenant.id})`
      : (chainSpec.surfaces[step.surface]?.why ?? cause),
  );
}

function blockedStepsTable(chainSpec) {
  const lines = [
    `| # | Step | Surface | Why it did not run |`,
    `| - | ---- | ------- | ------------------ |`,
    ...chainSpec.steps.map(
      (step) =>
        `| ${step.order} | ${step.title} | ${step.surface} | ${blockedExplanations(step, chainSpec).join('; ')} |`,
    ),
  ];
  return lines.join('\n');
}

function runStep(step, env, spawnImpl) {
  console.log(`\n== ${step.order}. ${step.title} (${step.surface})`);
  const result = spawnImpl('bash', ['-lc', step.command], { env, stdio: 'inherit' });
  return result.status === 0;
}

export function runChain({
  env = process.env,
  chainSpec = chain,
  spawnImpl = spawnSync,
  report = reportNotRun,
} = {}) {
  const credentials = tenantCredentials(env, chainSpec);
  if (!credentials) {
    const missing = missingEnvironment([chainSpec.tenant.id, chainSpec.tenant.token], env);
    report(
      {
        title: 'Cross-surface E2E chain',
        reason: `Missing repository secrets: ${missing.join(', ')}. 0 of ${chainSpec.steps.length} §110 steps executed.`,
        unblockedBy: chainSpec.tenant.unblockedBy,
        flawId: 'CI-CROSS-SURFACE-TENANT-MISSING-01',
        details: blockedStepsTable(chainSpec),
      },
      { env },
    );
    return 0;
  }

  const runnable = chainSpec.steps.filter((step) => step.status === 'covered');
  if (runnable.length === 0) {
    console.error(
      `The tenant credentials are set, but every §110 step is still marked blocked in ` +
        `${SURFACE_CHAIN}. Move a step to "covered" with the spec that runs it.`,
    );
    return 1;
  }

  const failed = runnable.filter((step) => !runStep(step, env, spawnImpl));
  console.log(
    `\n${runnable.length - failed.length} of ${chainSpec.steps.length} §110 steps passed, ` +
      `${chainSpec.steps.length - runnable.length} still blocked.`,
  );
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = runChain();
