import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  UNVERIFIED_RELEASE_SURFACES,
  releaseWorkflows,
  staleReleaseWaivers,
  unverifiedReleaseArtifacts,
} from './check-release-artifact-integrity.mjs';

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'release-integrity-'));
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, '.github', 'workflows', name), source, 'utf8');
  }
  return root;
}

function run(files) {
  const root = repoWith(files);
  try {
    return unverifiedReleaseArtifacts(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('producing a checksum without checking it back is not verification', () => {
  const failures = run({ 'release-thing.yml': 'run: sha256sum dist/* > SHA256SUMS\n' });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /without checking a checksum/);
});

test('each way a workflow verifies its artifacts is accepted', () => {
  assert.deepEqual(run({ 'release-a.yml': 'run: sha256sum -c SHA256SUMS\n' }), []);
  assert.deepEqual(run({ 'release-b.yml': 'run: shasum -a 256 -c SHA256SUMS\n' }), []);
  assert.deepEqual(run({ 'release-c.yml': 'run: cosign verify-blob --bundle b.json f\n' }), []);
});

test('a workflow that is not a release surface is out of scope', () => {
  assert.deepEqual(run({ 'ci.yml': 'run: echo no checksums here\n' }), []);
});

test('a waiver that stopped being needed is reported', () => {
  const failures = run({ 'release-mobile.yml': 'run: sha256sum -c SHA256SUMS\n' });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /Remove it from UNVERIFIED_RELEASE_SURFACES/);
});

test('every release workflow in this repo verifies what it publishes', () => {
  assert.ok(releaseWorkflows(process.cwd()).length >= 5);
  assert.deepEqual(unverifiedReleaseArtifacts(process.cwd()), []);
  assert.deepEqual(staleReleaseWaivers(process.cwd()), []);
});

test('the only waived surface is one an app store re-signs', () => {
  assert.deepEqual([...UNVERIFIED_RELEASE_SURFACES.keys()], ['release-mobile.yml']);
});
