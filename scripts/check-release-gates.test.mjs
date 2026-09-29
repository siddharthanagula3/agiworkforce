import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { readReleaseSources } from '../apps/desktop/scripts/check-no-devtools.mjs';
import {
  checkDesktopReleaseGates,
  checkMobileReleaseGates,
  checkTauriInspectorGate,
  checkWindowsReleaseGates,
} from './check-release-gates.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sources = readReleaseSources(repositoryRoot);

function loadWorkflow(name) {
  return parse(fs.readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8'));
}

const desktop = loadWorkflow('release-desktop.yml');
const mobile = loadWorkflow('release-mobile.yml');
const windows = loadWorkflow('build-windows-release.yml');

function isDevtoolsCheck(step) {
  return String(step.run ?? '').includes('check-no-devtools.mjs');
}

function isBundler(step) {
  return String(step.uses ?? '').startsWith('tauri-apps/tauri-action@');
}

function windowsWith(change) {
  const broken = structuredClone(windows);
  const job = broken.jobs['build-windows'];
  change({ job, check: job.steps.find(isDevtoolsCheck), bundler: job.steps.find(isBundler) });
  return checkTauriInspectorGate(broken, sources);
}

test('the desktop release workflow satisfies every supply-chain gate', () => {
  assert.deepEqual(checkDesktopReleaseGates(desktop), []);
});

test('the mobile release workflow satisfies every store-readiness gate', () => {
  assert.deepEqual(checkMobileReleaseGates(mobile), []);
});

test('dropping the SBOM step is caught', () => {
  const broken = structuredClone(desktop);
  broken.jobs['build-linux'].steps = broken.jobs['build-linux'].steps.filter(
    (step) => !String(step.run ?? '').includes('generate-sbom.mjs'),
  );
  const failures = checkDesktopReleaseGates(broken);
  assert.ok(failures.some((message) => message.includes('build-linux must generate an SBOM')));
});

test('a clean-install job that rebuilds the repo is not a clean-machine test', () => {
  const broken = structuredClone(desktop);
  broken.jobs['clean-install-linux'].steps.push({
    name: 'Install dependencies',
    run: 'pnpm install --frozen-lockfile',
  });
  delete broken.jobs['clean-install-linux'].container;
  const failures = checkDesktopReleaseGates(broken);
  assert.ok(failures.some((message) => message.includes('bare container image')));
  assert.ok(failures.some((message) => message.includes('clean-machine test')));
});

test('an upgrade job without a rollback leg is caught', () => {
  const broken = structuredClone(desktop);
  broken.jobs['upgrade-from-previous-linux'].steps = broken.jobs[
    'upgrade-from-previous-linux'
  ].steps.filter((step) => !String(step.run ?? '').includes('--rollback'));
  const failures = checkDesktopReleaseGates(broken);
  assert.ok(failures.some((message) => message.includes('rollback path')));
});

test('publishing without the install and upgrade gates is caught', () => {
  const broken = structuredClone(desktop);
  broken.jobs['publish-release'].needs = ['prepare-release', 'build-linux', 'build-macos'];
  const failures = checkDesktopReleaseGates(broken);
  assert.equal(
    failures.filter((message) => message.startsWith('publish-release must not publish')).length,
    2,
  );
});

test('submitting to a store without the device matrix is caught', () => {
  const broken = structuredClone(mobile);
  broken.jobs['release-ios'].needs = ['validate'];
  delete broken.jobs['device-matrix-e2e'];
  const failures = checkMobileReleaseGates(broken);
  assert.ok(failures.some((message) => message.includes('device-matrix-e2e job is missing')));
  assert.ok(failures.some((message) => message.includes('release-ios must not submit')));
});

test('dropping the privacy declaration check is caught', () => {
  const broken = structuredClone(mobile);
  broken.jobs.validate.steps = broken.jobs.validate.steps.map((step) => ({
    ...step,
    run: String(step.run ?? '').replace('release:verify-privacy-declarations', 'true'),
  }));
  const failures = checkMobileReleaseGates(broken);
  assert.ok(failures.some((message) => message.includes('Play data-safety declaration')));
});

test('every tauri-action step in every workflow follows a devtools check on the same build', () => {
  const directory = path.join(repositoryRoot, '.github/workflows');
  let bundlers = 0;
  for (const name of fs.readdirSync(directory).filter((file) => /\.ya?ml$/u.test(file))) {
    const workflow = loadWorkflow(name);
    bundlers += Object.values(workflow.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).filter(isBundler),
    ).length;
    assert.deepEqual(checkTauriInspectorGate(workflow, sources), [], name);
  }
  assert.equal(bundlers, 3);
  assert.deepEqual(checkWindowsReleaseGates(windows), []);
});

