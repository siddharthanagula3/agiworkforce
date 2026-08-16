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
