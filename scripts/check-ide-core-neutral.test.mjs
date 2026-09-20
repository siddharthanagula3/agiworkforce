import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ADAPTER_CONFIG_PATH,
  ADAPTER_DIR,
  IDE_CORE_DIR,
  REMOTE_ENVIRONMENT_PATH,
  REPO_ROOT,
  REQUIRED_REMOTE_KINDS,
  VSCODE_MANIFEST_PATH,
  checkIdeCoreNeutral,
  importsEditorApi,
  trustScopedSettings,
} from './check-ide-core-neutral.mjs';

const roots = [];

function fixture(edits = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-ide-core-'));
  roots.push(root);
  for (const dir of [IDE_CORE_DIR, ADAPTER_DIR]) {
    mkdirSync(path.join(root, dir), { recursive: true });
    cpSync(path.join(REPO_ROOT, dir), path.join(root, dir), { recursive: true });
  }
  const manifest = path.join(root, VSCODE_MANIFEST_PATH);
  mkdirSync(path.dirname(manifest), { recursive: true });
  cpSync(path.join(REPO_ROOT, VSCODE_MANIFEST_PATH), manifest);
  for (const [relative, edit] of Object.entries(edits)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, edit(readFileSync(absolute, 'utf8')));
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands keeps the core editor-neutral', () => {
  assert.deepEqual(checkIdeCoreNeutral(REPO_ROOT), []);
});

test('it reads the adapter rather than a list of its own', () => {
  const settings = trustScopedSettings(
    readFileSync(path.join(REPO_ROOT, ADAPTER_CONFIG_PATH), 'utf8'),
  );
  assert.ok(settings.includes('apiEndpoint'), `expected a trust-scoped endpoint: ${settings}`);
  assert.equal(importsEditorApi("import * as vscode from 'vscode';"), true);
  assert.equal(importsEditorApi("import { x } from './vscodeish';"), false);
  assert.equal(importsEditorApi("const vscode = require('vscode');"), true);
  assert.ok(REQUIRED_REMOTE_KINDS.length >= 5);
});

test('an editor import in the core fails', () => {
  const root = fixture({
    [`${IDE_CORE_DIR}/session.ts`]: (source) => `import * as vscode from 'vscode';\n${source}`,
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /imports the vscode API, so the core/.test(entry)),
  );
});

test('the core reaching back into the adapter fails', () => {
  const root = fixture({
    [`${IDE_CORE_DIR}/session.ts`]: (source) =>
      `import { thing } from '../../../apps/extension-vscode/src/platform/config';\n${source}`,
  });
  assert.ok(checkIdeCoreNeutral(root).some((entry) => /inverts the dependency/.test(entry)));
});

test('a remote workspace kind the extension stops naming fails', () => {
  const root = fixture({
    [REMOTE_ENVIRONMENT_PATH]: (source) => source.replaceAll("'dev-container'", "'container'"),
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /does not name the dev-container/.test(entry)),
  );
});

test('an extensionKind that cannot reach the checkout fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      manifest.extensionKind = ['ui'];
      return JSON.stringify(manifest, null, 2);
    },
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /only the workspace host can do/.test(entry)),
  );
});

test('a restricted setting the extension does not contribute fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      manifest.capabilities.untrustedWorkspaces.restrictedConfigurations.push(
        'agiWorkforce.notASetting',
      );
      return JSON.stringify(manifest, null, 2);
    },
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /restricts agiWorkforce\.notASetting/.test(entry)),
  );
});

test('a setting the code refuses from a workspace but the manifest does not declare fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      manifest.capabilities.untrustedWorkspaces.restrictedConfigurations =
        manifest.capabilities.untrustedWorkspaces.restrictedConfigurations.filter(
          (key) => key !== 'agiWorkforce.apiEndpoint',
        );
      return JSON.stringify(manifest, null, 2);
    },
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) =>
      /refuses a workspace value for apiEndpoint/.test(entry),
    ),
  );
});

test('a manifest that says nothing about virtual workspaces fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      delete manifest.capabilities.virtualWorkspaces;
      return JSON.stringify(manifest, null, 2);
    },
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /does not say what it does in a virtual/.test(entry)),
  );
});

test('a virtual workspace allowed with no explanation fails', () => {
  const root = fixture({
    [VSCODE_MANIFEST_PATH]: (source) => {
      const manifest = JSON.parse(source);
      manifest.capabilities.virtualWorkspaces = { supported: 'limited' };
      return JSON.stringify(manifest, null, 2);
    },
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /without saying what works there/.test(entry)),
  );
});

test('branching on a fork product name fails', () => {
  const root = fixture({
    [`${ADAPTER_DIR}/platform/remoteEnvironment.ts`]: (source) =>
      `const isFork = process.env['EDITOR'] === 'Cursor';\nvoid isFork;\n${source}`,
  });
  assert.ok(
    checkIdeCoreNeutral(root).some((entry) => /branches on an editor's product name/.test(entry)),
  );
});