test('a tauri-action step with no devtools check before it is caught', () => {
  const broken = structuredClone(desktop);
  broken.jobs['build-linux'].steps = broken.jobs['build-linux'].steps.filter(
    (step) => !isDevtoolsCheck(step),
  );
  assert.deepEqual(checkTauriInspectorGate(broken, sources), [
    'build-linux: "Build Tauri app" must follow a step that runs node apps/desktop/scripts/check-no-devtools.mjs on its build',
  ]);
});

test('a devtools check that runs after the bundler is caught', () => {
  const broken = structuredClone(desktop);
  const steps = broken.jobs['build-macos'].steps;
  const [check] = steps.splice(steps.findIndex(isDevtoolsCheck), 1);
  steps.splice(steps.findIndex(isBundler) + 1, 0, check);
  const failures = checkTauriInspectorGate(broken, sources);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^build-macos: .* must follow a step that runs node/u);
});

test('an echo of the check path does not count as running it', () => {
  const failures = windowsWith(({ check }) => {
    check.run = 'echo "run apps/desktop/scripts/check-no-devtools.mjs by hand"';
  });
  assert.match(failures[0], /must follow a step that runs node/u);
});

test('the env-hoisted Windows feature set resolves, and devtools in it is caught', () => {
  const failures = windowsWith(({ job }) => {
    job.env.TAURI_CARGO_FEATURE_ARGS = '--no-default-features --features shell,devtools';
  });
  assert.deepEqual(failures, [
    'build-windows: "Build Tauri Windows app" bundles the webview inspector via the devtools feature, the tauri/devtools feature',
  ]);
});

test('a devtools check that reads a different feature set than the bundler is caught', () => {
  const failures = windowsWith(({ check }) => {
    check.run =
      'node apps/desktop/scripts/check-no-devtools.mjs --no-default-features --features shell';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /builds no default features, features \[billing, remote-databases/u);
  assert.match(
    failures[0],
    /but its devtools check reads no default features, features \[shell\]/u,
  );
});

test('a check under a shell that does not expand the variable cannot vouch for the build', () => {
  const failures = windowsWith(({ check }) => {
    delete check.shell;
  });
  assert.deepEqual(failures, [
    'build-windows: "Build Tauri Windows app" follows a devtools check whose $TAURI_CARGO_FEATURE_ARGS does not resolve from the workflow env in its shell',
  ]);
});

test('bundler arguments decided at run time are refused', () => {
  const failures = windowsWith(({ bundler }) => {
    bundler.with.args += ' ${{ inputs.extra_features }}';
  });
  assert.deepEqual(failures, [
    'build-windows: "Build Tauri Windows app" takes ${{ inputs.extra_features }} from the run, so no gate can read the build it makes',
  ]);
});

test('a check that cannot stop the bundler is caught', () => {
  const failures = windowsWith(({ check, bundler }) => {
    check['continue-on-error'] = true;
    check.if = "github.event_name == 'push'";
    bundler.if = 'always()';
  });
  assert.equal(failures.length, 3);
  assert.match(failures[0], /runs after a failed step/u);
  assert.match(failures[1], /whose failure does not stop the job/u);
  assert.match(failures[2], /with its own if:, which can skip it/u);
});

test('debug assertions switched on in the bundler environment are caught', () => {
  const failures = windowsWith(({ bundler }) => {
    bundler.env.CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS = 'true';
  });
  assert.deepEqual(failures, [
    'build-windows: "Build Tauri Windows app" bundles the webview inspector via CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS in the environment',
  ]);
});

test('a release job that stops bundling through tauri-action is caught', () => {
  const broken = structuredClone(desktop);
  broken.jobs['build-linux'].steps = broken.jobs['build-linux'].steps.map((step) =>
    isBundler(step)
      ? { name: step.name, run: 'pnpm --filter @agiworkforce/desktop tauri build' }
      : step,
  );
  assert.ok(
    checkDesktopReleaseGates(broken).includes(
      'build-linux must bundle through tauri-action, the step the webview inspector gate reads',
    ),
  );
  const brokenWindows = structuredClone(windows);
  delete brokenWindows.jobs['build-windows'];
  assert.deepEqual(checkWindowsReleaseGates(brokenWindows), ['build-windows job is missing']);
});
