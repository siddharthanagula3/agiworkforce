import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import {
  checkSecurityGates,
  collectContinueOnErrorSteps,
  parseDenyAdvisoryIgnores,
} from './check-security-gates.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, '.github/security-gate-policy.json'), 'utf8'),
);
const workflow = parse(fs.readFileSync(path.join(repositoryRoot, policy.workflow), 'utf8'));
const denyToml = fs.readFileSync(path.join(repositoryRoot, 'deny.toml'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const lockfile = parse(fs.readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'));

// Gates that name their own workflow, the scanners that need Docker and a booted
// application, are loaded the same way the script loads them.
const workflows = Object.fromEntries(
  [...new Set((policy.gates ?? []).map((gate) => gate.workflow).filter(Boolean))].map(
    (relativePath) => [
      relativePath,
      parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')),
    ],
  ),
);

const WAIVER_TODAY = '2026-10-01';
const WAIVER_ADVISORY = 'GHSA-0000-0000-0000';

function scopedLockfile() {
  return {
    importers: {
      '.': { devDependencies: { prettier: { specifier: '^3.0.0', version: '3.0.0' } } },
      'apps/mobile': {
        dependencies: { 'mobile-kit': { specifier: '^1.0.0', version: '1.0.0' } },
        devDependencies: { 'build-tool': { specifier: '^3.0.0', version: '3.0.0' } },
      },
      'apps/web': { dependencies: { 'web-kit': { specifier: '^2.0.0', version: '2.0.0' } } },
      'packages/shared': { dependencies: {} },
    },
    snapshots: {
      'prettier@3.0.0': {},
      'mobile-kit@1.0.0': { dependencies: { 'build-tool': '3.0.0' } },
      'build-tool@3.0.0': { dependencies: { 'waived-package': '1.4.0' } },
      'web-kit@2.0.0': {},
      'waived-package@1.4.0': {},
    },
  };
}

function scopedWaiverFailures(options) {
  return auditWaiverFailures(options).filter((message) =>
    message.startsWith('exclusion scoped-audit-waiver '),
  );
}

function auditWaiverFailures({
  entry = {},
  lockfile: scenario = scopedLockfile(),
  today = WAIVER_TODAY,
  ignores = [WAIVER_ADVISORY],
} = {}) {
  const waived = structuredClone(policy);
  waived.exclusions.push({
    id: 'scoped-audit-waiver',
    kind: 'pnpm-audit-advisory-ignore',
    advisories: ['GHSA-0000-0000-0000'],
    package: 'waived-package',
    dependents: { packages: ['build-tool'], importers: ['apps/mobile'] },
    reason: 'Reachable only from build tooling.',
    owner: 'Platform lead',
    tracking: 'GHSA-0000-0000-0000',
    expires: '2026-10-31',
    ...entry,
  });
  const ignoring = structuredClone(manifest);
  ignoring.pnpm.auditConfig = {
    ...ignoring.pnpm.auditConfig,
    ignoreGhsas: [...(ignoring.pnpm.auditConfig?.ignoreGhsas ?? []), ...ignores],
  };
  return checkSecurityGates({
    policy: waived,
    workflow,
    denyToml,
    workflows,
    manifest: ignoring,
    lockfile: scenario,
    today,
  });
}

test('every CI exclusion is registered with a reason, an owner, and a tracking id', () => {
  assert.deepEqual(
    checkSecurityGates({ policy, workflow, denyToml, workflows, manifest, lockfile }),
    [],
  );
});

test('the registry accounts for exactly the exclusions CI actually has', () => {
  const found = collectContinueOnErrorSteps(workflow);
  const registered = (policy.exclusions ?? []).filter(
    (entry) => entry.kind === 'continue-on-error',
  );
  assert.equal(found.length, registered.length);
});

test('a new continue-on-error step nobody registered fails the build', () => {
  const drifted = structuredClone(workflow);
  drifted.jobs.security.steps.push({
    name: 'Dependency audit (JS), quietly not blocking',
    run: 'pnpm audit',
    'continue-on-error': true,
  });
  const failures = checkSecurityGates({
    policy,
    workflow: drifted,
    denyToml,
    workflows,
    manifest,
    lockfile,
  });
  assert.deepEqual(failures, [
    'security step "Dependency audit (JS), quietly not blocking" is continue-on-error but is not registered in .github/security-gate-policy.json',
  ]);
});

test('turning a documented blocking gate into a warning fails the build', () => {
  const drifted = structuredClone(workflow);
  const step = drifted.jobs.security.steps.find(
    (candidate) => candidate.name === 'Dependency audit (JS), high (blocking, FIX-043)',
  );
  step['continue-on-error'] = true;
  const failures = checkSecurityGates({
    policy,
    workflow: drifted,
    denyToml,
    workflows,
    manifest,
    lockfile,
  });
  assert.ok(
    failures.some((message) =>
      message.includes('js-dependency-audit-high is registered as blocking'),
    ),
  );
});

test('an exclusion left behind after the step starts blocking is reported as stale', () => {
  const drifted = structuredClone(workflow);
  const step = drifted.jobs['rust-desktop-cli'].steps.find(
    (candidate) =>
      candidate.name === 'Dependency advisories (Rust), non-blocking warning-policy debt',
  );
  delete step['continue-on-error'];
  const failures = checkSecurityGates({
    policy,
    workflow: drifted,
    denyToml,
    workflows,
    manifest,
    lockfile,
  });
  assert.ok(failures.some((message) => message.includes('is stale')));
});

test('an unregistered cargo-deny advisory ignore fails the build', () => {
  const drifted = `${denyToml}\n[advisories]\nignore = ["RUSTSEC-2000-0001"]\n`;
  const failures = checkSecurityGates({
    policy,
    workflow,
    denyToml: drifted,
    workflows,
    manifest,
    lockfile,
  });
  assert.ok(failures.some((message) => message.includes('RUSTSEC-2000-0001')));
});

test('the checked-in cargo-deny advisory policy suppresses no vulnerabilities', () => {
  assert.deepEqual(parseDenyAdvisoryIgnores(denyToml), []);
});

test('a pnpm audit ignore nobody registered fails the build', () => {
  const drifted = structuredClone(manifest);
  drifted.pnpm.auditConfig = {
    ...drifted.pnpm.auditConfig,
    ignoreGhsas: [...(drifted.pnpm.auditConfig?.ignoreGhsas ?? []), 'GHSA-0000-0000-0000'],
  };
  const failures = checkSecurityGates({
    policy,
    workflow,
    denyToml,
    workflows,
    manifest: drifted,
    lockfile,
    today: WAIVER_TODAY,
  });
  assert.deepEqual(failures, [
    'package.json ignores GHSA-0000-0000-0000 without registering it in .github/security-gate-policy.json',
  ]);
});

test('a pnpm audit waiver fails the build once it expires', () => {
  assert.deepEqual(auditWaiverFailures({ entry: { expires: '2026-01-01' }, today: '2026-01-02' }), [
    'exclusion scoped-audit-waiver expired on 2026-01-01: fix the advisory or re-triage the waiver',
  ]);
});

test('a waiver whose expiry is not a real calendar date fails the build', () => {
  for (const expires of ['2026-13-99', '2026-02-30']) {
    assert.deepEqual(scopedWaiverFailures({ entry: { expires }, today: '2026-12-31' }), [
      'exclusion scoped-audit-waiver must set expires to a real calendar date in YYYY-MM-DD form',
    ]);
  }
});

test('a day-month typo in the expiry does not keep the waiver alive', () => {
  assert.deepEqual(
    scopedWaiverFailures({ entry: { expires: '2026-31-10' }, today: '2026-12-31' }),
    ['exclusion scoped-audit-waiver must set expires to a real calendar date in YYYY-MM-DD form'],
  );
});

test('a waiver left registered after package.json stops ignoring it is reported as stale', () => {
  assert.deepEqual(auditWaiverFailures({ ignores: [] }), [
    'exclusion scoped-audit-waiver is stale: package.json no longer ignores GHSA-0000-0000-0000',
  ]);
});

test('a waiver whose dependents and importers match the lockfile passes', () => {
  assert.deepEqual(auditWaiverFailures(), []);
});

test('a waiver that names no package or permitted dependents fails the build', () => {
  assert.deepEqual(auditWaiverFailures({ entry: { package: undefined, dependents: undefined } }), [
    'exclusion scoped-audit-waiver must name the waived package and the dependents and importers allowed to reach it',
  ]);
});

test('a waiver cannot be scoped without the lockfile', () => {
  assert.deepEqual(scopedWaiverFailures({ lockfile: null }), [
    'exclusion scoped-audit-waiver cannot be scoped without the importers and snapshots of pnpm-lock.yaml',
  ]);
});

test('a new parent of the waived package fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/web'].dependencies.selfsigned = { specifier: '^2.4.1', version: '2.4.1' };
  drifted.snapshots['selfsigned@2.4.1'] = { dependencies: { 'waived-package': '1.4.0' } };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but selfsigned also depends on it in pnpm-lock.yaml',
    'exclusion scoped-audit-waiver waives waived-package for apps/mobile only, but apps/web also reaches it in pnpm-lock.yaml',
  ]);
});

