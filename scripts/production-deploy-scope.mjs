#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { readRelayRelease, verifyRelayCommit } from './verify-deployment.mjs';

export const RELEASE_READINESS = JSON.parse(
  readFileSync(new URL('./config/deploy-gates.json', import.meta.url), 'utf8'),
).releaseReadiness;

// The display name of the job that promotes each surface in
// .github/workflows/deploy-production.yml. It is the key the shipped-baseline
// lookup below matches on, so a renamed job would silently strand its surface.
// production-deploy-scope.test.mjs asserts these still name real jobs.
export const SURFACE_DEPLOY_JOBS = {
  web: 'Deploy verified web artifact',
  sandbox: 'Deploy artifact sandbox origin',
  signaling: RELEASE_READINESS.relay.jobName,
};

export const SURFACE_DEPLOY_WORKFLOWS = {
  web: 'deploy-production.yml',
  sandbox: 'deploy-production.yml',
  signaling: RELEASE_READINESS.relay.workflow,
};

const DEPLOY_WORKFLOW_FILE = 'deploy-production.yml';
const RUNS_TO_SCAN = 30;

const SHARED_BUILD_FILES = new Set([
  '.npmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'turbo.json',
]);

// packages/client/sync (TS) and apps/desktop/src-tauri/src/data/cloud_sync.rs
// (Rust) implement the same delta-sync rules independently, and the only thing
// holding them together is the golden fixtures under
// packages/client/sync/src/__fixtures__ replayed by both suites. Editing the
// fixtures or the TS side would otherwise leave `native` false, so the Rust
// replay would never run on the commit that changed the contract.
//
export const SYNC_PARITY_SOURCES = [
  'packages/client/sync',
  'apps/desktop/src-tauri/src/data/cloud_sync.rs',
];

function normalizePath(file) {
  return file
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '');
}

function isWithin(file, directory) {
  return file === directory || file.startsWith(`${directory}/`);
}

export function classifyDeployScope(files, { all = false } = {}) {
  if (all) {
    return {
      web: true,
      signaling: true,
      sandbox: true,
      desktop: true,
      native: true,
      extension: true,
      vscode: true,
      mobile: true,
    };
  }

  const scope = {
    web: false,
    signaling: false,
    sandbox: false,
    desktop: false,
    native: false,
    extension: false,
    vscode: false,
    mobile: false,
  };

  for (const rawFile of files) {
    const file = normalizePath(rawFile);
    if (!file) continue;

    const sharedBuildFile = SHARED_BUILD_FILES.has(file);
    const sharedPackage = isWithin(file, 'packages');
    const developerRuntime =
      file === 'Cargo.lock' ||
      file === 'Cargo.toml' ||
      isWithin(file, 'apps/cli') ||
      isWithin(file, 'crates/agiworkforce-app-server') ||
      isWithin(file, 'crates/agiworkforce-protocol');
    const deployContract =
      file === '.github/workflows/deploy-production.yml' ||
      file === '.github/workflows/deploy-signaling-server.yml' ||
      file === '.github/workflows/ci.yml' ||
      file === 'scripts/production-deploy-scope.mjs' ||
      file === 'scripts/production-deploy-scope.test.mjs' ||
      file === 'scripts/production-deploy-baseline.mjs';
    const webDeployContract =
      file === 'scripts/verify-deployment.mjs' || file === 'scripts/verify-deployment.test.mjs';
    const syncParitySource = SYNC_PARITY_SOURCES.some((source) => isWithin(file, source));
    if (
      sharedBuildFile ||
      sharedPackage ||
      deployContract ||
      webDeployContract ||
      isWithin(file, 'apps/web') ||
      file === 'vercel.json' ||
      file === '.vercelignore'
    ) {
      scope.web = true;
    }

    if (
      sharedBuildFile ||
      deployContract ||
      file === '.dockerignore' ||
      isWithin(file, 'services/signaling-server')
    ) {
      scope.signaling = true;
    }

    // infrastructure/sandbox is the cross-origin renderer that isolates every
    // model-generated artifact from the web app's session, and the CSP in its
    // vercel.json IS that boundary. It is a deployable Vercel project that
    // lives outside apps/, so, exactly like the signaling service above, it
    // needs its own scope key rather than riding along with `web`.
    if (sharedBuildFile || deployContract || isWithin(file, 'infrastructure/sandbox')) {
      scope.sandbox = true;
    }

    if (sharedBuildFile || sharedPackage || deployContract || isWithin(file, 'apps/desktop')) {
      scope.desktop = true;
    }

    if (
      file === 'Cargo.lock' ||
      file === 'Cargo.toml' ||
      file === 'deny.toml' ||
      file.startsWith('rust-toolchain') ||
      syncParitySource ||
      isWithin(file, 'apps/cli') ||
      isWithin(file, 'apps/desktop/src-tauri') ||
      isWithin(file, 'crates')
    ) {
      scope.native = true;
    }

    if (sharedBuildFile || sharedPackage || deployContract || isWithin(file, 'apps/extension')) {
      scope.extension = true;
    }

    if (
      sharedBuildFile ||
      sharedPackage ||
      deployContract ||
      developerRuntime ||
      isWithin(file, 'apps/extension-vscode')
    ) {
      scope.vscode = true;
    }

    if (sharedBuildFile || sharedPackage || deployContract || isWithin(file, 'apps/mobile')) {
      scope.mobile = true;
    }
  }

  return scope;
}

