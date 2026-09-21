import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkCliLocalSecret,
  literalSecrets,
  rustSources,
  withoutTestModules,
  NOT_A_SECRET,
  LOCAL_SERVERS,
  REPO_ROOT,
} from './check-cli-local-secret.mjs';

function tree(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'cli-local-secret-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

const DAEMON = `
fn start() {
    let token = match &config.webhook_token {
        None => anyhow::bail!("webhook_token is required when webhook triggers are configured"),
        Some(t) if t.len() < 32 => anyhow::bail!("webhook_token is too short"),
        Some(t) => Some(t.clone()),
    };
    if constant_time_eq(got.as_bytes(), token.as_bytes()) {}
}
`;

function healthyTree(extra = {}) {
  return tree({
    'apps/cli/src/daemon.rs': DAEMON,
    'apps/cli/src/a2a_ws.rs': 'fn serve() {}\n',
    'apps/cli/src/features/a2a/server.rs': 'fn serve() {}\n',
    'apps/cli/src/browser_bridge.rs':
      'pub const LOCAL_CLIENT_TOKEN_HEADER: &str = "x-local-client-token";\n',
    'crates/agiworkforce-protocol/src/developer_session.rs':
      'pub const ACCOUNT_TOKEN: &str = "account/token";\n',
    'apps/cli/src/auth.rs': 'const CREDENTIAL_USE_LOG: &str = "credential-use.jsonl";\n',
    ...extra,
  });
}

test('a healthy tree passes', () => {
  const root = healthyTree();
  assert.deepEqual(checkCliLocalSecret(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('a shared secret compiled into a local server fails', () => {
  const root = healthyTree({
    'apps/cli/src/bridge.rs': 'const BRIDGE_SECRET: &str = "agi-local-bridge";\n',
  });
  const failures = checkCliLocalSecret(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /BRIDGE_SECRET/);
  assert.match(failures[0], /every copy of the build would share it/);
  assert.match(failures[0], /apps\/cli\/src\/bridge\.rs/);
  rmSync(root, { recursive: true, force: true });
});

test('a secret assigned into a local, not only a const, fails', () => {
  const root = healthyTree({
    'apps/cli/src/bridge.rs': 'fn f() { let shared_token = "hunter2hunter2"; }\n',
  });
  assert.ok(checkCliLocalSecret(root).some((failure) => /shared_token/.test(failure)));
  rmSync(root, { recursive: true, force: true });
});

test('a fixture inside a test module is not a shipped secret', () => {
  const root = healthyTree({
    'apps/cli/src/bridge.rs':
      '#[cfg(test)]\nmod tests {\n    const BRIDGE_SECRET: &str = "fixture";\n}\n',
  });
  assert.deepEqual(checkCliLocalSecret(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('blanking a test module keeps the line numbering of what is left', () => {
  const source = 'a\n#[cfg(test)]\nmod tests {\n  let token = "x";\n}\nb\n';
  const blanked = withoutTestModules(source);
  assert.equal(blanked.split('\n').length, source.split('\n').length);
  assert.ok(blanked.startsWith('a\n'));
  assert.ok(blanked.trimEnd().endsWith('b'));
  assert.ok(!blanked.includes('"x"'));
});

test('an empty literal is not a secret', () => {
  const root = healthyTree({
    'apps/cli/src/bridge.rs': 'const BRIDGE_SECRET: &str = "";\n',
  });
  assert.deepEqual(checkCliLocalSecret(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('a recorded exception that no longer exists fails rather than lingering', () => {
  const root = healthyTree();
  const key = Object.keys(NOT_A_SECRET)[0];
  writeFileSync(path.join(root, key.split(':')[0]), 'fn nothing() {}\n');
  assert.ok(
    checkCliLocalSecret(root).some(
      (failure) => failure === `${key} is recorded here and no longer exists; remove the entry`,
    ),
  );
  rmSync(root, { recursive: true, force: true });
});

test('dropping the daemon required-token gate fails', () => {
  const root = healthyTree({
    'apps/cli/src/daemon.rs': DAEMON.replace(
      'webhook_token is required when webhook triggers are configured',
      'no token needed',
    ),
  });
  assert.ok(
    checkCliLocalSecret(root).some((failure) =>
      /no longer holds the webhook trigger server/.test(failure),
    ),
  );
  rmSync(root, { recursive: true, force: true });
});

test('dropping the daemon constant-time comparison fails', () => {
  const root = healthyTree({
    'apps/cli/src/daemon.rs': DAEMON.replace('constant_time_eq', 'starts_with'),
  });
  assert.ok(checkCliLocalSecret(root).some((failure) => /constant_time_eq/.test(failure)));
  rmSync(root, { recursive: true, force: true });
});

test('a local server that leaves the tree fails', () => {
  const root = healthyTree();
  rmSync(path.join(root, 'apps/cli/src/a2a_ws.rs'));
  assert.ok(checkCliLocalSecret(root).some((failure) => /agent-to-agent websocket/.test(failure)));
  rmSync(root, { recursive: true, force: true });
});

test('the real tree is scanned and passes', () => {
  const sources = rustSources(REPO_ROOT);
  assert.ok(sources.length > 100, `only ${sources.length} Rust sources were scanned`);
  assert.ok(sources.includes('apps/cli/src/daemon.rs'));
  assert.ok(sources.some((file) => file.startsWith('crates/')));
  assert.ok(!sources.some((file) => file.includes('/target/')));

  for (const file of Object.keys(LOCAL_SERVERS)) assert.ok(sources.includes(file), file);
  assert.deepEqual(
    literalSecrets(REPO_ROOT)
      .map((entry) => entry.key)
      .filter((key) => NOT_A_SECRET[key] === undefined),
    [],
  );
  assert.deepEqual(checkCliLocalSecret(REPO_ROOT), []);
});
