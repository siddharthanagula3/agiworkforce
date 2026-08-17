import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkEgressBoundary, constructsBareClient } from './lib/rust-egress-boundary.mjs';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('a commented-out constructor is not a violation', () => {
  assert.equal(constructsBareClient('// let c = reqwest::Client::new();'), false);
  assert.equal(constructsBareClient('/* reqwest::ClientBuilder::new() */'), false);
  assert.equal(constructsBareClient('let c = reqwest::Client::new();'), true);
  assert.equal(constructsBareClient('let c = reqwest::Client::builder().build()?;'), true);
});

test('a new unlisted transport fails the boundary', () => {
  const errors = checkEgressBoundary({
    files: [
      { path: 'a.rs', source: 'let c = reqwest::Client::new();' },
      { path: 'b.rs', source: 'let c = reqwest::Client::builder();' },
    ],
    allowlist: ['a.rs'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /- b\.rs/);
  assert.match(errors[0], /PublicHttpClient/);
});

test('a migrated transport must be dropped from the allowlist', () => {
  const errors = checkEgressBoundary({
    files: [{ path: 'a.rs', source: 'PublicHttpClient::new()' }],
    allowlist: ['a.rs'],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ratchets closed/);
});

test('the recorded allowlist matches the real desktop tree today', () => {
  execFileSync('node', ['scripts/check-rust-egress-boundary.mjs'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
});

test('planting a bare client in the real tree fails the gate', () => {
  const planted = path.join(
    repoRoot,
    'apps/desktop/src-tauri/src/sys/security/__egress_boundary_probe.rs',
  );
  fs.writeFileSync(planted, 'fn probe() { let _ = reqwest::Client::new(); }\n');
  try {
    assert.throws(() =>
      execFileSync('node', ['scripts/check-rust-egress-boundary.mjs'], {
        cwd: repoRoot,
        stdio: 'ignore',
      }),
    );
  } finally {
    fs.rmSync(planted, { force: true });
  }
  assert.equal(fs.existsSync(planted), false);
});
