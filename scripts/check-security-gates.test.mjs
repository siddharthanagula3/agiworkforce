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

test('every CI exclusion is registered with a reason, an owner, and a tracking id', () => {
  assert.deepEqual(checkSecurityGates({ policy, workflow, denyToml, workflows, manifest }), []);
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
  const failures = checkSecurityGates({ policy, workflow: drifted, denyToml, workflows, manifest });
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
  const failures = checkSecurityGates({ policy, workflow: drifted, denyToml, workflows, manifest });
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
  const failures = checkSecurityGates({ policy, workflow: drifted, denyToml, workflows, manifest });
  assert.ok(failures.some((message) => message.includes('is stale')));
});

test('an unregistered cargo-deny advisory ignore fails the build', () => {
  const drifted = `${denyToml}\n[advisories]\nignore = ["RUSTSEC-2000-0001"]\n`;
  const failures = checkSecurityGates({ policy, workflow, denyToml: drifted, workflows, manifest });
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
  const failures = checkSecurityGates({ policy, workflow, denyToml, workflows, manifest: drifted });
  assert.deepEqual(failures, [
    'package.json ignores GHSA-0000-0000-0000 without registering it in .github/security-gate-policy.json',
  ]);
});

test('a pnpm audit waiver fails the build once it expires', () => {
  const drifted = structuredClone(policy);
  drifted.exclusions.push({
    id: 'expired-audit-waiver',
    kind: 'pnpm-audit-advisory-ignore',
    advisories: ['GHSA-0000-0000-0000'],
    reason: 'Reachable only from build tooling.',
    owner: 'Platform lead',
    tracking: 'GHSA-0000-0000-0000',
    expires: '2026-01-01',
  });
  const ignoring = structuredClone(manifest);
  ignoring.pnpm.auditConfig = {
    ...ignoring.pnpm.auditConfig,
    ignoreGhsas: [...(ignoring.pnpm.auditConfig?.ignoreGhsas ?? []), 'GHSA-0000-0000-0000'],
  };
  const failures = checkSecurityGates({
    policy: drifted,
    workflow,
    denyToml,
    workflows,
    manifest: ignoring,
    today: '2026-01-02',
  });
  assert.deepEqual(failures, [
    'exclusion expired-audit-waiver expired on 2026-01-01: fix the advisory or re-triage the waiver',
  ]);
});
