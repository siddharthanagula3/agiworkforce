import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE_PATH,
  REPO_ROOT,
  checkSupplyChain,
  containerFiles,
  imageReferences,
  tagOf,
  workspaceInstalls,
} from './check-supply-chain.mjs';

const roots = [];

const CLEAN_WORKFLOW = `jobs:
  a:
    steps:
      - run: pnpm install --frozen-lockfile
`;

function fixture({ files = {}, workflow = CLEAN_WORKFLOW, baseline, manifest }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supply-chain-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts/config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(manifest ?? { pnpm: { onlyBuiltDependencies: ['sharp'] } }),
  );
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  fs.writeFileSync(path.join(root, '.github/workflows/ci.yml'), workflow);
  for (const [relative, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), body);
  }
  if (baseline !== undefined) {
    fs.writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  }
  return root;
}

const REASON =
  'Recorded by the fixture to stand in for a real reason that says why this reference is still here and who owes the fix.';

test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

test('a digest-pinned image passes and a latest tag fails', () => {
  const pinned = fixture({
    files: { Dockerfile: 'FROM node:24-alpine@sha256:' + 'a'.repeat(64) + '\n' },
  });
  assert.deepEqual(checkSupplyChain(pinned).failures, []);

  const moving = fixture({ files: { 'docker-compose.yml': '  image: acme/api:latest\n' } });
  assert.match(checkSupplyChain(moving).failures.join('\n'), /whatever was pushed last/);

  const untagged = fixture({ files: { 'docker-compose.yml': '  image: acme/api\n' } });
  assert.match(checkSupplyChain(untagged).failures.join('\n'), /whatever was pushed last/);
});

test('a tag that is not a digest is reported separately from a moving tag', () => {
  const root = fixture({ files: { Dockerfile: 'FROM node:24-alpine\n' } });
  const failures = checkSupplyChain(root).failures;
  assert.equal(failures.length, 1);
  assert.match(failures[0], /by tag, not by digest/);
});

test('a build argument is not read as an image name', () => {
  const root = fixture({
    files: {
      Dockerfile: 'ARG BASE=node:24@sha256:' + 'b'.repeat(64) + '\nFROM ${BASE} AS build\n',
    },
  });
  assert.deepEqual(checkSupplyChain(root).failures, []);
});

test('an unfrozen workspace install fails, and a pinned tool install does not', () => {
  const unfrozen = fixture({
    workflow: 'jobs:\n  a:\n    steps:\n      - run: pnpm install\n',
  });
  assert.match(checkSupplyChain(unfrozen).failures.join('\n'), /without a frozen lockfile/);

  const tool = fixture({
    workflow:
      'jobs:\n  a:\n    steps:\n      - run: |\n          npm install --global vercel@58.4.0\n          pnpm exec playwright install --with-deps\n          pnpm install --frozen-lockfile\n',
  });
  assert.deepEqual(checkSupplyChain(tool).failures, []);
});

test('a download piped into a shell fails', () => {
  const root = fixture({
    workflow:
      'jobs:\n  a:\n    steps:\n      - run: |\n          curl -fsSL https://example.com/i.sh | sh\n          pnpm install --frozen-lockfile\n',
  });
  assert.match(
    checkSupplyChain(root).failures.join('\n'),
    /pipes a download straight into a shell/,
  );
});

test('an install-script allowlist and a lockfile are both required', () => {
  const noAllowlist = fixture({ manifest: {} });
  assert.match(checkSupplyChain(noAllowlist).failures.join('\n'), /onlyBuiltDependencies/);

  const noLock = fixture({});
  fs.rmSync(path.join(noLock, 'pnpm-lock.yaml'));
  assert.match(checkSupplyChain(noLock).failures.join('\n'), /pnpm-lock\.yaml is missing/);
});

test('a baseline entry needs a reason and dies when it stops matching', () => {
  const labelled = fixture({
    files: { 'docker-compose.yml': '  image: acme/api:latest\n' },
    baseline: { 'moving-tags': [{ id: 'docker-compose.yml:acme/api:latest', reason: 'legacy' }] },
  });
  assert.match(checkSupplyChain(labelled).failures.join('\n'), /needs a reason, not a label/);

  const declared = fixture({
    files: { 'docker-compose.yml': '  image: acme/api:latest\n' },
    baseline: { 'moving-tags': [{ id: 'docker-compose.yml:acme/api:latest', reason: REASON }] },
  });
  assert.deepEqual(checkSupplyChain(declared).failures, []);

  const stale = fixture({
    baseline: { 'moving-tags': [{ id: 'gone.yml:acme/api:latest', reason: REASON }] },
  });
  assert.match(checkSupplyChain(stale).failures.join('\n'), /no longer matches anything/);
});

test('an empty workflow walk fails rather than passing silently', () => {
  const root = fixture({
    workflow: 'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n',
  });
  assert.match(checkSupplyChain(root).failures.join('\n'), /the walk would be empty/);
});

test('helpers read what they claim to read', () => {
  assert.equal(tagOf('ghcr.io/org/app:1.2.3'), '1.2.3');
  assert.equal(tagOf('ghcr.io:5000/org/app'), null);
  assert.deepEqual(
    imageReferences('FROM node:24 AS a\n  image: "redis:7"\n', 'f').map((r) => r.reference),
    ['node:24', 'redis:7'],
  );
  assert.deepEqual(
    workspaceInstalls({ file: 'f', line: 1, body: 'npm ci --ignore-scripts' }).map(
      (i) => i.command,
    ),
    ['npm ci --ignore-scripts'],
  );
});

test('the repository itself passes and the walk finds its containers', () => {
  const { failures, images, installs } = checkSupplyChain(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.ok(images > 0, 'the repository builds containers');
  assert.ok(installs > 0, 'CI installs the workspace');
  assert.ok(containerFiles(REPO_ROOT).includes('apps/web/Dockerfile'));
});
