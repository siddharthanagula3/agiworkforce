import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { checkDesktopReleaseGates, checkMobileReleaseGates } from './check-release-gates.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadWorkflow(name) {
  return parse(fs.readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8'));
}

const desktop = loadWorkflow('release-desktop.yml');
const mobile = loadWorkflow('release-mobile.yml');

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
