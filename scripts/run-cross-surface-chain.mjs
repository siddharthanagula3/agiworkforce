#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SURFACE_CHAIN = '.github/cross-surface-e2e-chain.json';

const root = process.cwd();
const chain = JSON.parse(fs.readFileSync(path.join(root, SURFACE_CHAIN), 'utf8'));

/**
 * The chain writes conversations, projects, files and schedules, so it runs
 * against the QA enterprise tenant and against nothing else. Without those two
 * secrets there is no safe place to run it, and the honest report is the list
 * of steps that did not run and the action that would let them.
 */
export function tenantCredentials(env) {
  const id = env[chain.tenant.id]?.trim();
  const token = env[chain.tenant.token]?.trim();
  return id && token ? { id, token } : null;
}

export function blockedExplanations(step) {
  return (step.blockedBy ?? []).map((cause) =>
    cause === 'tenant'
      ? `no QA enterprise tenant (${chain.tenant.id})`
      : (chain.surfaces[step.surface]?.why ?? cause),
  );
}

function reportNotRun(reason) {
  const lines = [
    `# Cross-surface E2E chain: not run`,
    '',
    reason,
    '',
    `| # | Step | Surface | Why it did not run |`,
    `| - | ---- | ------- | ------------------ |`,
    ...chain.steps.map(
      (step) =>
        `| ${step.order} | ${step.title} | ${step.surface} | ${blockedExplanations(step).join('; ')} |`,
    ),
    '',
    chain.tenant.unblockedBy,
  ];
  return lines.join('\n');
}

function writeSummary(body) {
  console.log(body);
  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) fs.appendFileSync(summaryPath, `${body}\n`);
}

function runStep(step) {
  console.log(`\n== ${step.order}. ${step.title} (${step.surface})`);
  const result = spawnSync('bash', ['-lc', step.command], { stdio: 'inherit' });
  return result.status === 0;
}

function main() {
  const credentials = tenantCredentials(process.env);
  if (!credentials) {
    writeSummary(
      reportNotRun(
        `\`${chain.tenant.id}\` and \`${chain.tenant.token}\` are not set, so no step ran. ` +
          `Nothing below was tested; this is a gap, not a pass.`,
      ),
    );
    console.error(
      `\nCross-surface chain did not run: ${chain.tenant.unblockedBy}\n` +
        `0 of ${chain.steps.length} §110 steps executed.`,
    );
    process.exit(process.env['AGI_CHAIN_REPORT_ONLY'] === '1' ? 0 : 1);
  }

  const runnable = chain.steps.filter((step) => step.status === 'covered');
  if (runnable.length === 0) {
    console.error(
      `The tenant credentials are set, but every §110 step is still marked blocked in ` +
        `${SURFACE_CHAIN}. Move a step to "covered" with the spec that runs it.`,
    );
    process.exit(1);
  }

  const failed = runnable.filter((step) => !runStep(step));
  console.log(
    `\n${runnable.length - failed.length} of ${chain.steps.length} §110 steps passed, ` +
      `${chain.steps.length - runnable.length} still blocked.`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
