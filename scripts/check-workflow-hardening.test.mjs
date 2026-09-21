import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  WORKFLOW_DIR,
  checkWorkflowHardening,
  isDeployJob,
  resolvedPermissions,
  unpinnedAction,
  workflowFiles,
  writeScopes,
} from './check-workflow-hardening.mjs';

const roots = [];

const EMPTY_CONTRACT = {
  trustedActionPrefixes: ['actions'],
  productionEnvironments: ['production-web'],
  allowedWriteScopes: [],
  knownGaps: {
    unpinnedActions: [],
    implicitPermissions: [],
    missingJobTimeout: [],
    deployWithoutEnvironment: [],
    runInterpolatesUntrustedInput: [],
  },
};

const CLEAN_WORKFLOW = `
name: Clean
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: third/party@1111111111111111111111111111111111111111
      - run: pnpm test
`;

function fixture(workflows, contract = EMPTY_CONTRACT) {
  const root = mkdtempSync(path.join(tmpdir(), 'workflow-hardening-'));
  roots.push(root);
  mkdirSync(path.join(root, WORKFLOW_DIR), { recursive: true });
  mkdirSync(path.join(root, path.dirname(CONTRACT_PATH)), { recursive: true });
  writeFileSync(path.join(root, CONTRACT_PATH), JSON.stringify(contract));
  for (const [name, body] of Object.entries(workflows)) {
    writeFileSync(path.join(root, WORKFLOW_DIR, name), body);
  }
  return root;
}

function errorsFor(workflows, contract) {
  return checkWorkflowHardening(fixture(workflows, contract)).errors;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors, report } = checkWorkflowHardening(REPO_ROOT);
  assert.deepEqual(errors, []);
  assert.ok(report.workflows > 20, 'every workflow in the repository is measured');
  assert.ok(report.jobs > report.workflows);
  assert.ok(report.actions > 0);
});

test('it reads every workflow file in the repository, not a listed subset', () => {
  assert.ok(workflowFiles(REPO_ROOT).includes('deploy-production.yml'));
  assert.ok(workflowFiles(REPO_ROOT).includes('ci.yml'));
});

test('a synthetic clean workflow passes', () => {
  assert.deepEqual(errorsFor({ 'clean.yml': CLEAN_WORKFLOW }), []);
});

