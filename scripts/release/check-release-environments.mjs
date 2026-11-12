#!/usr/bin/env node

// Owner-run, read-only probe of the GitHub settings the release workflows rely
// on but cannot enforce: each release environment has a required reviewer, no
// administrator bypass and a deployment policy of its release tags only; each
// signing secret lives in its environment and never at repository level; and a
// tag ruleset restricts who may create, move or delete the release tags. Every
// call is a GET. Expectations come from scripts/config/workflow-hardening.json,
// which check-workflow-hardening.mjs holds to the workflows.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CONTRACT_PATH = 'scripts/config/workflow-hardening.json';
export const REQUIRED_TAG_RULES = ['creation', 'update', 'deletion'];

export function loadReleaseContract(repoRoot = REPO_ROOT) {
  const contract = JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
  return {
    releaseEnvironments: contract.releaseEnvironments ?? {},
    signingSecrets: contract.signingSecrets ?? {},
  };
}

function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** Whether a ruleset's ref_name condition selects the given ref, literal `*` included. */
export function rulesetCoversRef(ruleset, ref) {
  const include = ruleset?.conditions?.ref_name?.include ?? [];
  const exclude = ruleset?.conditions?.ref_name?.exclude ?? [];
  const matches = (pattern) => pattern === '~ALL' || globToRegExp(pattern).test(ref);
  return include.some(matches) && !exclude.some(matches);
}

function releaseTags(contract) {
  return [
    ...new Set(Object.values(contract.releaseEnvironments).flatMap((entry) => entry?.tags ?? [])),
  ].sort();
}

/**
 * Pure evaluation of what the GETs returned. `environments`, `branchPolicies`
 * and `environmentSecrets` map an environment name to its response, or null
 * when GitHub answered 404.
 */
export function evaluateReleaseSettings({
  contract,
  environments,
  branchPolicies,
  repositorySecrets,
  environmentSecrets,
  rulesets,
}) {
  const failures = [];
  const notes = [];

  for (const [name, entry] of Object.entries(contract.releaseEnvironments)) {
    const environment = environments[name];
    if (!environment) {
      failures.push(
        `environment ${name} does not exist. The first workflow run that names it would create it ` +
          'with no reviewer and no tag policy.',
      );
      continue;
    }
    const reviewers = (environment.protection_rules ?? [])
      .filter((rule) => rule?.type === 'required_reviewers')
      .flatMap((rule) => rule.reviewers ?? []);
    if (reviewers.length === 0) {
      failures.push(
        `environment ${name} has no required reviewer, so a tag push deploys unapproved.`,
      );
    }
    if (environment.can_admins_bypass !== false) {
      failures.push(
        `environment ${name} lets administrators bypass its protection rules; deselect ` +
          '"Allow administrators to bypass configured protection rules".',
      );
    }
    const policy = environment.deployment_branch_policy;
    if (policy?.protected_branches !== false || policy?.custom_branch_policies !== true) {
      failures.push(
        `environment ${name} does not restrict deployments to selected branches and tags ` +
          `(deployment_branch_policy is ${JSON.stringify(policy ?? null)}).`,
      );
    }
    const policies = branchPolicies[name]?.branch_policies ?? [];
    const expected = new Set(entry?.tags ?? []);
    const branches = policies.filter((rule) => rule?.type !== 'tag').map((rule) => rule?.name);
    const tags = new Set(policies.filter((rule) => rule?.type === 'tag').map((rule) => rule?.name));
    if (branches.length > 0) {
      failures.push(
        `environment ${name} allows branch ${branches.join(', ')}; a release environment allows only ` +
          'its tags, so a workflow_dispatch from a branch cannot reach it.',
      );
    }
    const missing = [...expected].filter((tag) => !tags.has(tag));
    const extra = [...tags].filter((tag) => !expected.has(tag));
    if (missing.length > 0) {
      failures.push(`environment ${name} lacks the tag policy ${missing.join(', ')}.`);
    }
    if (extra.length > 0) {
      failures.push(
        `environment ${name} allows tag ${extra.join(', ')}, which ${CONTRACT_PATH} does not list.`,
      );
    }
    if (reviewers.length > 0) {
      const selfReview = (environment.protection_rules ?? []).some(
        (rule) => rule?.type === 'required_reviewers' && rule.prevent_self_review === true,
      );
      if (selfReview && reviewers.length === 1) {
        notes.push(
          `environment ${name} prevents self-review with one reviewer, who can then never approve a tag they pushed.`,
        );
      }
    }
  }

  for (const [secret, environment] of Object.entries(contract.signingSecrets)) {
    if (repositorySecrets.includes(secret)) {
      failures.push(
        `${secret} is a repository secret, which any workflow on any pushed branch can read. ` +
          `Delete it there and store it only in environment ${environment}.`,
      );
    }
    const stored = environmentSecrets[environment];
    if (stored && !stored.includes(secret)) {
      notes.push(`${secret} is not stored in environment ${environment} yet.`);
    }
  }

  const active = rulesets.filter(
    (ruleset) => ruleset?.target === 'tag' && ruleset?.enforcement === 'active',
  );
  for (const tag of releaseTags(contract)) {
    const ref = `refs/tags/${tag}`;
    const covering = active.filter((ruleset) => rulesetCoversRef(ruleset, ref));
    const types = new Set(
      covering.flatMap((ruleset) => (ruleset.rules ?? []).map((rule) => rule?.type)),
    );
    const absent = REQUIRED_TAG_RULES.filter((type) => !types.has(type));
    if (absent.length > 0) {
      failures.push(
        `no active tag ruleset restricts ${absent.join(', ')} of ${ref}, so anyone with push access ` +
          'can create or move a release tag.',
      );
    }
    for (const ruleset of covering) {
      for (const actor of ruleset.bypass_actors ?? []) {
        const who = [actor.actor_type, actor.actor_id].filter((part) => part != null).join(' ');
        notes.push(
          `ruleset ${ruleset.name} lets ${who} bypass it (${actor.bypass_mode ?? 'always'}).`,
        );
      }
    }
  }

  return { failures, notes: [...new Set(notes)] };
}

