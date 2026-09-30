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
  checkRustLockfileGate,
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

test('the Windows devtools check must read the generated overlay passed to the bundler', () => {
  const failures = windowsWith(({ check }) => {
    check.run = 'node apps/desktop/scripts/check-no-devtools.mjs $TAURI_CARGO_FEATURE_ARGS';
  });
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /builds .*Tauri config \[\$\{\{ steps\.windows-signing\.outputs\.tauri_config \}\}\]/u,
  );
  assert.match(failures[0], /but its devtools check reads/u);
});

test('different overlay identities cannot pass as the same feature set', () => {
  const failures = windowsWith(({ check, bundler }) => {
    bundler.with.args = '--config \'{"bundle":{"active":true}}\' --bundles nsis';
    check.run =
      'node apps/desktop/scripts/check-no-devtools.mjs --config \'{"bundle":{"active":false}}\'';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /Tauri config \[\{"bundle":\{"active":true\}\}\]/u);
  assert.match(failures[0], /Tauri config \[\{"bundle":\{"active":false\}\}\]/u);
});

test('runtime overlays must come from a preceding step and the same checked output', () => {
  const failures = windowsWith(({ check, bundler }) => {
    bundler.with.args = '--config "${{ inputs.config }}" --bundles nsis';
    check.run = 'node apps/desktop/scripts/check-no-devtools.mjs --config "${{ inputs.config }}"';
  });
  assert.ok(failures.some((message) => message.includes('no gate can read the build it makes')));
  assert.ok(failures.some((message) => message.includes('does not resolve from the workflow env')));
});

test('every committed workflow keeps Cargo and cross workspace resolution locked', () => {
  const directory = path.join(repositoryRoot, '.github/workflows');
  let commands = 0;
  for (const name of fs.readdirSync(directory).filter((file) => /\.ya?ml$/u.test(file))) {
    const workflow = loadWorkflow(name);
    const run = Object.values(workflow.jobs ?? {})
      .flatMap((job) => (job.steps ?? []).map((step) => String(step.run ?? '')))
      .join('\n');
    commands += [...run.matchAll(/\b(?:cargo|cross)\s+(?:build|test|check|clippy|bench|rustc)\b/gu)]
      .length;
    assert.deepEqual(checkRustLockfileGate(workflow), [], name);
  }
  assert.ok(commands > 0);
});

test('unlocked commands cannot borrow a flag from another command, comment or test tail', () => {
  for (const run of [
    'cargo test -p agiworkforce-cli && cargo clippy --locked --lib',
    'xvfb-run --auto-servernum cargo test --lib # --locked',
    'matched=$(cargo test --lib -- --list --locked)',
    'cross build --release',
    'cargo check --workspace',
    'cargo clippy --workspace --lib -- -D warnings',
  ]) {
    const workflow = { jobs: { rust: { steps: [{ run }] } } };
    assert.equal(checkRustLockfileGate(workflow).length, 1, run);
  }
  for (const run of [
    'cargo test --locked --lib && cargo clippy --locked --lib -- -D warnings',
    'matched=$(cargo test --locked --lib -- --list)',
    'cross build --locked --release',
    'cargo check --locked --workspace',
    'cargo clippy --locked --workspace --lib -- -D warnings',
    '# cargo test --lib\ncargo fmt --all -- --check',
  ]) {
    const workflow = { jobs: { rust: { steps: [{ run }] } } };
    assert.deepEqual(checkRustLockfileGate(workflow), [], run);
  }
});

test('Tauri bundlers cannot borrow the lockfile flag from a neighboring Rust step', () => {
  for (const args of [
    '--bundles nsis',
    '--locked --bundles nsis',
    '--bundles nsis -- -- --locked',
  ]) {
    const workflow = {
      jobs: {
        release: {
          steps: [
            { run: 'cargo build --locked --release' },
            { uses: windows.jobs['build-windows'].steps.find(isBundler).uses, with: { args } },
          ],
        },
      },
    };
    const failures = checkRustLockfileGate(workflow);
    assert.equal(failures.length, 1, args);
    assert.ok(failures[0].includes('Tauri Cargo tail'));
  }
});

test('Tauri bundlers pass the lockfile flag through the actual Cargo tail', () => {
  for (const args of ['--bundles nsis -- --locked', '--bundles nsis -- ${{ env.CARGO_ARGS }}']) {
    const workflow = {
      env: { CARGO_ARGS: '--locked --no-default-features --features shell' },
      jobs: {
        release: {
          steps: [
            { uses: windows.jobs['build-windows'].steps.find(isBundler).uses, with: { args } },
          ],
        },
      },
    };
    assert.deepEqual(checkRustLockfileGate(workflow), [], args);
  }
});

test('removing the Cargo tail lockfile flag from a real Tauri bundler fails the gate', () => {
  const workflow = structuredClone(desktop);
  const bundler = workflow.jobs['build-linux'].steps.find(isBundler);
  bundler.with.args = bundler.with.args.replace('--locked', '');
  assert.equal(checkRustLockfileGate(workflow).length, 1);
});

test('removing the lockfile flag from a real Rust CI step fails the gate', () => {
  const workflow = loadWorkflow('ci.yml');
  const step = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((step) =>
      String(step.run ?? '').includes('cargo test --locked -p agiworkforce-model-registry'),
    );
  assert.ok(step);
  step.run = step.run.replace('cargo test --locked', 'cargo test');
  assert.equal(checkRustLockfileGate(workflow).length, 1);
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
