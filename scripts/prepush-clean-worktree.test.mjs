import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'prepush-clean-worktree.sh',
);
const FAKE_CHAIN_CMD = 'git ls-files -co --exclude-standard | grep -q bad.txt && exit 1 || exit 0';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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

function workspaceFixture(dir) {
  const packages = [
    ['', 'prepush-fixture'],
    ['packages/scoped', '@local/scoped'],
    ['packages/plain', 'local-plain'],
    ['apps/consumer', 'consumer'],
  ];
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(
    path.join(dir, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
  );
  fs.writeFileSync(
    path.join(dir, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\nsettings: {}\npackages: {}\nsnapshots: {}\nimporters:\n  .: {}\n  packages/scoped: {}\n  packages/plain: {}\n  apps/consumer: {}\n",
  );
  for (const [relative, name] of packages) {
    const target = path.join(dir, relative);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, 'package.json'),
      `${JSON.stringify({ name, version: '1.0.0', main: 'index.cjs' })}\n`,
    );
  }
  fs.writeFileSync(
    path.join(dir, 'packages/scoped/index.cjs'),
    "module.exports = 'committed-scoped';\n",
  );
  fs.writeFileSync(
    path.join(dir, 'packages/plain/index.cjs'),
    "module.exports = 'committed-plain';\n",
  );
  run('git', ['add', '.'], { cwd: dir });
  const commit = run('git', ['commit', '--quiet', '-m', 'chore: seed workspaces'], { cwd: dir });
  assert.equal(commit.status, 0, commit.stderr);

  const modules = path.join(dir, 'node_modules');
  fs.mkdirSync(path.join(modules, '@local'), { recursive: true });
  fs.mkdirSync(path.join(modules, '@alias'), { recursive: true });
  fs.mkdirSync(path.join(modules, '.pnpm/node_modules/@local'), { recursive: true });
  fs.copyFileSync(path.join(dir, 'pnpm-lock.yaml'), path.join(modules, '.pnpm/lock.yaml'));
  fs.symlinkSync('../../packages/scoped', path.join(modules, '@local/scoped'));
  fs.symlinkSync('../packages/plain', path.join(modules, 'local-plain'));
  fs.symlinkSync('../../packages/scoped', path.join(modules, '@alias/scoped'));
  fs.symlinkSync('../packages/plain', path.join(modules, 'plain-alias'));
  fs.symlinkSync(
    '../../../../packages/scoped',
    path.join(modules, '.pnpm/node_modules/@local/scoped'),
  );

  const external = path.join(modules, '.pnpm/external@1.0.0/node_modules/external');
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(
    path.join(external, 'package.json'),
    '{"name":"external","version":"1.0.0","main":"index.cjs"}\n',
  );
  fs.writeFileSync(
    path.join(external, 'index.cjs'),
    "module.exports = require('@local/scoped');\n",
  );
  fs.symlinkSync('.pnpm/external@1.0.0/node_modules/external', path.join(modules, 'external'));
  fs.mkdirSync(path.join(modules, '@vendor'), { recursive: true });
  fs.symlinkSync(
    '../.pnpm/external@1.0.0/node_modules/external',
    path.join(modules, '@vendor/external'),
  );
  fs.symlinkSync(
    '../.pnpm/external@1.0.0/node_modules/external',
    path.join(modules, '@local/external'),
  );

  const consumerModules = path.join(dir, 'apps/consumer/node_modules');
  fs.mkdirSync(path.join(consumerModules, '@local'), { recursive: true });
  fs.symlinkSync('../../../../packages/scoped', path.join(consumerModules, '@local/scoped'));
  fs.symlinkSync('../../../packages/plain', path.join(consumerModules, 'local-plain'));

  const binary = path.join(modules, '.bin');
  fs.mkdirSync(binary, { recursive: true });
  fs.writeFileSync(
    path.join(binary, 'workspace-choice'),
    `#!/bin/sh\nexec node '${path.join(dir, 'packages/scoped/index.cjs')}'\n`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(modules, 'bytes.bin'), Buffer.from([0, 255, 13, 10, 128]));

  fs.writeFileSync(
    path.join(dir, 'packages/scoped/index.cjs'),
    "module.exports = 'dirty-scoped'; console.log('dirty-shim');\n",
  );
  fs.writeFileSync(path.join(dir, 'packages/plain/index.cjs'), "module.exports = 'dirty-plain';\n");
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-prepush-pnpm-'));
  fs.writeFileSync(
    path.join(fakeBin, 'pnpm'),
    `#!/usr/bin/env node\nconst path = require('node:path');\nfor (const relative of ${JSON.stringify(packages.map(([relative]) => relative))}) console.log(path.resolve(process.cwd(), relative));\n`,
    { mode: 0o755 },
  );
  return { fakeBin, modules };
}

