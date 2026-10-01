#!/usr/bin/env node

// A production promotion is only as safe as the gates it cannot skip. This
// reads the deploy workflow as YAML and proves, for every job in it that
// actually promotes something, that each declared gate is there and can fail
// the job. Prose in a runbook is not a gate.

import console from 'node:console';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

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
  return step['continue-on-error'] === undefined || step['continue-on-error'] === false;
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
    for (const consumer of gate.gatesJobs ?? []) {
      const deploying = byName.get(consumer);
      if (!deploying || !upstreamJobs(document, consumer).has(gate.job)) {
        errors.push(`${workflow}:${consumer} does not wait for ${gate.id}. ${gate.why}`);
      }
      if (
        !stepCanFailTheJob(job) ||
        step.if !== undefined ||
        /\b(always|failure|cancelled)\s*\(/.test(deploying?.if ?? '')
      ) {
        errors.push(`${workflow}:${consumer} can bypass ${gate.id}. ${gate.why}`);
      }
    }
    if (
      gate.command &&
      (step.if !== undefined ||
        !stepCanFailTheJob(job) ||
        step.run?.trim() !== gate.command ||
        step.env?.GITHUB_SHA !== contract.verifiedCommitRef ||
        checkoutRefs(job).length !== 1 ||
        checkoutRefs(job)[0] !== contract.verifiedCommitRef)
    ) {
      errors.push(`${workflow}:${gate.job} does not run ${gate.id} on the verified candidate.`);
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

function checkRelayGates({ repoRoot, contract, errors }) {
  const relay = contract.releaseReadiness?.relay;
  if (!relay) {
    errors.push(`${CONTRACT_PATH}: declares no relay release owner.`);
    return;
  }
  let document;
  try {
    document = readWorkflow(repoRoot, relay.workflow);
  } catch {
    errors.push(`${relay.workflow}: could not read the relay deploy gates.`);
    return;
  }
  const candidateRef = '${{ needs.gate.outputs.sha }}';
  for (const [name, deploymentStep] of [
    ['deploy-fly', 'Deploy to Fly.io'],
    ['deploy-railway', 'Deploy to Railway'],
  ]) {
    const job = document.jobs?.[name];
    const gate = stepByName(job, 'Require green scanning for this commit');
    const order = steps(job).map((step) => step.name);
    if (
      !job ||
      !job.if?.includes("github.ref == 'refs/heads/main'") ||
      !stepCanFailTheJob(job) ||
      !gate ||
      !stepCanFailTheJob(gate) ||
      gate.if !== undefined ||
      gate.env?.GITHUB_SHA !== candidateRef ||
      gate.run?.trim() !== 'node scripts/production-deploy-scope.mjs --release-ready' ||
      order.indexOf(deploymentStep) < 0 ||
      order.indexOf(gate?.name) > order.indexOf(deploymentStep) ||
      checkoutRefs(job).length !== 1 ||
      checkoutRefs(job)[0] !== candidateRef
    ) {
      errors.push(`${relay.workflow}:${name} can deploy without candidate CI and scanning.`);
    }
  }
  const serving = document.jobs?.[relay.job];
  const verification = stepByName(serving, `${relay.verificationStepPrefix}${candidateRef}`);
  if (
    serving?.name !== relay.jobName ||
    !verification ||
    !stepCanFailTheJob(verification) ||
    verification.if !== undefined ||
    verification.env?.GITHUB_SHA !== candidateRef ||
    verification.run?.trim() !== 'node scripts/production-deploy-scope.mjs --verify-relay'
  ) {
    errors.push(`${relay.workflow}:${relay.job} does not verify the serving candidate.`);
  }
  const production = readWorkflow(repoRoot, contract.workflow);
  const webConcurrency = production.jobs?.['deploy-web']?.concurrency;
  if (
    !serving?.concurrency?.group ||
    webConcurrency?.group !== serving.concurrency.group ||
    webConcurrency['cancel-in-progress'] !== false
  ) {
    errors.push(`${contract.workflow}: web does not serialize with the serving relay deployment.`);
  }
  const publication = document.jobs?.['relay-verdict'];
  const receipt = stepByName(publication, 'Publish the relay verdict for this commit');
  if (
    !publication ||
    !stepCanFailTheJob(publication) ||
    !upstreamJobs(document, 'relay-verdict').has(relay.job) ||
    !publication.if?.includes('always()') ||
    !receipt ||
    !stepCanFailTheJob(receipt) ||
    receipt.if !== undefined ||
    receipt.env?.GITHUB_SHA !== candidateRef ||
    receipt.env?.RELAY_DEPLOY_RESULT !== `\${{ needs.${relay.job}.result }}` ||
    receipt.run?.trim() !== 'node scripts/production-deploy-scope.mjs --publish-relay-verdict' ||
    checkoutRefs(publication).length !== 1 ||
    checkoutRefs(publication)[0] !== candidateRef
  ) {
    errors.push(
      `${relay.workflow}: does not publish the candidate relay verdict on both outcomes.`,
    );
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

function checkStagingGates({ repoRoot, errors }) {
  let document;
  try {
    document = readWorkflow(repoRoot, 'deploy-staging.yml');
  } catch {
    errors.push('deploy-staging.yml: could not read the staging database binding');
    return;
  }
  const job = document.jobs?.deploy;
  const expected = '${{ secrets.AGI_STAGING_DATABASE_URL }}';
  const aliases = ['AGI_STAGING_DATABASE_URL', 'AGI_DATABASE_URL', 'DATABASE_URL'];
  const orderedIds = ['pull', 'database', 'migrate', 'build', 'deploy', 'verify', 'record'];
  const declared = steps(job ?? {});
  const selected = orderedIds.map((id) => declared.find((step) => step.id === id));
  const database = selected[1];
  const build = selected[3];
  const deployment = selected[4];
  const order = selected.map((step) => declared.indexOf(step));
  if (
    !job ||
    !stepCanFailTheJob(job) ||
    aliases.some((name) => job.env?.[name] !== expected) ||
    selected.some(
      (step) =>
        !step ||
        !stepCanFailTheJob(step) ||
        step.if !== undefined ||
        aliases.some((name) => step.env?.[name] !== undefined && step.env[name] !== expected),
    ) ||
    [build, deployment].some((step) =>
      ['AGI_DATABASE_URL', 'DATABASE_URL'].some((name) => step?.env?.[name] !== expected),
    ) ||
    order.some((position, index) => index > 0 && position <= order[index - 1]) ||
    database?.run?.trim() !== 'node scripts/verify-staging-database.mjs' ||
    !deployment?.run?.replace(/\s+/gu, ' ').includes('--env AGI_DATABASE_URL --env DATABASE_URL')
  ) {
    errors.push(
      'deploy-staging.yml: staging database binding must gate migrations, build and runtime aliases',
    );
  }
  const verdict = stepByName(job ?? {}, 'Publish the staging verdict for this commit');
  if (
    !verdict ||
    !stepCanFailTheJob(verdict) ||
    verdict.if !== '${{ always() }}' ||
    verdict.env?.VERIFY_OUTCOME !== '${{ steps.verify.outcome }}' ||
    verdict.env?.RECORD_OUTCOME !== '${{ steps.record.outcome }}' ||
    verdict.env?.JOB_STATUS !== '${{ job.status }}' ||
    !verdict.run
      ?.replace(/\s+/gu, ' ')
      .includes(
        'if [ "$JOB_STATUS" = "success" ] && [ "$VERIFY_OUTCOME" = "success" ] && [ "$RECORD_OUTCOME" = "success" ]; then',
      )
  ) {
    errors.push(
      'deploy-staging.yml: staging verdict must require serving, migration record and job success',
    );
  }
}

function checkReleaseWorkflowTriggers({ repoRoot, contract, errors }) {
  const workflows = contract.releaseReadiness?.workflows;
  if (
    !Array.isArray(workflows) ||
    workflows.length === 0 ||
    new Set(workflows).size !== workflows.length ||
    workflows.some((file) => typeof file !== 'string' || !/^[a-z0-9-]+\.ya?ml$/.test(file))
  ) {
    errors.push(`${CONTRACT_PATH}: candidate release workflows must be unique workflow files.`);
    return;
  }
  for (const file of workflows) {
    let document;
    try {
      document = readWorkflow(repoRoot, file);
    } catch {
      errors.push(`${file}: candidate release workflow could not be read.`);
      continue;
    }
    const push = document?.on?.push;
    if (
      !push ||
      !Array.isArray(push.branches) ||
      !push.branches.includes('main') ||
      push.branches.some((branch) => typeof branch !== 'string' || branch.startsWith('!')) ||
      ['paths', 'paths-ignore', 'branches-ignore'].some((filter) => Object.hasOwn(push, filter))
    ) {
      errors.push(`${file}: candidate release evidence must run on every main push.`);
    }
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
  checkRelayGates({ repoRoot, contract, errors });
  checkRollback({ document, contract, workflow, errors });
  checkStagingGates({ repoRoot, errors });
  checkReleaseWorkflowTriggers({ repoRoot, contract, errors });

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
