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

test('every way of reaching a bare reqwest transport is a violation', () => {
  const bare = {
    getShortcut: 'async fn f() { let _ = reqwest::get("https://example.test").await; }',
    defaultConstructor: 'fn f() { let _ = reqwest::Client::default(); }',
    importedDefault: 'use reqwest::Client;\nfn f() { let _ = Client::default(); }',
    crateAlias: 'use reqwest as rq;\nfn f() { let _ = rq::Client::new(); }',
    importAlias: 'use reqwest::Client as Http;\nfn f() { let _ = Http::new(); }',
    groupAlias: 'use reqwest::{header::HeaderMap, Client as C};\nfn f() { let _ = C::new(); }',
    blockingImport: 'use reqwest::blocking::Client;\nfn f() { let _ = Client::new(); }',
    blockingQualified: 'fn f() { let _ = reqwest::blocking::Client::builder(); }',
    blockingModule: 'use reqwest::blocking;\nfn f() { let _ = blocking::Client::new(); }',
    globImport: 'use reqwest::*;\nfn f() { let _ = ClientBuilder::new(); }',
    splitAcrossLines: 'fn f() { let _ = reqwest::Client\n    ::new(); }',
    afterSlashesInString: 'fn f() { let _u = "a//b"; let _ = reqwest::Client::new(); }',
    importedGetter:
      'use reqwest::get;\nasync fn f() { let _ = get("https://example.test").await; }',
  };
  for (const [name, source] of Object.entries(bare)) {
    assert.equal(constructsBareClient(source), true, name);
  }
});

test('names that only look like reqwest are not violations', () => {
  const benign = {
    middlewareBuilder:
      'use reqwest_middleware::ClientBuilder;\nfn f() { let _ = ClientBuilder::new(inner); }',
    foreignClient: 'use other::Client;\nfn f() { let _ = Client::new(); }',
    shadowedByOtherCrate:
      'use reqwest::Client;\nuse other::Client;\nfn f() { let _ = Client::new(); }',
    ownGetFunction: 'use reqwest::Url;\nfn get(u: &str) {}\nfn f() { get("x"); }',
    methodGet: 'use reqwest::Client;\nfn f(c: &Client) { let _ = c.get("https://example.test"); }',
    trailingComment: 'fn f() {} // reqwest::get(url)',
    publicClient: 'fn f() { let _ = PublicHttpClient::new(); }',
    commentAfterSlashes: 'fn f() { let _u = "a//b"; } // reqwest::Client::new()',
  };
  for (const [name, source] of Object.entries(benign)) {
    assert.equal(constructsBareClient(source), false, name);
  }
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