export function formatGithubOutputs(scope) {
  return Object.entries(scope)
    .map(([name, enabled]) => `${name}=${enabled ? 'true' : 'false'}`)
    .join('\n');
}

export function isEligibleProductionRun(run, repository) {
  return (
    run?.conclusion === 'success' &&
    run?.event === 'push' &&
    run?.head_branch === 'main' &&
    run?.head_repository?.full_name === repository
  );
}

export function selectSurfaceBaseline(runs, repository, jobName) {
  for (const run of runs ?? []) {
    if (!isEligibleProductionRun(run, repository)) continue;
    const deployed = (run.jobs ?? []).some(
      (job) => job?.name === jobName && job?.conclusion === 'success',
    );
    if (deployed && run.head_sha) return run.head_sha;
  }
  return null;
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

export async function githubJson(pathAndQuery, token, options = {}) {
  const apiUrl = options.apiUrl ?? process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const response = await (options.fetchImpl ?? fetch)(new URL(pathAndQuery, apiUrl), {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    redirect: 'error',
    signal: options.signal
      ? AbortSignal.any([
          options.signal,
          AbortSignal.timeout(RELEASE_READINESS.requestTimeoutSeconds * 1000),
        ])
      : AbortSignal.timeout(RELEASE_READINESS.requestTimeoutSeconds * 1000),
    ...options.request,
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${pathAndQuery} returned ${response.status}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('GitHub returned invalid JSON');
  }
  return options.withHeaders ? { body, headers: response.headers } : body;
}

export async function githubPages(pathAndQuery, token, field, options = {}) {
  const apiUrl = options.apiUrl ?? process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const initial = new URL(pathAndQuery, apiUrl);
  const seen = new Set();
  const entries = [];
  let next = initial;
  while (next) {
    if (seen.has(next.href) || seen.size >= RELEASE_READINESS.maxPages) {
      throw new Error('GitHub pagination did not finish within its bound');
    }
    seen.add(next.href);
    const { body, headers } = await githubJson(next.pathname + next.search, token, {
      ...options,
      withHeaders: true,
    });
    if (options.expectedSha && body?.sha !== options.expectedSha) {
      throw new Error('GitHub returned a verdict for another candidate');
    }
    const page = field ? body?.[field] : body;
    if (!Array.isArray(page)) throw new Error('GitHub returned an invalid collection');
    entries.push(...page);
    const link = headers.get('link');
    if (!link) break;
    const links = link
      .split(',')
      .map((entry) => entry.match(/^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/));
    if (links.some((entry) => !entry)) throw new Error('GitHub returned invalid pagination');
    const targets = links.filter((match) => match[2] === 'next');
    if (targets.length > 1) throw new Error('GitHub returned duplicate next pages');
    const target = targets[0]?.[1];
    if (!target) break;
    next = new URL(target, initial);
    if (
      next.origin !== initial.origin ||
      next.pathname !== initial.pathname ||
      next.username ||
      next.password
    ) {
      throw new Error('GitHub pagination changed its source');
    }
    for (const key of initial.searchParams.keys()) {
      if (
        key !== 'page' &&
        JSON.stringify(next.searchParams.getAll(key)) !==
          JSON.stringify(initial.searchParams.getAll(key))
      ) {
        throw new Error('GitHub pagination changed its selection');
      }
    }
    for (const key of next.searchParams.keys()) {
      if (key !== 'page' && !initial.searchParams.has(key)) {
        throw new Error('GitHub pagination added another selection');
      }
    }
    if (!/^[1-9][0-9]*$/.test(next.searchParams.get('page') ?? '')) {
      throw new Error('GitHub returned an invalid page');
    }
  }
  return entries;
}

function requireCandidate(environment) {
  const repository = environment.GITHUB_REPOSITORY;
  const token = environment.GITHUB_TOKEN;
  const sha = environment.GITHUB_SHA;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository ?? '') || !token) {
    throw new Error('GitHub repository and authentication are required');
  }
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error('A full candidate commit is required');
  }
  return { repository, token, sha };
}

