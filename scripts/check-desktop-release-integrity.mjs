#!/usr/bin/env node

/**
 * One desktop surface, two shells, and the two must not reach into each other
 * or into each other's releases.
 *
 * `docs/architecture/desktop.md` names the public product: the Electron app
 * under `apps/desktop/electron`. The Rust/Tauri tree is retained and ships on
 * its own tag namespace. What this checks is that the arrangement holds in the
 * things that actually run: the public shell carries no dependency on the
 * runtime it does not ship, each channel refuses to build before it holds the
 * key it signs with, and an update a user is offered comes from an address this
 * repository chose over a transport that can be verified.
 *
 * The channels are read out of the workflow files rather than listed here, so a
 * third one cannot appear without answering the same questions.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SHELL_DIR = 'apps/desktop/electron';
export const TAURI_CONFIG = 'apps/desktop/src-tauri/tauri.conf.json';
export const DESKTOP_DOC = 'docs/architecture/desktop.md';
export const WORKFLOW_DIR = '.github/workflows';

/** A release channel and the credential it must hold before it builds. */
export const RELEASE_CHANNELS = {
  'release-desktop.yml': {
    tagPrefix: 'v-desktop-',
    signing: ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'],
  },
  'release-desktop-cloud.yml': {
    tagPrefix: 'v-cloud-desktop-',
    signing: ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_API_KEY'],
  },
};

/** The runtime the public shell does not ship, so must not import. */
const UNSHIPPED_RUNTIME =
  /from\s+['"]@tauri-apps\/|require\(['"]@tauri-apps\/|['"][^'"]*src-tauri\//;

function sourceFiles(root, relativeDir) {
  const found = [];
  for (const entry of readdirSync(path.join(root, relativeDir))) {
    const relative = path.join(relativeDir, entry);
    if (statSync(path.join(root, relative)).isDirectory()) {
      if (entry === '__tests__' || entry === 'dist' || entry === 'node_modules') continue;
      found.push(...sourceFiles(root, relative));
      continue;
    }
    if (/\.(ts|mjs|cjs|js)$/.test(entry) && !entry.endsWith('.d.ts')) found.push(relative);
  }
  return found.sort();
}

/** Comment lines mention the other stack by name on purpose; code must not. */
function codeLines(source) {
  let inBlock = false;
  return source.split('\n').filter((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return false;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/');
      return false;
    }
    return !trimmed.startsWith('//') && !trimmed.startsWith('*');
  });
}

export function checkShellRuntimeBoundary(repoRoot) {
  const failures = [];
  for (const relative of sourceFiles(repoRoot, SHELL_DIR)) {
    const lines = codeLines(readFileSync(path.join(repoRoot, relative), 'utf8'));
    lines.forEach((line, index) => {
      if (UNSHIPPED_RUNTIME.test(line)) {
        failures.push(
          `${relative}:${index + 1}: the public desktop shell depends on the runtime it does not ship`,
        );
      }
    });
  }
  return failures;
}

export function checkReleaseChannels(repoRoot) {
  const failures = [];
  const present = readdirSync(path.join(repoRoot, WORKFLOW_DIR)).filter((name) =>
    name.startsWith('release-desktop'),
  );
  for (const name of present) {
    if (!RELEASE_CHANNELS[name]) {
      failures.push(
        `${WORKFLOW_DIR}/${name}: a desktop release channel this check has never been told about`,
      );
    }
  }

  for (const [name, channel] of Object.entries(RELEASE_CHANNELS)) {
    if (!present.includes(name)) {
      failures.push(`${WORKFLOW_DIR}/${name}: the release channel is gone`);
      continue;
    }
    const source = readFileSync(path.join(repoRoot, WORKFLOW_DIR, name), 'utf8');
    const tags = [...source.matchAll(/^\s*-\s*'(v-[a-z-]*)\*'/gm)].map((entry) => entry[1]);
    if (tags.length === 0) {
      failures.push(`${WORKFLOW_DIR}/${name}: publishes on no tag namespace of its own`);
    }
    for (const tag of tags) {
      if (tag !== channel.tagPrefix) {
        failures.push(
          `${WORKFLOW_DIR}/${name}: publishes on ${tag}*, which is not this channel's ${channel.tagPrefix}*`,
        );
      }
    }
    for (const secret of channel.signing) {
      if (!source.includes(secret)) {
        failures.push(`${WORKFLOW_DIR}/${name}: never reads ${secret}, so it can publish unsigned`);
      }
      // Present is not enough: the job has to stop when the value is empty,
      // or a missing secret becomes an unsigned build rather than a failure.
      if (!new RegExp(`-z\\s+"\\$${secret}"|\\bfor name in [^\\n]*\\b${secret}\\b`).test(source)) {
        failures.push(
          `${WORKFLOW_DIR}/${name}: does not refuse to build when ${secret} is missing`,
        );
      }
    }
  }
  return failures;
}

export function checkUpdateFeed(repoRoot) {
  const failures = [];
  const config = JSON.parse(readFileSync(path.join(repoRoot, TAURI_CONFIG), 'utf8'));
  const updater = config.plugins?.updater ?? {};

  if (typeof updater.pubkey !== 'string' || updater.pubkey.trim() === '') {
    failures.push(`${TAURI_CONFIG}: the updater has no public key, so it verifies nothing`);
  }
  if (config.bundle?.createUpdaterArtifacts !== true) {
    failures.push(`${TAURI_CONFIG}: the build produces no signed updater artifact`);
  }
  const endpoints = Array.isArray(updater.endpoints) ? updater.endpoints : [];
  if (endpoints.length === 0) {
    failures.push(`${TAURI_CONFIG}: the updater names no endpoint`);
  }
  for (const endpoint of endpoints) {
    if (!/^https:\/\//.test(String(endpoint))) {
      failures.push(
        `${TAURI_CONFIG}: the updater reads ${endpoint} over an unverifiable transport`,
      );
    }
  }
  return failures;
}

export function checkDesktopReleaseIntegrity(repoRoot = REPO_ROOT) {
  const failures = [
    ...checkShellRuntimeBoundary(repoRoot),
    ...checkReleaseChannels(repoRoot),
    ...checkUpdateFeed(repoRoot),
  ];

  const doc = readFileSync(path.join(repoRoot, DESKTOP_DOC), 'utf8');
  if (!doc.includes(SHELL_DIR)) {
    failures.push(
      `${DESKTOP_DOC}: does not name the tree the public desktop product is built from`,
    );
  }
  return failures;
}

function main() {
  const failures = checkDesktopReleaseIntegrity();
  if (failures.length > 0) {
    console.error('Desktop release integrity check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    'check-desktop-release-integrity: each shell ships on its own signed channel and carries only its own runtime.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
