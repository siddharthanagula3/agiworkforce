import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { SPEC, COMMON_KEYS } from './check-spec-artifacts.mjs';

const script = fileURLToPath(new URL('./check-spec-artifacts.mjs', import.meta.url));

function run(dir) {
  return spawnSync(process.execPath, [script, '--dir', dir], { encoding: 'utf8' });
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-artifacts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeValidSet(dir) {
  for (const [file, requiredKeys] of Object.entries(SPEC)) {
    const json = { schema_version: '1', generated_at: '2026-08-16' };
    for (const key of requiredKeys) json[key] = [];
    fs.writeFileSync(path.join(dir, file), JSON.stringify(json));
  }
}

test('an absent artifact directory is not a failure', (t) => {
  const absent = path.join(tempDir(t), 'never-created');

  const result = run(absent);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SKIP: no spec artifact set/);
});

test('a directory that exists must still carry all eight artifacts', (t) => {
  const dir = tempDir(t);

  const result = run(dir);

  assert.equal(result.status, 1);
  for (const file of Object.keys(SPEC)) assert.match(result.stderr, new RegExp(`${file}: missing`));
});

test('a directory missing a required top-level key still fails', (t) => {
  const dir = tempDir(t);
  writeValidSet(dir);
  const stripped = { schema_version: '1', generated_at: '2026-08-16' };
  fs.writeFileSync(path.join(dir, 'roadmap.json'), JSON.stringify(stripped));

  const result = run(dir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /roadmap\.json: missing required top-level key "now"/);
});

test('a complete artifact set passes', (t) => {
  const dir = tempDir(t);
  writeValidSet(dir);

  const result = run(dir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: 8 spec artifacts valid/);
  assert.deepEqual(COMMON_KEYS, ['schema_version', 'generated_at']);
});