async function candidateWorkflowState(workflow, candidate, options) {
  const query = new URLSearchParams({
    branch: 'main',
    event: 'push',
    head_sha: candidate.sha,
    per_page: '100',
  });
  const runs = await githubPages(
    `/repos/${candidate.repository}/actions/workflows/${workflow}/runs?${query}`,
    candidate.token,
    'workflow_runs',
    options,
  );
  for (const run of runs) {
    if (
      !Number.isSafeInteger(run?.id) ||
      run.id < 1 ||
      run.head_sha !== candidate.sha ||
      run.head_branch !== 'main' ||
      run.event !== 'push' ||
      run.path?.split('@')[0] !== `.github/workflows/${workflow}` ||
      run.head_repository?.full_name !== candidate.repository ||
      !['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested'].includes(
        run.status,
      )
    ) {
      throw new Error('GitHub returned an invalid candidate workflow run');
    }
  }
  const latest = runs.toSorted((left, right) => right.id - left.id)[0];
  if (!latest || latest.status !== 'completed') return false;
  if (latest.conclusion !== 'success') {
    throw new Error(`${workflow} did not accept the candidate`);
  }
  return true;
}

export async function requireZeroOpenAlerts(candidate, options = {}) {
  const alerts = await githubPages(
    `/repos/${candidate.repository}/code-scanning/alerts?state=open&per_page=100`,
    candidate.token,
    null,
    options,
  );
  if (alerts.length) throw new Error('Open code scanning alerts block deployment');
}

