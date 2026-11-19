#!/usr/bin/env node

// Every workflow in .github/workflows is read as YAML data, not as text: a
// regex over `uses:` lines cannot see which job a step belongs to, what
// permissions that job resolves to, or whether the trigger that reaches it
// carries a fork's pull request.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'scripts/config/workflow-hardening.json';

export const WORKFLOW_DIR = '.github/workflows';

const FULL_SHA = /^[0-9a-f]{40}$/;

const WRITE_SCOPES = new Set(['write', 'write-all']);

// A deploy is recognised from what a step actually runs, so a new deploy
// workflow is covered the day it lands rather than when someone lists it.
// The release markers are anchored to a command position, so a guard that
// only quotes the command, such as repo-operability.yml, is not a release.
const DEPLOY_MARKERS = [
  /\bvercel\b[^\n]*\bdeploy\b/,
  /\bvercel\b[^\n]*\bpromote\b/,
  /\bvercel\b[^\n]*\balias\b/,
  /\bflyctl\b[^\n]*\bdeploy\b/,
  /\brailway\b[^\n]*\bup\b/,
  /\bwrangler\b[^\n]*\bdeploy\b/,
  /\bnpm\s+publish\b/,
  /\bpnpm\s+publish\b/,
  /(?:^|[\s;&|(])vsce\s+publish\b/m,
  /(?:^|[\s;&|(])ovsx\s+publish\b/m,
  /\bpublish-chrome-web-store\.mjs\b/,
  /(?:^|[\s;&|(])cosign\s+sign-blob\b/m,
];

const RELEASE_ACTIONS = [/^softprops\/action-gh-release@/];

const GLOBAL_INSTALLS = [
  /(?:^|[\s;&|(])npm\s+(?:install|i|add)\b[^\n]*\s(?:--global|-g)\b/m,
  /(?:^|[\s;&|(])pnpm\s+(?:add|install|i)\b[^\n]*\s(?:--global|-g)\b/m,
  /(?:^|[\s;&|(])yarn\s+global\s+add\b/m,
];

const SCRIPTED_INSTALL =
  /(?:^|[\s;&|(])(?:pnpm\s+(?:install|i)|npm\s+(?:ci|install|i)|yarn\s+install)\b[^\n]*/gm;

// Fields an outside contributor controls. Interpolated into a shell they are
// executed, not quoted.
const INJECTABLE_EXPRESSIONS = [
  'github.event.issue.title',
  'github.event.issue.body',
  'github.event.pull_request.title',
  'github.event.pull_request.body',
  'github.event.comment.body',
  'github.event.review.body',
  'github.event.review_comment.body',
  'github.event.pull_request.head.ref',
  'github.event.pull_request.head.label',
  'github.event.pull_request.head.repo.default_branch',
  'github.head_ref',
];

const HEAD_REF_CHECKOUT = [
  'github.event.pull_request.head.sha',
  'github.event.pull_request.head.ref',
  'github.head_ref',
];

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

export function workflowFiles(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, WORKFLOW_DIR);
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml')).sort();
}

function triggerNames(document) {
  // `on` is the YAML 1.1 boolean true, so a parser hands it back under both keys.
  const on = document?.on ?? document?.[true];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  if (on && typeof on === 'object') return Object.keys(on);
  return [];
}

function jobEntries(document) {
  const jobs = document?.jobs;
  if (!jobs || typeof jobs !== 'object') return [];
  return Object.entries(jobs).filter(([, job]) => job && typeof job === 'object');
}

function steps(job) {
  return Array.isArray(job.steps)
    ? job.steps.filter((step) => step && typeof step === 'object')
    : [];
}

function stepText(step) {
  return [
    step.name,
    step.run,
    step.uses,
    step.if,
    JSON.stringify(step.with ?? ''),
    JSON.stringify(step.env ?? ''),
  ]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('\n');
}

export function jobText(job) {
  return [job.if, JSON.stringify(job.with ?? ''), JSON.stringify(job.env ?? '')]
    .concat(steps(job).map(stepText))
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('\n');
}

/** The permissions a job actually runs with, or null when nothing declares them. */
export function resolvedPermissions(document, job) {
  if (job.permissions !== undefined) return job.permissions;
  if (document?.permissions !== undefined) return document.permissions;
  return null;
}

export function writeScopes(permissions) {
  if (permissions === 'write-all') return ['write-all'];
  if (typeof permissions !== 'object' || permissions === null) return [];
  return Object.entries(permissions)
    .filter(([, level]) => WRITE_SCOPES.has(String(level)))
    .map(([scope]) => scope)
    .sort();
}

export function isDeployJob(job) {
  const text = jobText(job);
  if (DEPLOY_MARKERS.some((marker) => marker.test(text))) return true;
  return actionReferences(job).some((uses) => RELEASE_ACTIONS.some((action) => action.test(uses)));
}

function pushTags(document) {
  const on = document?.on ?? document?.[true];
  const tags = on && typeof on === 'object' && !Array.isArray(on) ? on.push?.tags : undefined;
  if (typeof tags === 'string') return [tags];
  return Array.isArray(tags) ? tags.map(String) : [];
}

function environmentName(job) {
  const environment = job.environment;
  if (typeof environment === 'string') return environment;
  return typeof environment?.name === 'string' ? environment.name : null;
}

function secretPattern(name) {
  return new RegExp(`\\bsecrets\\.${name}\\b`);
}

/** The signing secrets a job reads, from the names the contract binds to an environment. */
export function signingSecretsRead(job, contract) {
  const text = jobText(job);
  return Object.keys(contract.signingSecrets ?? {}).filter((name) =>
    secretPattern(name).test(text),
  );
}

function runText(job) {
  return steps(job)
    .map((step) => step.run)
    .filter((run) => typeof run === 'string')
    .join('\n');
}

export function runsGlobalInstall(job) {
  const text = runText(job);
  return GLOBAL_INSTALLS.some((pattern) => pattern.test(text));
}

export function scriptedInstalls(job) {
  return [...runText(job).matchAll(SCRIPTED_INSTALL)]
    .map((match) => match[0].trim())
    .filter((line) => !/\s--ignore-scripts\b/.test(line));
}

function uploadsArtifact(job) {
  return actionReferences(job).some((uses) => uses.startsWith('actions/upload-artifact@'));
}

function actionReferences(job) {
  return steps(job)
    .map((step) => step.uses)
    .filter((uses) => typeof uses === 'string' && uses.length > 0);
}

export function unpinnedAction(reference) {
  if (reference.startsWith('./') || reference.startsWith('docker://')) return null;
  const at = reference.lastIndexOf('@');
  if (at === -1) return `${reference} names no version at all`;
  const version = reference.slice(at + 1);
  if (FULL_SHA.test(version)) return null;
  return `${reference} is pinned to "${version}" and not to a 40 character commit sha`;
}

function baselineIndex(contract, rule) {
  const entries = contract.knownGaps?.[rule] ?? [];
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function reportBaseline({ rule, found, contract, errors }) {
  const declared = baselineIndex(contract, rule);
  for (const id of found) {
    const entry = declared.get(id);
    if (!entry) {
      errors.push(
        `${rule}: ${id} is a new violation. Fix it, or record it in ${CONTRACT_PATH} under ` +
          `knownGaps.${rule} with the reason it cannot be fixed yet.`,
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: knownGaps.${rule} entry ${id} carries no reason.`);
    }
    if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: knownGaps.${rule} entry ${id} names no fix.`);
    }
  }
  for (const id of declared.keys()) {
    if (!found.has(id)) {
      errors.push(
        `${CONTRACT_PATH}: knownGaps.${rule} still lists ${id}, which no longer violates the rule. ` +
          'Delete the entry so the baseline cannot grow back.',
      );
    }
  }
}

function checkPinnedActions({ workflows, contract, errors }) {
  const found = new Set();
  let scanned = 0;
  for (const { file, jobs } of workflows) {
    for (const [name, job] of jobs) {
      for (const reference of actionReferences(job)) {
        scanned += 1;
        const problem = unpinnedAction(reference);
        if (problem) found.add(`${file}:${name}: ${problem}`);
      }
    }
  }
  reportBaseline({ rule: 'unpinnedActions', found, contract, errors });
  return scanned;
}

function checkPermissions({ workflows, contract, errors }) {
  const missing = new Set();
  const writes = new Set();
  for (const { file, document, jobs } of workflows) {
    for (const [name, job] of jobs) {
      const permissions = resolvedPermissions(document, job);
      if (permissions === null) {
        missing.add(`${file}:${name}`);
        continue;
      }
      if (permissions === 'write-all') {
        errors.push(
          `${file}:${name} resolves to write-all, which hands every scope to every step in it.`,
        );
        continue;
      }
      for (const scope of writeScopes(permissions)) writes.add(`${file}:${name}:${scope}`);
    }
  }
  reportBaseline({ rule: 'implicitPermissions', found: missing, contract, errors });

  const allowed = new Map((contract.allowedWriteScopes ?? []).map((entry) => [entry.id, entry]));
  for (const id of writes) {
    const entry = allowed.get(id);
    if (!entry) {
      errors.push(
        `${id} grants a write scope that ${CONTRACT_PATH} does not allow. Drop the scope, or add ` +
          'it to allowedWriteScopes with the reason that job needs to write.',
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: allowedWriteScopes entry ${id} carries no reason.`);
    }
  }
  for (const id of allowed.keys()) {
    if (!writes.has(id)) {
      errors.push(
        `${CONTRACT_PATH}: allowedWriteScopes still lists ${id}, which no longer grants that write ` +
          'scope. Delete the entry so the allowance cannot outlive the need.',
      );
    }
  }
}

function checkTimeouts({ workflows, contract, errors }) {
  const found = new Set();
  for (const { file, jobs } of workflows) {
    for (const [name, job] of jobs) {
      if (typeof job.uses === 'string') continue;
      const timeout = job['timeout-minutes'];
      if (typeof timeout === 'number' && timeout > 0) continue;
      found.add(`${file}:${name}`);
    }
  }
  reportBaseline({ rule: 'missingJobTimeout', found, contract, errors });
}

function checkDeployConcurrency({ workflows, errors }) {
  for (const { file, document, jobs } of workflows) {
    const deploying = jobs.filter(([, job]) => isDeployJob(job));
    if (deploying.length === 0) continue;
    const workflowGroup = document?.concurrency?.group ?? document?.concurrency;
    for (const [name, job] of deploying) {
      const jobGroup = job.concurrency?.group ?? job.concurrency;
      if (typeof workflowGroup === 'string' || typeof jobGroup === 'string') continue;
      errors.push(
        `${file}:${name} runs a deploy and declares no concurrency group, so two runs can promote ` +
          'different commits to the same target at the same time.',
      );
    }
  }
}

function checkProductionEnvironment({ workflows, contract, errors }) {
  const declared = new Set(contract.productionEnvironments ?? []);
  const found = new Set();
  for (const { file, jobs } of workflows) {
    for (const [name, job] of jobs) {
      if (!isDeployJob(job) && signingSecretsRead(job, contract).length === 0) continue;
      const declaredName = environmentName(job);
      if (declaredName === null) {
        found.add(`${file}:${name}`);
        continue;
      }
      if (declared.size > 0 && !declared.has(declaredName)) {
        errors.push(
          `${file}:${name} deploys into environment "${declaredName}", which ${CONTRACT_PATH} ` +
            'does not list. An environment nobody declared has no reviewers and no secrets policy.',
        );
      }
    }
  }
  reportBaseline({ rule: 'deployWithoutEnvironment', found, contract, errors });
}

// A repository secret reaches a workflow on any pushed branch that names it;
// an environment secret reaches only a job that declares the environment and
// passes its reviewers and tag policy.
function checkSigningSecrets({ workflows, contract, errors }) {
  const bindings = contract.signingSecrets ?? {};
  const declared = new Set(contract.productionEnvironments ?? []);
  for (const [secret, environment] of Object.entries(bindings)) {
    if (!declared.has(environment)) {
      errors.push(
        `${CONTRACT_PATH}: signingSecrets binds ${secret} to "${environment}", which ` +
          'productionEnvironments does not list.',
      );
    }
  }
  for (const { file, document, jobs } of workflows) {
    const workflowText = JSON.stringify(document?.env ?? '');
    for (const secret of Object.keys(bindings)) {
      if (secretPattern(secret).test(workflowText)) {
        errors.push(
          `${file} reads ${secret} at workflow level, which hands the signing key to every job in it.`,
        );
      }
    }
    for (const [name, job] of jobs) {
      for (const secret of signingSecretsRead(job, contract)) {
        const required = bindings[secret];
        const actual = environmentName(job);
        if (actual !== required) {
          errors.push(
            `${file}:${name} reads ${secret} in ${actual === null ? 'no environment' : `environment "${actual}"`}. ` +
              `It may be read only in environment "${required}", where it is stored as an environment secret.`,
          );
        }
      }
    }
  }
}

// The release environments allow only their tags to deploy. A job that names
// one must be triggered by those tags, or the policy the owner applies and the
// workflow disagree and the release can never be approved.
function checkReleaseEnvironments({ workflows, contract, errors }) {
  const release = contract.releaseEnvironments ?? {};
  const declared = new Set(contract.productionEnvironments ?? []);
  for (const [environment, entry] of Object.entries(release)) {
    if (!declared.has(environment)) {
      errors.push(
        `${CONTRACT_PATH}: releaseEnvironments lists "${environment}", which productionEnvironments does not.`,
      );
    }
    if (!Array.isArray(entry?.tags) || entry.tags.length === 0) {
      errors.push(`${CONTRACT_PATH}: releaseEnvironments "${environment}" names no tag pattern.`);
    }
  }
  for (const { file, document, jobs } of workflows) {
    const triggers = pushTags(document);
    for (const [name, job] of jobs) {
      const environment = environmentName(job);
      if (environment === null || !(environment in release)) continue;
      const allowed = new Set(release[environment]?.tags ?? []);
      const outside = triggers.filter((tag) => !allowed.has(tag));
      if (triggers.length === 0 || outside.length > 0) {
        errors.push(
          `${file}:${name} deploys into "${environment}", which allows only tags ` +
            `${[...allowed].join(', ')}, but the workflow is triggered by ` +
            `${triggers.length === 0 ? 'no tag' : triggers.join(', ')}.`,
        );
      }
    }
  }
}

// npm resolves a global install fresh, with no lockfile, no integrity pin and
// no minimum release age. In a release job that is code chosen at release time
// running beside the artifact, the signing key or a write token.
function checkReleaseToolInstalls({ workflows, contract, errors }) {
  const found = new Set();
  for (const { file, document, jobs } of workflows) {
    if (pushTags(document).length === 0) continue;
    for (const [name, job] of jobs) {
      const holdsRelease =
        isDeployJob(job) ||
        signingSecretsRead(job, contract).length > 0 ||
        uploadsArtifact(job) ||
        writeScopes(resolvedPermissions(document, job)).length > 0;
      if (holdsRelease && runsGlobalInstall(job)) found.add(`${file}:${name}`);
    }
  }
  reportBaseline({ rule: 'releaseJobGlobalInstall', found, contract, errors });
}

// Every step of a job can request its OIDC token, so an install script that
// runs in a job holding id-token: write can authenticate as that job.
function checkOidcInstalls({ workflows, contract, errors }) {
  const found = new Set();
  for (const { file, document, jobs } of workflows) {
    for (const [name, job] of jobs) {
      if (!writeScopes(resolvedPermissions(document, job)).includes('id-token')) continue;
      if (scriptedInstalls(job).length > 0) found.add(`${file}:${name}`);
    }
  }
  reportBaseline({ rule: 'oidcJobRunsInstallScripts', found, contract, errors });
}

function checkPullRequestTarget({ workflows, errors }) {
  for (const { file, document, jobs } of workflows) {
    if (!triggerNames(document).includes('pull_request_target')) continue;
    for (const [name, job] of jobs) {
      const text = jobText(job);
      for (const expression of HEAD_REF_CHECKOUT) {
        if (text.includes(expression)) {
          errors.push(
            `${file}:${name} runs on pull_request_target and checks out ${expression}. That runs a ` +
              "fork's code with the base repository's secrets and write token.",
          );
        }
      }
      if (/secrets\.(?!GITHUB_TOKEN\b)[A-Z0-9_]+/.test(text)) {
        errors.push(
          `${file}:${name} runs on pull_request_target and reads a repository secret. Move the work ` +
            'to a workflow_run job that checks out the base commit.',
        );
      }
    }
  }
}

function checkScriptInjection({ workflows, contract, errors }) {
  const found = new Set();
  for (const { file, jobs } of workflows) {
    for (const [name, job] of jobs) {
      for (const step of steps(job)) {
        if (typeof step.run !== 'string') continue;
        for (const expression of INJECTABLE_EXPRESSIONS) {
          if (
            new RegExp(`\\$\\{\\{\\s*${expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(
              step.run,
            )
          ) {
            found.add(`${file}:${name}: ${expression}`);
          }
        }
      }
    }
  }
  reportBaseline({ rule: 'runInterpolatesUntrustedInput', found, contract, errors });
}

export function checkWorkflowHardening(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const files = workflowFiles(repoRoot);

  if (files.length === 0) {
    errors.push(`${WORKFLOW_DIR}: no workflow files were read, so nothing below was measured.`);
    return { errors, report: { workflows: 0, jobs: 0, actions: 0 } };
  }

  const workflows = [];
  for (const file of files) {
    let document;
    try {
      document = parse(readFileSync(path.join(repoRoot, WORKFLOW_DIR, file), 'utf8'));
    } catch (error) {
      errors.push(`${WORKFLOW_DIR}/${file}: is not parseable YAML (${String(error)}).`);
      continue;
    }
    const jobs = jobEntries(document);
    if (jobs.length === 0) {
      errors.push(`${WORKFLOW_DIR}/${file}: declares no jobs, so it does nothing.`);
      continue;
    }
    workflows.push({ file, document, jobs });
  }

  const actions = checkPinnedActions({ workflows, contract, errors });
  checkPermissions({ workflows, contract, errors });
  checkTimeouts({ workflows, contract, errors });
  checkDeployConcurrency({ workflows, errors });
  checkProductionEnvironment({ workflows, contract, errors });
  checkSigningSecrets({ workflows, contract, errors });
  checkReleaseEnvironments({ workflows, contract, errors });
  checkReleaseToolInstalls({ workflows, contract, errors });
  checkOidcInstalls({ workflows, contract, errors });
  checkPullRequestTarget({ workflows, errors });
  checkScriptInjection({ workflows, contract, errors });

  return {
    errors,
    report: {
      workflows: workflows.length,
      jobs: workflows.reduce((total, workflow) => total + workflow.jobs.length, 0),
      actions,
    },
  };
}

function main() {
  const { errors, report } = checkWorkflowHardening(REPO_ROOT);
  if (errors.length > 0) {
    console.error('Workflow hardening check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `check-workflow-hardening: OK (${report.workflows} workflows, ${report.jobs} jobs, ` +
      `${report.actions} action references)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