function withWorkspaceFixture(fn) {
  withTempDirs((dir, worktreeParent) => {
    initRepo(dir);
    const fixture = workspaceFixture(dir);
    try {
      fn(
        dir,
        worktreeParent,
        { PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH}` },
        fixture,
      );
    } finally {
      fs.rmSync(fixture.fakeBin, { recursive: true, force: true });
    }
  });
}

test('workspace aliases and transitive external imports read only committed candidate exports', () => {
  withWorkspaceFixture((dir, worktreeParent, env) => {
    const program = [
      "const assert = require('node:assert/strict');",
      "const { createRequire } = require('node:module');",
      "console.log([require('@local/scoped'), require('local-plain'), require('@alias/scoped'), require('plain-alias'), require('external'), require('@vendor/external'), require('@local/external')].join('|'));",
      "const consumer = createRequire(process.cwd() + '/apps/consumer/package.json');",
      "console.log(consumer('@local/scoped') + '|' + consumer('local-plain'));",
      "assert.deepEqual(require('node:fs').readFileSync('node_modules/bytes.bin'), Buffer.from([0, 255, 13, 10, 128]));",
    ].join(' ');
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: `node -e ${shellQuote(program)}`,
      CARGO_TARGET_DIR: path.join(dir, 'inherited-target'),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      /committed-scoped\|committed-plain\|committed-scoped\|committed-plain\|committed-scoped\|committed-scoped\|committed-scoped/,
    );
    assert.match(result.stdout, /committed-scoped\|committed-plain/);
    assert.doesNotMatch(result.stdout, /dirty/);
    assert.deepEqual(fs.readdirSync(worktreeParent), []);
  });
});

test('generated executable shims run only the committed workspace binary', () => {
  withWorkspaceFixture((dir, worktreeParent, env, { modules }) => {
    fs.writeFileSync(
      path.join(modules, '.bin/workspace-choice'),
      `#!/bin/sh\nexec node -e ${shellQuote(`console.log(require(${JSON.stringify(path.join(dir, 'packages/scoped/index.cjs'))}))`)}\n`,
      { mode: 0o755 },
    );
    const before = fs.readFileSync(path.join(modules, '.bin/workspace-choice'));
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: 'node_modules/.bin/workspace-choice',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /committed-scoped/);
    assert.doesNotMatch(result.stdout, /dirty/);
    assert.deepEqual(fs.readFileSync(path.join(modules, '.bin/workspace-choice')), before);
  });
});

test('ignored workspace build output is not reused by the clean candidate', () => {
  withWorkspaceFixture((dir, worktreeParent, env) => {
    const output = path.join(dir, 'packages/scoped/dist/index.cjs');
    fs.mkdirSync(path.dirname(output));
    fs.writeFileSync(output, "module.exports = 'dirty-built-output';\n");
    const program =
      "require('node:assert/strict').equal(require('node:fs').existsSync('node_modules/@local/scoped/dist/index.cjs'), false)";
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: `node -e ${shellQuote(program)}`,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(output, 'utf8'), "module.exports = 'dirty-built-output';\n");
  });
});

