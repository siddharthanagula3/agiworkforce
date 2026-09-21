import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DESKTOP_DOC,
  RELEASE_CHANNELS,
  REPO_ROOT,
  SHELL_DIR,
  TAURI_CONFIG,
  WORKFLOW_DIR,
  checkDesktopReleaseIntegrity,
  checkShellRuntimeBoundary,
} from './check-desktop-release-integrity.mjs';

const roots = [];

/** A copy of the real thing, so a case changes one fact and nothing else. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-desktop-release-'));
  roots.push(root);
  for (const relative of [
    TAURI_CONFIG,
    DESKTOP_DOC,
    ...Object.keys(RELEASE_CHANNELS).map((name) => `${WORKFLOW_DIR}/${name}`),
  ]) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  mkdirSync(path.join(root, SHELL_DIR), { recursive: true });
  writeFileSync(path.join(root, SHELL_DIR, 'main.ts'), "import { app } from 'electron';\n", 'utf8');
  return root;
}

function edit(root, relative, change) {
  const file = path.join(root, relative);
  writeFileSync(file, change(readFileSync(file, 'utf8')), 'utf8');
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the repository as it stands passes', () => {
  assert.deepEqual(checkDesktopReleaseIntegrity(), []);
});

test('a copy of the repository passes', () => {
  assert.deepEqual(checkDesktopReleaseIntegrity(fixture()), []);
});

test('the public shell importing the runtime it does not ship fails', () => {
  for (const line of [
    "import { invoke } from '@tauri-apps/api/core';",
    "const { invoke } = require('@tauri-apps/api');",
    "import schema from '../src-tauri/gen/schema.json';",
  ]) {
    const root = fixture();
    edit(root, `${SHELL_DIR}/main.ts`, (source) => `${line}\n${source}`);
    const failures = checkDesktopReleaseIntegrity(root);
    assert.equal(failures.length, 1, line);
    assert.match(failures[0], /does not ship/);
  }
});

test('naming the other stack in a comment is not a dependency on it', () => {
  const root = fixture();
  edit(
    root,
    `${SHELL_DIR}/main.ts`,
    (source) =>
      `/**\n * Not '@tauri-apps/api': this shell is Electron.\n */\n// see src-tauri/\n${source}`,
  );
  assert.deepEqual(checkShellRuntimeBoundary(root), []);
});

test('a channel that can build without its signing key fails', () => {
  for (const [name, channel] of Object.entries(RELEASE_CHANNELS)) {
    const secret = channel.signing[0];
    const root = fixture();
    edit(root, `${WORKFLOW_DIR}/${name}`, (source) => source.replaceAll(secret, 'UNRELATED_VALUE'));
    const failures = checkDesktopReleaseIntegrity(root);
    assert.ok(failures.length >= 1, `${name} ${secret}`);
    assert.match(failures.join('\n'), new RegExp(`never reads ${secret}`));
  }
});

test('a channel that reads the key but builds anyway when it is empty fails', () => {
  const root = fixture();
  // Every place the job would have stopped, gone: the secret is still passed
  // to the build, so an unset one produces an unsigned artifact in silence.
  edit(root, `${WORKFLOW_DIR}/release-desktop.yml`, (source) =>
    source
      .replace('if [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]', 'if [ -n "$NOTHING" ]')
      .replaceAll(/^\s*for name in .*TAURI_SIGNING_PRIVATE_KEY.*$/gm, '          for name in; do'),
  );
  const failures = checkDesktopReleaseIntegrity(root);
  assert.match(failures.join('\n'), /does not refuse to build when TAURI_SIGNING_PRIVATE_KEY/);
});

test("a channel publishing on the other channel's tags fails", () => {
  const root = fixture();
  edit(root, `${WORKFLOW_DIR}/release-desktop-cloud.yml`, (source) =>
    source.replace("- 'v-cloud-desktop-*'", "- 'v-desktop-*'"),
  );
  const failures = checkDesktopReleaseIntegrity(root);
  assert.match(failures.join('\n'), /not this channel's v-cloud-desktop-\*/);
});

test('a new desktop release channel nobody has answered for fails', () => {
  const root = fixture();
  writeFileSync(
    path.join(root, WORKFLOW_DIR, 'release-desktop-linux.yml'),
    "name: Release Desktop Linux\non:\n  push:\n    tags:\n      - 'v-desktop-linux-*'\n",
    'utf8',
  );
  const failures = checkDesktopReleaseIntegrity(root);
  assert.match(failures.join('\n'), /never been told about/);
});

test('an updater with no key, no artifact or a plaintext feed fails', () => {
  for (const [change, expected] of [
    [(config) => delete config.plugins.updater.pubkey, /no public key/],
    [(config) => (config.bundle.createUpdaterArtifacts = false), /no signed updater artifact/],
    [
      (config) => (config.plugins.updater.endpoints = ['http://releases.example/{{target}}']),
      /unverifiable transport/,
    ],
    [(config) => (config.plugins.updater.endpoints = []), /names no endpoint/],
  ]) {
    const root = fixture();
    const config = JSON.parse(readFileSync(path.join(root, TAURI_CONFIG), 'utf8'));
    change(config);
    writeFileSync(path.join(root, TAURI_CONFIG), JSON.stringify(config, null, 2), 'utf8');
    const failures = checkDesktopReleaseIntegrity(root);
    assert.equal(failures.length, 1, String(expected));
    assert.match(failures[0], expected);
  }
});

test('a document that stops naming the tree the public product is built from fails', () => {
  const root = fixture();
  writeFileSync(path.join(root, DESKTOP_DOC), '# Desktop surface\n\nNothing to see.\n', 'utf8');
  const failures = checkDesktopReleaseIntegrity(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /does not name the tree/);
});
