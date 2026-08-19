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

test('every CI exclusion is registered with a reason, an owner, and a tracking id', () => {
  assert.deepEqual(checkSecurityGates({ policy, workflow, denyToml }), []);
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
    name: 'Dependency audit (JS) — quietly not blocking',
    run: 'pnpm audit',
    'continue-on-error': true,
  });
  const failures = checkSecurityGates({ policy, workflow: drifted, denyToml });
  assert.deepEqual(failures, [
    'security step "Dependency audit (JS) — quietly not blocking" is continue-on-error but is not registered in .github/security-gate-policy.json',
  ]);
});

test('turning a documented blocking gate into a warning fails the build', () => {
  const drifted = structuredClone(workflow);
  const step = drifted.jobs.security.steps.find(
    (candidate) => candidate.name === 'Dependency audit (JS) — high (blocking, FIX-043)',
  );
  step['continue-on-error'] = true;
  const failures = checkSecurityGates({ policy, workflow: drifted, denyToml });
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
      candidate.name === 'Dependency advisories (Rust) — non-blocking warning-policy debt',
  );
  delete step['continue-on-error'];
  const failures = checkSecurityGates({ policy, workflow: drifted, denyToml });
  assert.ok(failures.some((message) => message.includes('is stale')));
});

test('an unregistered cargo-deny advisory ignore fails the build', () => {
  const drifted = `${denyToml}\n[advisories]\nignore = ["RUSTSEC-2000-0001"]\n`;
  const failures = checkSecurityGates({ policy, workflow, denyToml: drifted });
  assert.ok(failures.some((message) => message.includes('RUSTSEC-2000-0001')));
});

// Pinned to the exact accepted set rather than asserting emptiness: an ignore
// is how a vulnerability with no published fix stops blocking, and pinning it
// here means adding a second one is a deliberate edit to this file, not a quiet
// line in deny.toml.
test('the checked-in cargo-deny advisory ignore list holds only the reviewed exception', () => {
  assert.deepEqual(parseDenyAdvisoryIgnores(denyToml), ['RUSTSEC-2026-0258']);
});