test('the clean candidate owns a separate Cargo target directory', () => {
  withTempDirs((dir, worktreeParent) => {
    initRepo(dir);
    const program =
      "require('node:assert/strict').equal(process.env.CARGO_TARGET_DIR, process.cwd() + '/target')";
    const result = runHook(dir, worktreeParent, {
      AGI_PREPUSH_CHAIN_CMD: `node -e ${shellQuote(program)}`,
      CARGO_TARGET_DIR: path.join(dir, 'inherited-target'),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test('generated shim paths are rebased once when the candidate is inside the source', () => {
  withWorkspaceFixture((dir, _, env, { modules }) => {
    const worktreeParent = path.join(dir, '.candidates');
    fs.writeFileSync(
      path.join(modules, '.bin/workspace-choice'),
      `#!/bin/sh\nexec node -e ${shellQuote(`console.log(require(${JSON.stringify(path.join(dir, 'packages/scoped/index.cjs'))}))`)}\n`,
      { mode: 0o755 },
    );
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: 'node_modules/.bin/workspace-choice',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /committed-scoped/);
    assert.doesNotMatch(result.stdout, /dirty/);
    assert.deepEqual(fs.readdirSync(worktreeParent), []);
  });
});

test('an inherited module fallback cannot import source-only workspace code', () => {
  withWorkspaceFixture((dir, worktreeParent, env, { fakeBin }) => {
    const fallback = path.join(fakeBin, 'source-only');
    fs.mkdirSync(fallback);
    fs.writeFileSync(path.join(fallback, 'index.js'), "module.exports = 'dirty-fallback';\n");
    const program =
      "require('node:assert/strict').throws(() => require('source-only'), { code: 'MODULE_NOT_FOUND' })";
    const result = runHook(dir, worktreeParent, {
      ...env,
      NODE_PATH: fakeBin,
      AGI_PREPUSH_CHAIN_CMD: `node -e ${shellQuote(program)}`,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test('a workspace alias pointing at the wrong declared package prevents reuse', () => {
  withWorkspaceFixture((dir, worktreeParent, env, { modules }) => {
    const manifest = {
      name: 'prepush-fixture',
      version: '1.0.0',
      dependencies: { '@local/scoped': 'workspace:*' },
    };
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
    const lock =
      "lockfileVersion: '9.0'\nsettings: {}\npackages: {}\nsnapshots: {}\nimporters:\n  .:\n    dependencies:\n      '@local/scoped':\n        specifier: workspace:*\n        version: link:packages/scoped\n  packages/scoped: {}\n  packages/plain: {}\n  apps/consumer: {}\n";
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), lock);
    fs.writeFileSync(path.join(modules, '.pnpm/lock.yaml'), lock);
    run('git', ['add', 'package.json', 'pnpm-lock.yaml'], { cwd: dir });
    run('git', ['commit', '--quiet', '-m', 'chore: declare workspace dependency'], { cwd: dir });
    fs.unlinkSync(path.join(modules, '@local/scoped'));
    fs.symlinkSync('../../packages/plain', path.join(modules, '@local/scoped'));
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: 'echo chain-ran',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /installed workspace dependency resolution mismatch/);
    assert.doesNotMatch(result.stdout, /chain-ran/);
    assert.deepEqual(fs.readdirSync(worktreeParent), []);
  });
});

test('an installed external version mismatch prevents reuse', () => {
  withWorkspaceFixture((dir, worktreeParent, env, { modules }) => {
    const manifest = {
      name: 'prepush-fixture',
      version: '1.0.0',
      dependencies: { external: '1.0.0' },
    };
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
    const lock =
      "lockfileVersion: '9.0'\nsettings: {}\npackages:\n  external@1.0.0: {}\nsnapshots:\n  external@1.0.0: {}\nimporters:\n  .:\n    dependencies:\n      external:\n        specifier: 1.0.0\n        version: 1.0.0\n  packages/scoped: {}\n  packages/plain: {}\n  apps/consumer: {}\n";
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), lock);
    fs.writeFileSync(path.join(modules, '.pnpm/lock.yaml'), lock);
    run('git', ['add', 'package.json', 'pnpm-lock.yaml'], { cwd: dir });
    run('git', ['commit', '--quiet', '-m', 'chore: declare external dependency'], { cwd: dir });
    fs.writeFileSync(
      path.join(modules, '.pnpm/external@1.0.0/node_modules/external/package.json'),
      '{"name":"external","version":"2.0.0"}',
    );
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: 'echo chain-ran',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /installed dependency version mismatch/);
    assert.doesNotMatch(result.stdout, /chain-ran/);
  });
});

test('dirty source manifests prevent dependency reuse before the chain runs', () => {
  withWorkspaceFixture((dir, worktreeParent, env) => {
    fs.writeFileSync(
      path.join(dir, 'packages/plain/package.json'),
      '{"name":"changed-name","version":"1.0.0"}\n',
    );
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: 'echo chain-ran',
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /chain-ran/);
    assert.match(result.stderr, /manifest mismatch/);
    assert.deepEqual(fs.readdirSync(worktreeParent), []);
  });
});

test('absolute and out-of-inventory dependency links fail closed', () => {
  for (const absolute of [true, false]) {
    withWorkspaceFixture((dir, worktreeParent, env, { modules }) => {
      const target = fs.realpathSync(process.execPath);
      fs.symlinkSync(
        absolute ? target : path.relative(fs.realpathSync(modules), target),
        path.join(modules, 'escaped'),
      );
      const result = runHook(dir, worktreeParent, {
        ...env,
        AGI_PREPUSH_CHAIN_CMD: 'echo chain-ran',
      });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout, /chain-ran/);
      assert.match(result.stderr, /dependency link/);
      assert.deepEqual(fs.readdirSync(worktreeParent), []);
    });
  }
});

test('a dirty source lockfile prevents cache reuse', () => {
  withWorkspaceFixture((dir, worktreeParent, env) => {
    fs.appendFileSync(path.join(dir, 'pnpm-lock.yaml'), 'changed: true\n');
    const result = runHook(dir, worktreeParent, {
      ...env,
      AGI_PREPUSH_CHAIN_CMD: 'echo chain-ran',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pnpm-lock.yaml mismatch/);
    assert.doesNotMatch(result.stdout, /chain-ran/);
  });
});

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
