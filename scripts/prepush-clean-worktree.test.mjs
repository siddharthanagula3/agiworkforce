import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'prepush-clean-worktree.sh',
);
const FAKE_CHAIN_CMD = 'git ls-files -co --exclude-standard | grep -q bad.txt && exit 1 || exit 0';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

function initRepo(dir) {
  run('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  run('git', ['config', 'user.email', 'prepush-test@example.invalid'], { cwd: dir });
  run('git', ['config', 'user.name', 'Prepush Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'good.txt'), 'ok\n');
  run('git', ['add', 'good.txt'], { cwd: dir });
  run('git', ['commit', '--quiet', '-m', 'chore: seed repo'], { cwd: dir });
}

function runHook(dir, worktreeParent, envOverrides = {}) {
  return run('bash', [SCRIPT_PATH], {
    cwd: dir,
    env: {
      ...process.env,
      AGI_PREPUSH_CHAIN_CMD: FAKE_CHAIN_CMD,
      AGI_PREPUSH_DIFF_CMD: 'true',
      AGI_PREPUSH_WORKTREE_PARENT: worktreeParent,
      ...envOverrides,
    },
  });
}

function withTempDirs(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-prepush-repo-'));
  const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-prepush-wt-'));
  try {
    fn(dir, worktreeParent);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(worktreeParent, { recursive: true, force: true });
  }
}

test('an untracked breakage in the working tree does not fail the push gate', () => {
  withTempDirs((dir, worktreeParent) => {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'bad.txt'), 'broken\n');

    const result = runHook(dir, worktreeParent);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test('the same breakage committed fails the push gate', () => {
  withTempDirs((dir, worktreeParent) => {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'bad.txt'), 'broken\n');
    run('git', ['add', 'bad.txt'], { cwd: dir });
    run('git', ['commit', '--quiet', '-m', 'chore: introduce breakage'], { cwd: dir });

    const result = runHook(dir, worktreeParent);

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
  });
});

test('the default diff range falls back to HEAD~1 when there is no upstream', () => {
  withTempDirs((dir, worktreeParent) => {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'good.txt'), 'ok again\n');
    run('git', ['commit', '--quiet', '-am', 'chore: second commit'], { cwd: dir });

    const result = runHook(dir, worktreeParent, { AGI_PREPUSH_DIFF_CMD: '' });

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test('the worktree is removed on both success and failure', () => {
  withTempDirs((dir, worktreeParent) => {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'bad.txt'), 'broken\n');
    run('git', ['add', 'bad.txt'], { cwd: dir });
    run('git', ['commit', '--quiet', '-m', 'chore: introduce breakage'], { cwd: dir });

    runHook(dir, worktreeParent);

    const worktreeList = run('git', ['worktree', 'list'], { cwd: dir }).stdout.trim().split('\n');
    assert.equal(worktreeList.length, 1);
    assert.deepEqual(fs.readdirSync(worktreeParent), []);
  });
});
