import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(REPO_ROOT, 'scripts/check-action-pins.sh');
const SHA = '1111111111111111111111111111111111111111';

const roots = [];

function workflowsDir(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'action-pins-'));
  roots.push(root);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(root, name), body);
  }
  return root;
}

function steps(...references) {
  return `jobs:\n  build:\n    steps:\n${references.map((reference) => `      - uses: ${reference}\n`).join('')}`;
}

function guard(dir) {
  return spawnSync('bash', [SCRIPT, dir], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, VERIFY_ACTION_PIN_OBJECTS: '0' },
  });
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a GitHub-owned action pinned to a tag fails like any other', () => {
  const result = guard(
    workflowsDir({
      'first-party.yml': steps(
        'actions/checkout@v7',
        'github/codeql-action/init@v3',
        'microsoft/setup-msbuild@v2',
      ),
      'pinned.yml': steps(`third/party@${SHA}`),
    }),
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /::error::Unpinned action: actions\/checkout@v7\n/);
  assert.match(result.stderr, /::error::Unpinned action: github\/codeql-action\/init@v3\n/);
  assert.match(result.stderr, /::error::Unpinned action: microsoft\/setup-msbuild@v2\n/);
  assert.match(result.stderr, /FAIL: 3 unpinned action\(s\)/);
});

test('a third-party tag and a short sha both fail', () => {
  const result = guard(
    workflowsDir({
      'tag.yml': steps('third/party@v3'),
      'short.yml': steps('third/party@1111111'),
    }),
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /FAIL: 2 unpinned action\(s\)/);
});

test('full commit sha pins in every namespace and local references pass', () => {
  const result = guard(
    workflowsDir({
      'pinned.yml': steps(
        `actions/checkout@${SHA} # v7.0.1`,
        `github/codeql-action/analyze@${SHA} # v4`,
        `"third/party@${SHA}"`,
        './.github/actions/local',
      ),
    }),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Scanned 3 action references/);
});

test('a .yaml workflow is read as well as a .yml one', () => {
  const result = guard(
    workflowsDir({
      'pinned.yml': steps(`third/party@${SHA}`),
      'tagged.yaml': steps('actions/cache@v4'),
    }),
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Unpinned action: actions\/cache@v4/);
});

test('a directory with no action reference fails instead of passing over nothing', () => {
  const result = guard(
    workflowsDir({ 'empty.yml': 'jobs:\n  build:\n    steps:\n      - run: true\n' }),
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /nothing was measured/);
});