test('an action pinned to a tag fails', () => {
  const errors = errorsFor({
    'tagged.yml': CLEAN_WORKFLOW.replace(
      'third/party@1111111111111111111111111111111111111111',
      'third/party@v3',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unpinnedActions/);
  assert.match(errors[0], /third\/party@v3/);
});

test('an action pinned to a short sha fails', () => {
  const errors = errorsFor({
    'short.yml': CLEAN_WORKFLOW.replace(
      'third/party@1111111111111111111111111111111111111111',
      'third/party@1111111',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /40 character commit sha/);
});

test('a job that declares no permissions anywhere fails', () => {
  const errors = errorsFor({
    'implicit.yml': CLEAN_WORKFLOW.replace('permissions:\n  contents: read\n', ''),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /implicitPermissions: implicit\.yml:build/);
});

test('write-all fails outright and cannot be baselined', () => {
  const errors = errorsFor({
    'writeall.yml': CLEAN_WORKFLOW.replace(
      'permissions:\n  contents: read',
      'permissions: write-all',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /resolves to write-all/);
});

test('an undeclared write scope fails and a declared one passes', () => {
  const granted = CLEAN_WORKFLOW.replace('contents: read', 'contents: write');
  assert.match(errorsFor({ 'w.yml': granted })[0], /grants a write scope/);
  assert.deepEqual(
    errorsFor(
      { 'w.yml': granted },
      {
        ...EMPTY_CONTRACT,
        allowedWriteScopes: [{ id: 'w.yml:build:contents', reason: 'it uploads the release' }],
      },
    ),
    [],
  );
});

test('a declared write scope with no reason fails', () => {
  const errors = errorsFor(
    { 'w.yml': CLEAN_WORKFLOW.replace('contents: read', 'contents: write') },
    { ...EMPTY_CONTRACT, allowedWriteScopes: [{ id: 'w.yml:build:contents', reason: '  ' }] },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /carries no reason/);
});

test('a write scope allowance that no job still needs fails', () => {
  const errors = errorsFor(
    { 'clean.yml': CLEAN_WORKFLOW },
    {
      ...EMPTY_CONTRACT,
      allowedWriteScopes: [{ id: 'gone.yml:build:contents', reason: 'it used to upload' }],
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot outlive the need/);
});

test('a job with no timeout fails, and a baselined one needs a reason and a fix', () => {
  const noTimeout = CLEAN_WORKFLOW.replace('    timeout-minutes: 10\n', '');
  assert.match(errorsFor({ 't.yml': noTimeout })[0], /missingJobTimeout: t\.yml:build/);

  assert.deepEqual(
    errorsFor(
      { 't.yml': noTimeout },
      {
        ...EMPTY_CONTRACT,
        knownGaps: {
          ...EMPTY_CONTRACT.knownGaps,
          missingJobTimeout: [
            { id: 't.yml:build', reason: 'the workflow is frozen', fix: 'timeout-minutes: 10' },
          ],
        },
      },
    ),
    [],
  );

  const noFix = errorsFor(
    { 't.yml': noTimeout },
    {
      ...EMPTY_CONTRACT,
      knownGaps: {
        ...EMPTY_CONTRACT.knownGaps,
        missingJobTimeout: [{ id: 't.yml:build', reason: 'the workflow is frozen' }],
      },
    },
  );
  assert.equal(noFix.length, 1);
  assert.match(noFix[0], /names no fix/);
});

test('a baseline entry that no longer violates the rule fails', () => {
  const errors = errorsFor(
    { 'clean.yml': CLEAN_WORKFLOW },
    {
      ...EMPTY_CONTRACT,
      knownGaps: {
        ...EMPTY_CONTRACT.knownGaps,
        missingJobTimeout: [{ id: 'clean.yml:build', reason: 'stale', fix: 'timeout-minutes: 10' }],
      },
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot grow back/);
});

test('a deploy job with no concurrency group fails', () => {
  const deploy = `
name: Deploy
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  ship:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment:
      name: production-web
    steps:
      - run: vercel deploy --prebuilt --prod
`;
  const errors = errorsFor({ 'deploy.yml': deploy });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /declares no concurrency group/);

  assert.deepEqual(
    errorsFor({
      'deploy.yml': deploy.replace(
        'permissions:',
        'concurrency:\n  group: production\npermissions:',
      ),
    }),
    [],
  );
});

test('a deploy job with no environment, and one naming an undeclared environment, both fail', () => {
  const base = `
name: Deploy
on:
  workflow_dispatch:
concurrency:
  group: production
permissions:
  contents: read
jobs:
  ship:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - run: flyctl deploy --remote-only
`;
  assert.match(errorsFor({ 'd.yml': base })[0], /deployWithoutEnvironment: d\.yml:ship/);

  const unknown = base.replace('    steps:', '    environment:\n      name: mystery\n    steps:');
  const errors = errorsFor({ 'd.yml': unknown });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not list/);
});

test('pull_request_target that checks out the head ref fails', () => {
  const errors = errorsFor({
    'prt.yml': `
name: Risky
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: pnpm test
`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /runs on pull_request_target and checks out/);
});

test('pull_request_target that reads a repository secret fails', () => {
  const errors = errorsFor({
    'prt.yml': `
name: Risky
on:
  pull_request_target:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    env:
      TOKEN: \${{ secrets.DEPLOY_TOKEN }}
    steps:
      - run: pnpm test
`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /reads a repository secret/);
});

test('a run step that interpolates a pull request title fails', () => {
  const errors = errorsFor({
    'inject.yml': CLEAN_WORKFLOW.replace(
      '      - run: pnpm test',
      '      - run: echo "\${{ github.event.pull_request.title }}"',
    ),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /runInterpolatesUntrustedInput/);
  assert.match(errors[0], /github\.event\.pull_request\.title/);
});

test('an unparseable workflow and a workflow with no jobs both fail', () => {
  assert.match(errorsFor({ 'bad.yml': 'name: [unclosed\n' })[0], /not parseable YAML/);
  assert.match(errorsFor({ 'empty.yml': 'name: Nothing\non: push\n' })[0], /declares no jobs/);
});

test('the helpers read what the rules depend on', () => {
  assert.equal(unpinnedAction('./.github/workflows/reusable.yml', []), null);
  assert.equal(unpinnedAction('actions/checkout@v7', ['actions']), null);
  assert.match(unpinnedAction('other/thing@v1', ['actions']), /not to a 40 character commit sha/);
  assert.match(unpinnedAction('other/thing', ['actions']), /names no version at all/);

  assert.deepEqual(writeScopes({ contents: 'read', packages: 'write' }), ['packages']);
  assert.deepEqual(writeScopes('write-all'), ['write-all']);
  assert.deepEqual(writeScopes(null), []);

  assert.deepEqual(resolvedPermissions({ permissions: { contents: 'read' } }, {}), {
    contents: 'read',
  });
  assert.deepEqual(
    resolvedPermissions({ permissions: { contents: 'read' } }, { permissions: {} }),
    {},
  );
  assert.equal(resolvedPermissions({}, {}), null);

  assert.equal(isDeployJob({ steps: [{ run: 'vercel promote abc' }] }), true);
  assert.equal(isDeployJob({ steps: [{ run: 'pnpm build' }] }), false);
});
