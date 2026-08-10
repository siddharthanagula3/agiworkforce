#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHARED_BUILD_FILES = new Set([
  '.npmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'turbo.json',
]);

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
      gateway: true,
      signaling: true,
      desktop: true,
      native: true,
      extension: true,
      vscode: true,
      mobile: true,
    };
  }

  const scope = {
    web: false,
    gateway: false,
    signaling: false,
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
    // The web gate and its self-test: an edit to either must redeploy web, or
    // the deploy job that runs them never fires for the change that broke them.
    const webDeployContract =
      file === 'scripts/verify-deployment.mjs' || file === 'scripts/verify-deployment.test.mjs';
    const gatewayDeployContract =
      file === '.dockerignore' ||
      file === 'scripts/verify-gateway-deployment.mjs' ||
      isWithin(file, 'infrastructure/api-gateway');

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
      sharedPackage ||
      deployContract ||
      gatewayDeployContract ||
      isWithin(file, 'services/api-gateway')
    ) {
      scope.gateway = true;
    }

    if (sharedBuildFile || deployContract || isWithin(file, 'services/signaling-server')) {
      scope.signaling = true;
    }

    if (sharedBuildFile || sharedPackage || deployContract || isWithin(file, 'apps/desktop')) {
      scope.desktop = true;
    }

    if (
      sharedBuildFile ||
      deployContract ||
      file === 'Cargo.lock' ||
      file === 'Cargo.toml' ||
      file === 'deny.toml' ||
      file.startsWith('rust-toolchain') ||
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

/**
 * The commit a surface was last actually deployed FROM.
 *
 * WHY THIS EXISTS. The scope step used to diff `HEAD^..HEAD`, which silently
 * assumes every commit gets deployed. It does not: this workflow is gated on CI
 * success, so a commit that lands while CI is red is never deployed, and the
 * next green commit's one-commit diff does not contain it. Its changes are then
 * stranded forever — no later run will ever look at them again.
 *
 * That is not hypothetical. `d4cc8e8e5` fixed a total outage of the
 * authenticated API (argon2 prebuilds missing from the serverless bundle, 143
 * of 196 routes answering empty-body 500s). It landed while CI was red. When CI
 * finally went green on `11e267b5`, that commit touched only
 * `scripts/check-agent-context.mjs`, so scope said `web=false`, the deploy job
 * skipped, and the outage fix stayed unshipped while the workflow reported
 * success.
 *
 * WHY PER-SURFACE, AND WHY THE JOB AND NOT THE RUN. A run can succeed having
 * deployed nothing — that is exactly the failure above. So a run's own success
 * is not evidence that any particular surface shipped from its commit. The only
 * honest baseline is the newest run whose DEPLOY JOB FOR THAT SURFACE
 * succeeded, which is what `jobName` selects.
 *
 * Runs must be newest-first. Returns null when no run has ever deployed this
 * surface, which the caller must treat as "deploy everything" rather than
 * "deploy nothing" — never having shipped is not evidence of being up to date.
 */
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

async function main() {
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