async function relayVerdictState(candidate, environment, options) {
  const statuses = await githubPages(
    `/repos/${candidate.repository}/commits/${candidate.sha}/status?per_page=100`,
    candidate.token,
    'statuses',
    { ...options, expectedSha: candidate.sha },
  );
  const matching = statuses.filter((status) => status?.context === RELEASE_READINESS.relay.context);
  if (!matching.length) return false;
  for (const status of matching) {
    if (!Number.isSafeInteger(status.id) || status.id < 1) {
      throw new Error('GitHub returned an invalid relay verdict');
    }
  }
  const verdict = matching.toSorted((left, right) => right.id - left.id)[0];
  if (verdict.state === 'pending') return false;
  if (verdict.state !== 'success') throw new Error('The relay did not verify the candidate');
  const serverUrl = new URL(environment.GITHUB_SERVER_URL ?? 'https://github.com');
  const target = new URL(verdict.target_url);
  const prefix = `/${candidate.repository}/actions/runs/`;
  const runId = target.pathname.startsWith(prefix) ? target.pathname.slice(prefix.length) : '';
  if (
    target.origin !== serverUrl.origin ||
    target.search ||
    target.hash ||
    !/^[1-9][0-9]*$/.test(runId)
  ) {
    throw new Error('The relay verdict has no trusted deployment receipt');
  }
  const run = await githubJson(
    `/repos/${candidate.repository}/actions/runs/${runId}`,
    candidate.token,
    options,
  );
  if (
    run?.head_repository?.full_name !== candidate.repository ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.path?.split('@')[0] !== `.github/workflows/${RELEASE_READINESS.relay.workflow}`
  ) {
    throw new Error('The relay receipt belongs to another deployment');
  }
  const jobs = await githubPages(
    `/repos/${candidate.repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    candidate.token,
    'jobs',
    options,
  );
  const deployed = jobs.filter((job) => job?.name === RELEASE_READINESS.relay.jobName);
  if (
    deployed.length !== 1 ||
    deployed[0].status !== 'completed' ||
    deployed[0].conclusion !== 'success'
  ) {
    throw new Error('The relay receipt has no successful serving deployment');
  }
  const verification = (deployed[0].steps ?? []).filter(
    (step) => step?.name === `${RELEASE_READINESS.relay.verificationStepPrefix}${candidate.sha}`,
  );
  if (
    verification.length !== 1 ||
    verification[0].status !== 'completed' ||
    verification[0].conclusion !== 'success'
  ) {
    throw new Error('The relay receipt did not verify this candidate');
  }
  return true;
}

export async function requireReleaseReady(environment = process.env, options = {}) {
  const candidate = requireCandidate(environment);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? RELEASE_READINESS.timeoutSeconds * 1000;
  const deadline = now() + timeoutMs;
  options = {
    ...options,
    signal: AbortSignal.timeout(
      Math.max(RELEASE_READINESS.requestTimeoutSeconds * 1000, timeoutMs),
    ),
  };
  while (true) {
    const workflows = await Promise.all(
      RELEASE_READINESS.workflows.map((workflow) =>
        candidateWorkflowState(workflow, candidate, options),
      ),
    );
    if (workflows.every(Boolean)) {
      await requireZeroOpenAlerts(candidate, options);
      if (!options.requireRelay || (await relayVerdictState(candidate, environment, options))) {
        if (options.requireRelay) {
          await verifyRelayCommit(environment.SIGNALING_DEPLOY_URL, candidate.sha, {
            expectedTarget: RELEASE_READINESS.relay.target,
            fetchImpl: options.relayFetchImpl ?? options.fetchImpl,
            attempts: 1,
          });
          await requireZeroOpenAlerts(candidate, options);
        }
        return;
      }
    }
    if (options.noWait || now() >= deadline)
      throw new Error('The candidate did not become release ready before the deadline');
    await sleep(Math.min(RELEASE_READINESS.pollSeconds * 1000, deadline - now()));
  }
}

export async function publishRelayVerdict(environment = process.env, options = {}) {
  const candidate = requireCandidate(environment);
  const runId = environment.GITHUB_RUN_ID;
  if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('The deployment run is required');
  const server = new URL(environment.GITHUB_SERVER_URL ?? 'https://github.com');
  if (server.protocol !== 'https:' || server.username || server.password) {
    throw new Error('The deployment server is invalid');
  }
  const state = environment.RELAY_DEPLOY_RESULT === 'success' ? 'success' : 'failure';
  await githubJson(`/repos/${candidate.repository}/statuses/${candidate.sha}`, candidate.token, {
    ...options,
    request: {
      method: 'POST',
      body: JSON.stringify({
        state,
        context: RELEASE_READINESS.relay.context,
        description:
          state === 'success'
            ? 'the relay served and verified this commit'
            : 'the relay did not verify this commit',
        target_url: `${server.origin}/${candidate.repository}/actions/runs/${runId}`,
      }),
    },
  });
}

async function loadDeployRuns(repository, token, headSha) {
  const query = new URLSearchParams({
    branch: 'main',
    event: 'push',
    status: 'success',
    per_page: String(RUNS_TO_SCAN),
  });
  const listed = await githubJson(
    `/repos/${repository}/actions/workflows/${DEPLOY_WORKFLOW_FILE}/runs?${query}`,
    token,
  );

  const runs = [];
  for (const run of listed.workflow_runs ?? []) {
    if (run.head_sha === headSha) continue;
    const jobs = await githubJson(
      `/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`,
      token,
    );
    runs.push({ ...run, jobs: jobs.jobs ?? [] });
  }
  return runs;
}

function commitIsPresent(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function changedFilesSince(baseline) {
  return execFileSync('git', ['diff', '--name-only', baseline, 'HEAD'], {
    encoding: 'utf8',
  }).split(/\r?\n/);
}

// Measures a surface from the commit it last actually SHIPPED from rather than
// from HEAD^. A commit that lands while CI is red never deploys, so a one-commit
// diff strands it permanently: the next green commit's HEAD^..HEAD does not
// mention the stranded paths. Every unknown answers `true`, not deploying is
// the failure mode that hides, so this errs toward a redundant deploy.
export async function selectShippedSurfaceScope(surface, environment = process.env) {
  const jobName = SURFACE_DEPLOY_JOBS[surface];
  if (!jobName) {
    throw new Error(`Unknown deploy surface ${surface}`);
  }

  const repository = environment.GITHUB_REPOSITORY;
  const token = environment.GITHUB_TOKEN;
  const headSha = environment.GITHUB_SHA;

  if (surface === 'signaling') {
    try {
      const baseline = await readRelayRelease(environment.SIGNALING_DEPLOY_URL, {
        expectedTarget: RELEASE_READINESS.relay.target,
      });
      if (!commitIsPresent(baseline)) return true;
      return classifyDeployScope(changedFilesSince(baseline)).signaling;
    } catch {
      return true;
    }
  }

  if (!repository || !token) {
    log(`${surface}: no repository or token available; deploying.`);
    return true;
  }

  const runs = await loadDeployRuns(repository, token, headSha);
  const baseline = selectSurfaceBaseline(runs, repository, jobName);
  if (!baseline) {
    log(`${surface}: no run has ever deployed this surface; deploying.`);
    return true;
  }
  if (!commitIsPresent(baseline)) {
    log(`${surface}: baseline ${baseline} is not in this checkout; deploying.`);
    return true;
  }

  const files = changedFilesSince(baseline);
  const enabled = classifyDeployScope(files)[surface];
  log(
    `${surface}: baseline ${baseline.slice(0, 9)} → HEAD, ` +
      `${files.filter(Boolean).length} file(s) changed, deploy=${enabled}`,
  );
  return enabled;
}

async function main() {
  if (process.argv.includes('--release-ready')) {
    await requireReleaseReady(process.env, {
      requireRelay: process.argv.includes('--require-relay'),
      noWait: process.argv.includes('--no-wait'),
    });
    console.log('The candidate is release ready');
    return;
  }
  if (process.argv.includes('--publish-relay-verdict')) {
    await publishRelayVerdict();
    console.log('The relay verdict was recorded');
    return;
  }
  if (process.argv.includes('--verify-relay')) {
    await verifyRelayCommit(process.env.SIGNALING_DEPLOY_URL, process.env.GITHUB_SHA, {
      expectedTarget: RELEASE_READINESS.relay.target,
    });
    console.log('The relay served and verified the candidate');
    return;
  }
  const shippedAt = process.argv.indexOf('--shipped');
  if (shippedAt !== -1) {
    const surface = process.argv[shippedAt + 1];
    if (!surface || !SURFACE_DEPLOY_JOBS[surface]) {
      throw new Error(`--shipped needs one of: ${Object.keys(SURFACE_DEPLOY_JOBS).join(', ')}`);
    }
    let enabled = true;
    try {
      enabled = await selectShippedSurfaceScope(surface);
    } catch (error) {
      log(
        `${surface}: baseline selection failed ` +
          `(${error instanceof Error ? error.message : String(error)}); deploying.`,
      );
      enabled = true;
    }
    console.log(`${surface}=${enabled ? 'true' : 'false'}`);
    return;
  }

  const all = process.argv.includes('--all');
  const input = all
    ? ''
    : await new Promise((resolve, reject) => {
        let body = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          body += chunk;
        });
        process.stdin.on('end', () => resolve(body));
        process.stdin.on('error', reject);
      });

  const scope = classifyDeployScope(input.split(/\r?\n/), { all });
  console.log(formatGithubOutputs(scope));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
