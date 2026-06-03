import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const bin = resolve('bin/agi.js');

test('wrapper runs AGI_CLI_BINARY_PATH when it exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agi-cli-npm-'));
  const fake = join(dir, 'agi-fake.js');
  writeFileSync(
    fake,
    '#!/usr/bin/env node\nconsole.log(`fake agi ${process.argv.slice(2).join(" ")}`);\n',
  );
  chmodSync(fake, 0o755);

  const result = spawnSync(process.execPath, [bin, 'exec', 'hello'], {
    cwd: resolve('.'),
    env: { ...process.env, AGI_CLI_BINARY_PATH: fake },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fake agi exec hello/);
});

test('wrapper fails clearly when binary cannot be resolved', () => {
  const missing = join(tmpdir(), 'agi-cli-npm-missing', 'agi');
  const result = spawnSync(process.execPath, [bin, '--version'], {
    cwd: resolve('.'),
    env: { ...process.env, AGI_CLI_BINARY_PATH: missing },
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /AGI CLI binary not found/);
  assert.match(result.stderr, /AGI_CLI_BINARY_PATH=/);
});