function ghGet(endpoint) {
  try {
    const output = execFileSync('gh', ['api', '--method', 'GET', endpoint], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    const stderr = String(error?.stderr ?? '');
    if (/HTTP 404/.test(stderr)) return null;
    throw new Error(`gh api ${endpoint} failed: ${stderr.trim() || String(error)}`);
  }
}

function repositoryName(argv) {
  const index = argv.indexOf('--repo');
  if (index !== -1 && argv[index + 1]) return argv[index + 1];
  return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  }).trim();
}

export function collectReleaseSettings(repo, contract) {
  const environments = {};
  const branchPolicies = {};
  const environmentSecrets = {};
  const names = new Set([
    ...Object.keys(contract.releaseEnvironments),
    ...Object.values(contract.signingSecrets),
  ]);
  for (const name of names) {
    const encoded = encodeURIComponent(name);
    environments[name] = ghGet(`repos/${repo}/environments/${encoded}`);
    if (!environments[name]) continue;
    branchPolicies[name] = ghGet(
      `repos/${repo}/environments/${encoded}/deployment-branch-policies?per_page=100`,
    );
    const secrets = ghGet(`repos/${repo}/environments/${encoded}/secrets?per_page=100`);
    environmentSecrets[name] = (secrets?.secrets ?? []).map((secret) => secret.name);
  }
  const repositorySecrets = (
    ghGet(`repos/${repo}/actions/secrets?per_page=100`)?.secrets ?? []
  ).map((secret) => secret.name);
  const summaries =
    ghGet(`repos/${repo}/rulesets?targets=tag&includes_parents=true&per_page=100`) ?? [];
  const rulesets = summaries
    .map((summary) => ghGet(`repos/${repo}/rulesets/${summary.id}`))
    .filter(Boolean);
  return { environments, branchPolicies, repositorySecrets, environmentSecrets, rulesets };
}

function main() {
  const contract = loadReleaseContract(REPO_ROOT);
  const repo = repositoryName(process.argv.slice(2));
  const settings = collectReleaseSettings(repo, contract);
  const { failures, notes } = evaluateReleaseSettings({ contract, ...settings });
  for (const note of notes) console.log(`note: ${note}`);
  if (failures.length > 0) {
    console.error(`Release settings of ${repo} are not safe to hold a publish credential:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-release-environments: OK (${repo}: ${Object.keys(contract.releaseEnvironments).join(', ')})`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
