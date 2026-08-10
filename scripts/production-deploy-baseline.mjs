#!/usr/bin/env node
/**
 * Decide which production surfaces need deploying, measured from what each
 * surface last actually SHIPPED rather than from the previous commit.
 *
 * The old scope step ran `git diff HEAD^ HEAD`. That assumes every commit gets
 * deployed, and this workflow is gated on CI success, so it does not hold: a
 * commit landing while CI is red is never deployed, and no later run ever looks
 * at it again. See `selectSurfaceBaseline` in production-deploy-scope.mjs for
 * the outage that fact prolonged.
 *
 * Here the baseline is the commit each surface was last deployed FROM, taken
 * from the newest run whose deploy job for that surface succeeded. Everything
 * between there and HEAD is unshipped by definition, so classifying that range
 * cannot strand a change.
 *
 * Fails OPEN. Any uncertainty — no prior successful deploy, an API error, a
 * baseline commit that is no longer reachable — deploys the surface. Deploying
 * something already current costs a build; skipping something that was never
 * shipped is how the outage above stayed live for two days.
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { classifyDeployScope, selectSurfaceBaseline } from './production-deploy-scope.mjs';

const SURFACES = [
  { key: 'web', jobName: 'Deploy verified web artifact' },
  { key: 'gateway', jobName: 'Promote verified gateway image to production' },
];

const WORKFLOW_FILE = 'deploy-production.yml';
const RUNS_TO_SCAN = 30;

function log(message) {
  process.stderr.write(`${message}\n`);
}

async function api(pathAndQuery, token) {
  const response = await fetch(`https://api.github.com${pathAndQuery}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${pathAndQuery} returned ${response.status}`);
  }
  return response.json();
}

/** Newest-first eligible runs, each with its jobs attached. */
async function loadRuns(repository, token, headSha) {
  const query = new URLSearchParams({
    branch: 'main',
    event: 'push',
    status: 'success',
    per_page: String(RUNS_TO_SCAN),
  });
  const listed = await api(
    `/repos/${repository}/actions/workflows/${WORKFLOW_FILE}/runs?${query}`,
    token,
  );

  const runs = [];
  for (const run of listed.workflow_runs ?? []) {
    // The run for THIS commit cannot be its own baseline.
    if (run.head_sha === headSha) continue;
    const jobs = await api(`/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`, token);
    runs.push({ ...run, jobs: jobs.jobs ?? [] });
  }
  return runs;
}

function changedFilesSince(baseline) {
  return execFileSync('git', ['diff', '--name-only', `${baseline}`, 'HEAD'], {
    encoding: 'utf8',
  }).split(/\r?\n/);
}

function commitIsPresent(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const headSha = process.env.GITHUB_SHA;

  const scope = { web: false, gateway: false };

  let runs = [];
  if (!repository || !token) {
    log('No repository or token available; deploying every surface.');
    return printAll(scope);
  }

  try {
    runs = await loadRuns(repository, token, headSha);
  } catch (error) {
    log(`Could not read deploy history (${error.message}); deploying every surface.`);
    return printAll(scope);
  }

  for (const { key, jobName } of SURFACES) {
    const baseline = selectSurfaceBaseline(runs, repository, jobName);

    if (!baseline) {
      log(`${key}: no run has ever deployed this surface; deploying.`);
      scope[key] = true;
      continue;
    }
    if (!commitIsPresent(baseline)) {
      log(`${key}: baseline ${baseline} is not in this checkout; deploying.`);
      scope[key] = true;
      continue;
    }

    const files = changedFilesSince(baseline);
    const classified = classifyDeployScope(files);
    scope[key] = classified[key];
    log(
      `${key}: baseline ${baseline.slice(0, 9)} → HEAD, ` +
        `${files.filter(Boolean).length} file(s) changed, deploy=${scope[key]}`,
    );
  }

  print(scope);
}

function printAll(scope) {
  for (const key of Object.keys(scope)) scope[key] = true;
  print(scope);
}

function print(scope) {
  for (const [key, enabled] of Object.entries(scope)) {
    console.log(`${key}=${enabled ? 'true' : 'false'}`);
  }
}

main().catch((error) => {
  // Never let a crash here mean "deploy nothing" — that is the failure mode
  // this script exists to remove.
  log(`Baseline selection failed (${error.message}); deploying every surface.`);
  console.log('web=true');
  console.log('gateway=true');
});
