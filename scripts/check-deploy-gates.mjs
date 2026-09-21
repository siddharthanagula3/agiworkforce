#!/usr/bin/env node

// A production promotion is only as safe as the gates it cannot skip. This
// reads the deploy workflow as YAML and proves, for every job in it that
// actually promotes something, that each declared gate is there and can fail
// the job. Prose in a runbook is not a gate.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { WORKFLOW_DIR, isDeployJob } from './check-workflow-hardening.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'scripts/config/deploy-gates.json';

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

export function readWorkflow(repoRoot, file) {
  return parse(readFileSync(path.join(repoRoot, WORKFLOW_DIR, file), 'utf8'));
}

function jobs(document) {
  const declared = document?.jobs;
  if (!declared || typeof declared !== 'object') return [];
  return Object.entries(declared).filter(([, job]) => job && typeof job === 'object');
}

function steps(job) {
  return Array.isArray(job?.steps)
    ? job.steps.filter((step) => step && typeof step === 'object')
    : [];
}

function needsOf(job) {
  const needs = job?.needs;
  if (typeof needs === 'string') return [needs];
  return Array.isArray(needs) ? needs.map(String) : [];
}

/** Every job the named one waits on, transitively. */
export function upstreamJobs(document, name, seen = new Set()) {
  const byName = new Map(jobs(document));
  for (const need of needsOf(byName.get(name))) {
    if (seen.has(need)) continue;
    seen.add(need);
    upstreamJobs(document, need, seen);
  }
  return seen;
}

/** The `if` of a job plus the `if` of everything it waits on. */
export function gateConditions(document, name) {
  const byName = new Map(jobs(document));
  const names = [name, ...upstreamJobs(document, name)];
  return names
    .map((jobName) => byName.get(jobName)?.if)
    .filter((condition) => typeof condition === 'string')
    .join('\n');
}

export function checkoutRefs(job) {
  return steps(job)
    .filter((step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'))
    .map((step) => step.with?.ref ?? null);
}

function stepByName(job, name) {
  return steps(job).find((step) => step.name === name) ?? null;
}

/** A step fails the job unless it is told not to. */
function stepCanFailTheJob(step) {
  return step['continue-on-error'] !== true;
}

function checkDeployingJobs({ document, contract, workflow, errors }) {
  const deploying = jobs(document).filter(([, job]) => isDeployJob(job));
  if (deploying.length === 0) {
    errors.push(
      `${workflow}: declares no job that promotes anything, so nothing below was checked.`,
    );
    return 0;
  }

  const group = document?.concurrency?.group ?? document?.concurrency;
  if (typeof group !== 'string') {
    errors.push(
      `${workflow}: declares no concurrency group, so two promotions of different commits can run ` +
        'against the same production target at once.',
    );
  } else if (document?.concurrency?.['cancel-in-progress'] === true) {
    errors.push(
      `${workflow}: cancels an in-progress promotion. A cancelled run is not a failed run, so the ` +
        'rollback step never fires and the rejected build stays promoted.',
    );
  }

  for (const [name, job] of deploying) {
    const conditions = gateConditions(document, name);
    for (const required of contract.requiredConditions) {
      if (!conditions.includes(required.expression)) {
        errors.push(
          `${workflow}:${name} promotes without ${required.expression} anywhere in its own ` +
            `condition or that of a job it waits on. ${required.why}`,
        );
      }
    }

    const refs = checkoutRefs(job);
    if (refs.length === 0) {
      errors.push(`${workflow}:${name} promotes without checking anything out.`);
    }
    for (const ref of refs) {
      if (ref !== contract.verifiedCommitRef) {
        errors.push(
          `${workflow}:${name} checks out ${ref ?? 'the default ref'} rather than ` +
            `${contract.verifiedCommitRef}, so it can promote a commit CI never verified.`,
        );
      }
    }

    const environment =
      typeof job.environment === 'string' ? job.environment : job.environment?.name;
    if (typeof environment !== 'string' || environment.length === 0) {
      errors.push(
        `${workflow}:${name} promotes without an environment, so no reviewer and no environment ` +
          'secret policy stands between a run and production.',
      );
    }
  }
  return deploying.length;
}

function checkRequiredSteps({ document, contract, workflow, errors }) {
  const byName = new Map(jobs(document));
  for (const gate of contract.gates) {
    const job = byName.get(gate.job);
    if (!job) {
      errors.push(`${workflow}: declares no job ${gate.job}, which is where ${gate.id} lives.`);
      continue;
    }
    const step = stepByName(job, gate.step);
    if (!step) {
      errors.push(`${workflow}:${gate.job} no longer has the step "${gate.step}". ${gate.why}`);
      continue;
    }
    if (!stepCanFailTheJob(step)) {
      errors.push(
        `${workflow}:${gate.job}: "${gate.step}" is continue-on-error, so it reports rather than ` +
          `gates. ${gate.why}`,
      );
    }
    const body = [step.run, step.uses, JSON.stringify(step.with ?? '')].filter(Boolean).join('\n');
    if (typeof gate.evidence === 'string' && !new RegExp(gate.evidence).test(body)) {
      errors.push(
        `${workflow}:${gate.job}: "${gate.step}" no longer matches ${gate.evidence}. ${gate.why}`,
      );
    }
    if (typeof gate.runsBefore === 'string') {
      const order = steps(job).map((entry) => entry.name);
      const here = order.indexOf(gate.step);
      const later = order.indexOf(gate.runsBefore);
      if (later === -1) {
        errors.push(`${workflow}:${gate.job} has no step "${gate.runsBefore}" for ${gate.id}.`);
      } else if (here > later) {
        errors.push(
          `${workflow}:${gate.job}: "${gate.step}" runs after "${gate.runsBefore}". ${gate.why}`,
        );
      }
    }
    if (typeof gate.why !== 'string' || gate.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: gate ${gate.id} carries no reason.`);
    }
  }
}

function checkRollback({ document, contract, workflow, errors }) {
  const byName = new Map(jobs(document));
  const job = byName.get(contract.rollback.job);
  if (!job) {
    errors.push(`${workflow}: declares no job ${contract.rollback.job} to roll back from.`);
    return;
  }
  const step = stepByName(job, contract.rollback.step);
  if (!step) {
    errors.push(
      `${workflow}:${contract.rollback.job} no longer has "${contract.rollback.step}", so a failed ` +
        'promotion leaves the bad build serving.',
    );
    return;
  }
  const condition = typeof step.if === 'string' ? step.if : '';
  if (!condition.includes('failure()')) {
    errors.push(
      `${workflow}:${contract.rollback.job}: "${contract.rollback.step}" does not run on failure(), ` +
        'so nothing reverts a promotion that failed its checks.',
    );
  }
}

export function checkDeployGates(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const workflow = contract.workflow;

  let document;
  try {
    document = readWorkflow(repoRoot, workflow);
  } catch (error) {
    return {
      errors: [`${WORKFLOW_DIR}/${workflow}: could not be read (${String(error)}).`],
      report: { deployingJobs: 0, gates: 0 },
    };
  }

  const deployingJobs = checkDeployingJobs({ document, contract, workflow, errors });
  checkRequiredSteps({ document, contract, workflow, errors });
  checkRollback({ document, contract, workflow, errors });

  return { errors, report: { deployingJobs, gates: contract.gates.length } };
}

function main() {
  const { errors, report } = checkDeployGates(REPO_ROOT);
  if (errors.length > 0) {
    console.error('Deploy gate check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `check-deploy-gates: OK (${report.deployingJobs} promoting jobs, ${report.gates} gates)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
