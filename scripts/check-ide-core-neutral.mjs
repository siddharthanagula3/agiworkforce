#!/usr/bin/env node

// The editor-neutral core is only neutral while nothing in it imports an editor
// API, and a manifest that claims a capability the code does not honour is a
// promise VS Code keeps for us in a restricted workspace.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const IDE_CORE_DIR = 'packages/client/ide-runtime/src';
export const ADAPTER_DIR = 'apps/extension-vscode/src';
export const VSCODE_MANIFEST_PATH = 'apps/extension-vscode/package.json';
export const ADAPTER_CONFIG_PATH = 'apps/extension-vscode/src/platform/config.ts';
export const REMOTE_ENVIRONMENT_PATH = 'apps/extension-vscode/src/platform/remoteEnvironment.ts';

/** Remote workspaces the extension host is expected to name rather than guess. */
export const REQUIRED_REMOTE_KINDS = ['wsl', 'ssh', 'dev-container', 'codespaces', 'tunnel'];

/** A fork identifies itself through the API, never by its product name. */
const FORK_PRODUCT_NAMES = /\b(Cursor|VSCodium|Windsurf|Theia|Gitpod)\b/;

function read(repoRoot, relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function sourceFiles(repoRoot, relativeDir) {
  const root = path.join(repoRoot, relativeDir);
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const absolute = path.join(dir, entry);
      if (statSync(absolute).isDirectory()) {
        if (entry !== 'node_modules') walk(absolute);
        continue;
      }
      if (/\.[cm]?tsx?$/.test(entry)) found.push(path.relative(root, absolute));
    }
  };
  walk(root);
  return found.sort();
}

export function isTestFile(relativePath) {
  return (
    /\.(test|spec)\.[cm]?tsx?$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|test)\//.test(relativePath)
  );
}

export function importsEditorApi(source) {
  return (
    /(^|\n)\s*import\s[^\n;]*from\s+['"]vscode['"]/.test(source) ||
    /(^|\n)\s*import\s+['"]vscode['"]/.test(source) ||
    /\brequire\(\s*['"]vscode['"]\s*\)/.test(source) ||
    /\bimport\(\s*['"]vscode['"]\s*\)/.test(source)
  );
}

/** Settings the adapter reads user-scoped, which is a trust decision in code. */
export function trustScopedSettings(source) {
  return [
    ...source.matchAll(/getUserScoped<[^>]*>\(\s*'([^']+)'/g),
    ...source.matchAll(/inspect<[^>]*>\(\s*'([^']+)'\s*\)[\s\S]{0,200}?isTrusted/g),
  ].map((entry) => entry[1]);
}

export function checkIdeCoreNeutral(repoRoot = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const coreFiles = sourceFiles(repoRoot, IDE_CORE_DIR).filter((file) => !isTestFile(file));
  if (coreFiles.length === 0) fail(`${IDE_CORE_DIR} has no source files to keep neutral`);
  for (const file of coreFiles) {
    const source = read(repoRoot, path.join(IDE_CORE_DIR, file));
    if (importsEditorApi(source)) {
      fail(`${IDE_CORE_DIR}/${file} imports the vscode API, so the core is not editor-neutral`);
    }
    if (/from\s+['"][^'"]*apps\/extension-vscode/.test(source)) {
      fail(`${IDE_CORE_DIR}/${file} imports the VS Code adapter, which inverts the dependency`);
    }
  }

  const remoteSource = read(repoRoot, REMOTE_ENVIRONMENT_PATH);
  if (importsEditorApi(remoteSource)) {
    fail(`${REMOTE_ENVIRONMENT_PATH} imports the vscode API, so remote handling is not testable`);
  }
  for (const kind of REQUIRED_REMOTE_KINDS) {
    if (!remoteSource.includes(`'${kind}'`)) {
      fail(`${REMOTE_ENVIRONMENT_PATH} does not name the ${kind} workspace kind`);
    }
  }

  const manifest = JSON.parse(read(repoRoot, VSCODE_MANIFEST_PATH));
  const extensionKind = manifest.extensionKind;
  if (!Array.isArray(extensionKind) || extensionKind.length === 0) {
    fail(`${VSCODE_MANIFEST_PATH} declares no extensionKind`);
  } else if (!extensionKind.includes('workspace')) {
    fail(
      `${VSCODE_MANIFEST_PATH} declares extensionKind ${JSON.stringify(extensionKind)}, but the extension spawns the CLI beside the checkout, which only the workspace host can do`,
    );
  }

  const capabilities = manifest.capabilities ?? {};
  const untrusted = capabilities.untrustedWorkspaces;
  if (!untrusted || typeof untrusted.supported === 'undefined') {
    fail(`${VSCODE_MANIFEST_PATH} does not say what it does in an untrusted workspace`);
  } else {
    if (untrusted.supported !== true && !untrusted.description) {
      fail(
        `${VSCODE_MANIFEST_PATH} restricts untrusted workspaces without saying what it restricts`,
      );
    }
    const properties = manifest.contributes?.configuration?.properties ?? {};
    const declared = new Set(untrusted.restrictedConfigurations ?? []);
    for (const key of declared) {
      if (!(key in properties)) {
        fail(`${VSCODE_MANIFEST_PATH} restricts ${key}, which it does not contribute`);
      }
    }
    for (const setting of trustScopedSettings(read(repoRoot, ADAPTER_CONFIG_PATH))) {
      if (!declared.has(`agiWorkforce.${setting}`)) {
        fail(
          `${ADAPTER_CONFIG_PATH} refuses a workspace value for ${setting}, which ${VSCODE_MANIFEST_PATH} does not list as restricted`,
        );
      }
    }
  }

  const virtual = capabilities.virtualWorkspaces;
  if (typeof virtual === 'undefined') {
    fail(`${VSCODE_MANIFEST_PATH} does not say what it does in a virtual workspace`);
  } else if (virtual !== false && virtual?.supported !== false && !virtual?.description) {
    fail(`${VSCODE_MANIFEST_PATH} allows a virtual workspace without saying what works there`);
  }

  for (const file of sourceFiles(repoRoot, ADAPTER_DIR).filter((entry) => !isTestFile(entry))) {
    const source = read(repoRoot, path.join(ADAPTER_DIR, file));
    if (FORK_PRODUCT_NAMES.test(source.replace(/Cursor(Line|Character|Position|Key|:)/g, ''))) {
      fail(
        `${ADAPTER_DIR}/${file} branches on an editor's product name; read the capability instead`,
      );
    }
  }

  return failures;
}

function main() {
  const failures = checkIdeCoreNeutral();
  if (failures.length > 0) {
    console.error('IDE core neutrality check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    'check-ide-core-neutral: the core imports no editor API and the manifest matches it.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
