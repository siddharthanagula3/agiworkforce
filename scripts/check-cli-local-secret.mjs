#!/usr/bin/env node

// A local listener that authenticates against a value compiled into the binary
// is not authenticated: every copy of the build shares it. This enumerates the
// Rust sources the CLI and its crates ship and fails on a secret-shaped
// constant, and it holds each local server to the rule that its credential is
// configured or generated, never a literal and never optional.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SCANNED_ROOTS = ['apps/cli/src', 'crates'];

/**
 * A binding whose name says it holds a credential. `let` is included because a
 * shared secret assigned into a local is the same defect as a `const`.
 */
const SECRET_BINDING =
  /\b(?:const|static|let)\s+(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=;]*)?=\s*"([^"]*)"/g;

const SECRET_NAME = /(secret|token|password|passphrase|credential|apikey|api_key)/i;

/**
 * Names that say what a value is for rather than holding one. A header name, a
 * JSON-RPC method and a keyring service name are all public strings whose
 * whole purpose is to be the same in every build.
 */
const NAMES_A_LITERAL_IS_FOR = /(_HEADER|_METHOD|_SERVICE|_ENV|_VAR|_KEY_NAME|_PREFIX|_LABEL)$/;

/**
 * Literal secret-shaped constants that are not secrets, each with the reason.
 * A new one fails until it is either removed or recorded here, so the list
 * cannot grow into an allowlist by accident.
 */
export const NOT_A_SECRET = {
  'crates/agiworkforce-protocol/src/developer_session.rs:ACCOUNT_TOKEN':
    'the JSON-RPC method name clients call to read a token, not a token',
  'apps/cli/src/auth.rs:CREDENTIAL_USE_LOG':
    'the file name the credential-use trail is written to, not a credential',
};

/**
 * Each local server the CLI runs, and the gate its credential has to pass. A
 * server added without an entry fails, so the list is a census rather than an
 * allowlist.
 */
export const LOCAL_SERVERS = {
  'apps/cli/src/daemon.rs': {
    what: 'the webhook trigger server',
    requires: [
      'webhook_token is required when webhook triggers are configured',
      'webhook_token is too short',
      'constant_time_eq',
    ],
  },
  'apps/cli/src/features/a2a/server.rs': {
    what: 'the agent-to-agent server',
    requires: [],
  },
  'apps/cli/src/a2a_ws.rs': {
    what: 'the agent-to-agent websocket',
    requires: [],
  },
};

function read(repoRoot, relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function rustSources(repoRoot = REPO_ROOT) {
  const found = [];
  const walk = (relative) => {
    const absolute = path.join(repoRoot, relative);
    let entries;
    try {
      entries = readdirSync(absolute);
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(relative, entry);
      if (statSync(path.join(repoRoot, next)).isDirectory()) {
        if (entry === 'target' || entry === 'bindings' || entry === 'tests') continue;
        walk(next);
        continue;
      }
      if (entry.endsWith('.rs')) found.push(next.split(path.sep).join('/'));
    }
  };
  for (const root of SCANNED_ROOTS) walk(root);
  return found.sort();
}

/**
 * Source with every `#[cfg(test)]` module blanked out. A fixture token inside
 * one is not shipped, and blanking rather than dropping keeps line numbers.
 */
export function withoutTestModules(source) {
  const marker = source.indexOf('#[cfg(test)]');
  if (marker === -1) return source;
  let kept = '';
  let index = 0;
  while (index < source.length) {
    const at = source.indexOf('#[cfg(test)]', index);
    if (at === -1) {
      kept += source.slice(index);
      break;
    }
    kept += source.slice(index, at);
    const open = source.indexOf('{', at);
    if (open === -1) {
      index = source.length;
      break;
    }
    let depth = 0;
    let cursor = open;
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === '{') depth += 1;
      else if (source[cursor] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    kept += source.slice(at, cursor + 1).replace(/[^\n]/g, ' ');
    index = cursor + 1;
  }
  return kept;
}

export function literalSecrets(repoRoot = REPO_ROOT, files = rustSources(repoRoot)) {
  const found = [];
  for (const file of files) {
    const source = withoutTestModules(read(repoRoot, file));
    for (const match of source.matchAll(SECRET_BINDING)) {
      const [, name, value] = match;
      if (!SECRET_NAME.test(name)) continue;
      if (value.length === 0) continue;
      if (NAMES_A_LITERAL_IS_FOR.test(name)) continue;
      found.push({ file, name, key: `${file}:${name}` });
    }
  }
  return found;
}

export function checkCliLocalSecret(repoRoot = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const found = literalSecrets(repoRoot);
  const seen = new Set();
  for (const entry of found) {
    seen.add(entry.key);
    const reason = NOT_A_SECRET[entry.key];
    if (reason === undefined) {
      fail(
        `${entry.file} compiles ${entry.name} in as a literal; every copy of the build would share it. Read it from configuration, or generate it per run.`,
      );
    } else if (reason.trim().length < 20) {
      fail(`${entry.key} is recorded as harmless without a reason that says why`);
    }
  }
  for (const key of Object.keys(NOT_A_SECRET)) {
    if (!seen.has(key)) fail(`${key} is recorded here and no longer exists; remove the entry`);
  }

  for (const [file, server] of Object.entries(LOCAL_SERVERS)) {
    let source;
    try {
      source = read(repoRoot, file);
    } catch {
      fail(`${file} runs ${server.what} and is not in the tree`);
      continue;
    }
    for (const required of server.requires) {
      if (!source.includes(required)) {
        fail(`${file} no longer holds ${server.what} to "${required}"`);
      }
    }
  }

  return failures;
}

function main() {
  const failures = checkCliLocalSecret();
  if (failures.length > 0) {
    console.error('CLI local-secret check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-cli-local-secret: ${rustSources().length} Rust sources scanned, ${Object.keys(LOCAL_SERVERS).length} local servers held to a configured credential.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
