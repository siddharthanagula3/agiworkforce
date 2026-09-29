#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

import {
  environmentRoutes,
  findInspectorRoutes,
  parseCargoFeatureArgs,
  readReleaseSources,
  splitArgs,
} from '../apps/desktop/scripts/check-no-devtools.mjs';

const WORKFLOW_DIR = '.github/workflows';
const DESKTOP_WORKFLOW = `${WORKFLOW_DIR}/release-desktop.yml`;
const MOBILE_WORKFLOW = `${WORKFLOW_DIR}/release-mobile.yml`;
const WINDOWS_WORKFLOW = `${WORKFLOW_DIR}/build-windows-release.yml`;
const TAURI_ACTION = 'tauri-apps/tauri-action@';
const DEVTOOLS_CHECK = 'apps/desktop/scripts/check-no-devtools.mjs';
const DEVTOOLS_CHECK_COMMAND =
  /(?:^|[\s;&|(])node\s+(?:\.\/)?apps\/desktop\/scripts\/check-no-devtools\.mjs(?=\s|$)/mu;
const RUNS_AFTER_FAILURE = /\b(?:always|failure|cancelled)\(\s*\)/u;

function stepText(step) {
  return [
    step?.name,
    step?.run,
    step?.uses,
    JSON.stringify(step?.with ?? ''),
    JSON.stringify(step?.env ?? ''),
  ]
    .filter(Boolean)
    .join('\n');
}

function jobText(job) {
  return (job?.steps ?? []).map(stepText).join('\n');
}

function isTauriBundler(step) {
  return String(step?.uses ?? '').startsWith(TAURI_ACTION);
}

function joinedCommand(step) {
  return String(step?.run ?? '').replace(/\\\r?\n/gu, ' ');
}

function bundlesThroughTauriAction(jobs, jobId) {
  const job = jobs[jobId];
  if (!job) return `${jobId} job is missing`;
  if (!(job.steps ?? []).some(isTauriBundler)) {
    return `${jobId} must bundle through tauri-action, the step the webview inspector gate reads`;
  }
  return null;
}

function withEnv(text, env, expandShell) {
  const lookup = (match, name) => (Object.hasOwn(env, name) ? String(env[name]) : match);
  const expressed = text.replace(/\$\{\{\s*env\.([A-Za-z_]\w*)\s*\}\}/gu, lookup);
  return expandShell
    ? expressed.replace(/\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/gu, (match, braced, bare) =>
        lookup(match, braced ?? bare),
      )
    : expressed;
}

function expandsShellVariables(workflow, job, step) {
  const shell =
    step.shell ??
    job.defaults?.run?.shell ??
    workflow.defaults?.run?.shell ??
    (/windows/iu.test(JSON.stringify(job['runs-on'] ?? '')) ? 'pwsh' : 'bash');
  return /^(?:bash|sh)\b/u.test(String(shell));
}

function checkArguments(workflow, job, step) {
  const command = joinedCommand(step);
  const match = DEVTOOLS_CHECK_COMMAND.exec(command);
  const tail = command
    .slice(match.index + match[0].length)
    .split(/\r?\n|\s(?:&&|\|\||[;|<>#])/u)[0];
  const env = { ...workflow.env, ...job.env, ...step.env };
  return splitArgs(withEnv(tail, env, expandsShellVariables(workflow, job, step)));
}

function describeBuild({
  requested,
  noDefaultFeatures,
  allFeatures,
  debug,
  profile,
  cargoConfigs,
}) {
  return [
    noDefaultFeatures ? 'no default features' : 'the default features',
    `features [${[...new Set(requested)].sort().join(', ')}]`,
    allFeatures ? 'all features' : null,
    debug ? '--debug' : null,
    `profile ${profile}`,
    cargoConfigs.length > 0 ? `cargo config [${[...cargoConfigs].sort().join(', ')}]` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export function checkTauriInspectorGate(workflow, sources) {
  const failures = [];
  for (const [jobId, job] of Object.entries(workflow?.jobs ?? {})) {
    const steps = job?.steps ?? [];
    steps.forEach((step, index) => {
      if (!isTauriBundler(step)) return;
      const label = `${jobId}: "${step.name ?? step.uses}"`;
      const env = { ...workflow.env, ...job.env, ...step.env };
      const argsText = withEnv(String(step.with?.args ?? ''), env, false);
      const args = splitArgs(argsText);
      const built = parseCargoFeatureArgs(args);

      const dynamic = (argsText.match(/\$\{\{[^}]*\}\}/gu) ?? []).filter(
        (expression) => !built.configs.includes(expression),
      );
      if (dynamic.length > 0) {
        failures.push(
          `${label} takes ${dynamic.join(' ')} from the run, so no gate can read the build it makes`,
        );
      }
      if (RUNS_AFTER_FAILURE.test(String(step.if ?? ''))) {
        failures.push(
          `${label} runs after a failed step, so a failed devtools check cannot stop it`,
        );
      }
      const routes = [...findInspectorRoutes({ ...sources, args }), ...environmentRoutes(env)];
      if (routes.length > 0) {
        failures.push(`${label} bundles the webview inspector via ${routes.join(', ')}`);
      }

      const check = steps
        .slice(0, index)
        .findLast((candidate) => DEVTOOLS_CHECK_COMMAND.test(joinedCommand(candidate)));
      if (!check) {
        failures.push(`${label} must follow a step that runs node ${DEVTOOLS_CHECK} on its build`);
        return;
      }
      if (check['continue-on-error']) {
        failures.push(`${label} follows a devtools check whose failure does not stop the job`);
      }
      if (check.if !== undefined && check.if !== step.if) {
        failures.push(`${label} follows a devtools check with its own if:, which can skip it`);
      }
      const checkArgs = checkArguments(workflow, job, check);
      const unresolved = checkArgs.filter((arg) => arg.includes('$'));
      if (unresolved.length > 0) {
        failures.push(
          `${label} follows a devtools check whose ${unresolved.join(' ')} does not resolve from the workflow env in its shell`,
        );
        return;
      }
      const bundled = describeBuild(built);
      const checked = describeBuild(parseCargoFeatureArgs(checkArgs));
      if (checked !== bundled) {
        failures.push(`${label} builds ${bundled}, but its devtools check reads ${checked}`);
      }
    });
  }
  return failures;
}

export function checkDesktopReleaseGates(workflow) {
  const failures = [];
  const jobs = workflow?.jobs ?? {};

  for (const jobId of ['build-linux', 'build-macos']) {
    const job = jobs[jobId];
    const bundler = bundlesThroughTauriAction(jobs, jobId);
    if (bundler) failures.push(bundler);
    if (!job) continue;
    const body = jobText(job);
    if (!body.includes('scripts/generate-sbom.mjs')) {
      failures.push(`${jobId} must generate an SBOM with scripts/generate-sbom.mjs`);
    }
    if (!/sbom/iu.test(body) || !body.includes('upload-artifact')) {
      failures.push(`${jobId} must upload the generated SBOM as a build artifact`);
    }
  }

  const cleanInstall = jobs['clean-install-linux'];
  if (!cleanInstall) {
    failures.push('clean-install-linux job is missing: no release is installed on a clean machine');
  } else {
    const body = jobText(cleanInstall);
    if (!cleanInstall.container?.image) {
      failures.push(
        'clean-install-linux must run in a bare container image, not a preloaded runner',
      );
    }
    if (!(cleanInstall.needs ?? []).includes('build-linux')) {
      failures.push('clean-install-linux must consume the artifacts built by build-linux');
    }
    if (body.includes('pnpm install')) {
      failures.push(
        'clean-install-linux must not restore the build toolchain; it is a clean-machine test',
      );
    }
    if (!body.includes('download-artifact')) {
      failures.push(
        'clean-install-linux must download the published artifact rather than rebuild it',
      );
    }
    if (!body.includes('dpkg-deb -f') || !/apt-get install|dpkg -i/u.test(body)) {
      failures.push('clean-install-linux must install the Debian package it downloaded');
    }
    if (!body.includes('ldd')) {
      failures.push(
        'clean-install-linux must prove no shared library is missing on a clean machine',
      );
    }
  }

  const upgrade = jobs['upgrade-from-previous-linux'];
  if (!upgrade) {
    failures.push('upgrade-from-previous-linux job is missing: no upgrade path is tested');
  } else {
    const body = jobText(upgrade);
    if (!body.includes('scripts/verify-desktop-upgrade.mjs')) {
      failures.push(
        'upgrade-from-previous-linux must assert data survival with verify-desktop-upgrade.mjs',
      );
    }
    if (!body.includes('--rollback')) {
      failures.push('upgrade-from-previous-linux must also verify the rollback path');
    }
    if (!body.includes('previous_tag')) {
      failures.push(
        'upgrade-from-previous-linux must install the previously published release first',
      );
    }
  }

  const publish = jobs['publish-release'];
  if (publish) {
    for (const gate of ['clean-install-linux', 'upgrade-from-previous-linux']) {
      if (!(publish.needs ?? []).includes(gate)) {
        failures.push(`publish-release must not publish before ${gate} passes`);
      }
    }
  }

  return failures;
}

export function checkWindowsReleaseGates(workflow) {
  const failure = bundlesThroughTauriAction(workflow?.jobs ?? {}, 'build-windows');
  return failure ? [failure] : [];
}

export function checkMobileReleaseGates(workflow) {
  const failures = [];
  const jobs = workflow?.jobs ?? {};

  const validate = jobs.validate;
  if (!validate) {
    failures.push('validate job is missing');
  } else if (!jobText(validate).includes('release:verify-privacy-declarations')) {
    failures.push(
      'validate must verify the iOS privacy manifest against the Play data-safety declaration',
    );
  }

  const deviceMatrix = jobs['device-matrix-e2e'];
  if (!deviceMatrix) {
    failures.push('device-matrix-e2e job is missing: no release is exercised on a device matrix');
  } else {
    if (!deviceMatrix.strategy?.matrix) {
      failures.push('device-matrix-e2e must declare a strategy matrix of devices');
    }
    if (!jobText(deviceMatrix).includes('test:e2e:ios:ci')) {
      failures.push('device-matrix-e2e must run the mobile end-to-end suite');
    }
  }

  for (const jobId of ['release-ios', 'release-android']) {
    const job = jobs[jobId];
    if (!job) {
      failures.push(`${jobId} job is missing`);
      continue;
    }
    if (!(job.needs ?? []).includes('device-matrix-e2e')) {
      failures.push(`${jobId} must not submit a build the device matrix has not exercised`);
    }
  }

  return failures;
}

function main() {
  const root = process.cwd();
  const failures = [];

  for (const [relativePath, check] of [
    [DESKTOP_WORKFLOW, checkDesktopReleaseGates],
    [WINDOWS_WORKFLOW, checkWindowsReleaseGates],
    [MOBILE_WORKFLOW, checkMobileReleaseGates],
  ]) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) {
      failures.push(`${relativePath}: missing`);
      continue;
    }
    for (const failure of check(parse(fs.readFileSync(absolute, 'utf8')))) {
      failures.push(`${relativePath}: ${failure}`);
    }
  }

  const sources = readReleaseSources(root);
  for (const name of fs.readdirSync(path.join(root, WORKFLOW_DIR)).sort()) {
    if (!/\.ya?ml$/u.test(name)) continue;
    const relativePath = `${WORKFLOW_DIR}/${name}`;
    const workflow = parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    for (const failure of checkTauriInspectorGate(workflow, sources)) {
      failures.push(`${relativePath}: ${failure}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`ERROR: ${failure}\n`);
    }
    process.stderr.write(`\n${failures.length} release gate(s) missing\n`);
    process.exit(1);
  }
  process.stdout.write(
    'release gates present: SBOM, clean-machine install, upgrade + rollback, device matrix, privacy declarations, webview inspector refusal\n',
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
