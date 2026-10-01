import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const guard = fileURLToPath(new URL('check-node-version.sh', import.meta.url));

function check(version, range = '>=24.15.0 <25') {
  const root = mkdtempSync(path.join(tmpdir(), 'node-runtime-'));
  try {
    mkdirSync(path.join(root, 'scripts'));
    mkdirSync(path.join(root, 'bin'));
    symlinkSync('/usr/bin/sed', path.join(root, 'bin/sed'));
    copyFileSync(guard, path.join(root, 'scripts/check-node-version.sh'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ engines: { node: range } }));
    if (version !== null) {
      writeFileSync(
        path.join(root, 'bin/node'),
        '#!/bin/bash\nif [[ "$1" == "--version" || "$1" == "-v" ]]; then\n  printf "%s\\n" "$TEST_NODE_VERSION"\nelse\n  exec "$TEST_REAL_NODE" "$@"\nfi\n',
        { mode: 0o700 },
      );
    }
    return spawnSync('/bin/bash', [path.join(root, 'scripts/check-node-version.sh')], {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: {
        PATH: path.join(root, 'bin'),
        TEST_REAL_NODE: process.execPath,
        TEST_NODE_VERSION: version ?? '',
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the declared minimum and later patches in the supported major pass', () => {
  for (const version of ['v24.15.0', 'v24.18.0']) {
    const result = check(version);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});

test('older runtimes and undeclared majors fail before dependencies install', () => {
  for (const version of ['v24.14.9', 'v23.15.0', 'v25.0.0']) {
    const result = check(version);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /requires Node\.js >=24\.15\.0 <25/);
  }
});

test('the runtime range comes from the adjacent manifest, independent of the working directory', () => {
  assert.equal(check('v24.18.0', '>=24.19.0 <25').status, 1);
  assert.equal(check('v24.19.0', '>=24.19.0 <25').status, 0);
  assert.equal(check('v25.0.0', '25').status, 0);
  assert.equal(check('v26.0.0', '25').status, 1);
});

test('unknown range formats and prerelease runtimes fail closed', () => {
  for (const range of [
    '',
    '*',
    '^24.15.0',
    '>=24.15.0 <24',
    '024',
    '>=24.015.0 <25',
    '>=18446744073709551640.0.0 <18446744073709551641',
  ]) {
    const result = check('v24.18.0', range);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsupported engines\.node range/);
  }
  const result = check('v24.18.0-rc.1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot verify Node\.js version/);
});

test('missing Node reports an actionable failure', () => {
  const result = check(null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node\.js is not installed/);
});

test('noncanonical or unsafe numeric runtime components fail before arithmetic', () => {
  for (const version of ['v024.15.0', 'v24.015.0', 'v24.15.00', 'v18446744073709551640.15.0']) {
    const result = check(version);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cannot verify Node\.js version/);
  }
});
