#!/usr/bin/env node

// Every window the desktop shell opens is the same account on the same
// machine. A window that named a session of its own would be a second browser:
// signed in separately, signed out separately, and holding its own cookie jar
// for the same site. Each window is enumerated from the source rather than
// listed here, so a new one cannot be added without answering for its session.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SHELL_DIR = 'apps/desktop/electron';
export const SHARED_PARTITION_SYMBOL = 'REMOTE_SESSION_PARTITION';

const REQUIRED_WEB_PREFERENCES = [
  ['contextIsolation', 'true'],
  ['sandbox', 'true'],
  ['nodeIntegration', 'false'],
];

function sourceFiles(root, relativeDir) {
  const absolute = path.join(root, relativeDir);
  const found = [];
  for (const entry of readdirSync(absolute)) {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'dist' || entry === 'node_modules') continue;
      found.push(...sourceFiles(root, path.join(relativeDir, entry)));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      found.push(path.join(relativeDir, entry));
    }
  }
  return found.sort();
}

/**
 * The argument object of every `new BrowserWindow(` in a file, read by
 * balancing braces rather than by a pattern, so a nested `webPreferences`
 * block cannot end the match early.
 */
export function browserWindowConstructions(source) {
  const found = [];
  const marker = 'new BrowserWindow(';
  let cursor = source.indexOf(marker);
  while (cursor !== -1) {
    const start = source.indexOf('{', cursor);
    if (start === -1) break;
    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push({
      line: source.slice(0, cursor).split('\n').length,
      body: source.slice(start, end + 1),
    });
    cursor = source.indexOf(marker, end);
  }
  return found;
}

export function checkWindowConstruction(where, construction) {
  const failures = [];
  const { body } = construction;
  const at = `${where}:${construction.line}`;

  const partitions = [...body.matchAll(/partition\s*:\s*([^,\n}]+)/g)].map((entry) =>
    entry[1].trim(),
  );
  for (const partition of partitions) {
    if (!partition.includes(SHARED_PARTITION_SYMBOL)) {
      failures.push(
        `${at}: opens a window on ${partition} instead of ${SHARED_PARTITION_SYMBOL}, which gives it a session of its own`,
      );
    }
  }

  if (!/webPreferences\s*:/.test(body)) {
    failures.push(`${at}: opens a window with no webPreferences of its own`);
    return failures;
  }

  for (const [key, value] of REQUIRED_WEB_PREFERENCES) {
    if (!new RegExp(`${key}\\s*:\\s*${value}\\b`).test(body)) {
      failures.push(`${at}: does not set ${key}: ${value}`);
    }
  }

  return failures;
}

export function checkDesktopWindowSession(repoRoot = REPO_ROOT) {
  const failures = [];
  const files = sourceFiles(repoRoot, SHELL_DIR);
  if (files.length === 0) {
    return [`${SHELL_DIR}: no shell sources to check`];
  }

  let windows = 0;
  for (const file of files) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    for (const construction of browserWindowConstructions(source)) {
      windows += 1;
      failures.push(...checkWindowConstruction(file, construction));
    }
  }

  if (windows === 0) failures.push(`${SHELL_DIR}: no window is opened anywhere`);
  return failures;
}

function main() {
  const failures = checkDesktopWindowSession();
  if (failures.length > 0) {
    console.error('Desktop window session check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    'check-desktop-window-session: every shell window shares one session and one sandbox.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