test('a parent that depends on the waived package through an alias fails the build', () => {
  const drifted = scopedLockfile();
  drifted.snapshots['mobile-kit@1.0.0'].dependencies['forge-alias'] = 'waived-package@1.4.0';
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but mobile-kit also depends on it in pnpm-lock.yaml',
  ]);
});

test('an allowed importer that depends on the waived package directly fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/mobile'].dependencies['waived-package'] = {
    specifier: '^1.4.0',
    version: '1.4.0',
  };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but apps/mobile also depends on it in pnpm-lock.yaml',
  ]);
});

test('an allowed importer that aliases the waived package fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/mobile'].dependencies.rsa = {
    specifier: 'npm:waived-package@1.4.0',
    version: 'waived-package@1.4.0',
  };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for build-tool only, but apps/mobile also depends on it in pnpm-lock.yaml',
  ]);
});

test('an importer listed as a permitted dependent may depend on the waived package directly', () => {
  const drifted = scopedLockfile();
  drifted.importers['apps/mobile'].dependencies['waived-package'] = {
    specifier: '^1.4.0',
    version: '1.4.0',
  };
  const dependents = { packages: ['apps/mobile', 'build-tool'], importers: ['apps/mobile'] };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted, entry: { dependents } }), []);
});

test('another importer reaching the waived package through a permitted dependent fails the build', () => {
  const drifted = scopedLockfile();
  drifted.importers['packages/shared'].dependencies['build-tool'] = {
    specifier: '^3.0.0',
    version: '3.0.0',
  };
  drifted.importers['apps/web'].dependencies['@example/shared'] = {
    specifier: 'workspace:*',
    version: 'link:../../packages/shared',
  };
  assert.deepEqual(auditWaiverFailures({ lockfile: drifted }), [
    'exclusion scoped-audit-waiver waives waived-package for apps/mobile only, but apps/web also reaches it in pnpm-lock.yaml',
    'exclusion scoped-audit-waiver waives waived-package for apps/mobile only, but packages/shared also reaches it in pnpm-lock.yaml',
  ]);
});
