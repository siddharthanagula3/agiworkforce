#!/usr/bin/env node

/**
 * A workspace that keeps a user's work on this device must not reach our cloud,
 * and the only thing that can decide that is the chokepoint that reads the
 * workspace's trust boundary before the socket opens. So every outbound call
 * the desktop renderer makes has to be `guardedFetch`.
 *
 * The files are enumerated from the tree rather than listed here. A guard that
 * looks for modules already importing the helper can only ever see the ones
 * that adopted it; the module that never heard of it is the one that leaks, and
 * it would be invisible. The eslint rule beside this one catches a raw `fetch`
 * built out of `WEB_APP_URL` or `API_BASE_URL`; it cannot see a host that
 * arrived in a variable, which is exactly how a settings field reaches one.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { outboundFetchCalls, sourceFilesUnder } from './lib/url-fetch-egress.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const RENDERER_DIR = 'apps/desktop/src';
export const GUARD_MODULE = 'apps/desktop/src/lib/egressGuard.ts';

/**
 * The chokepoint itself makes the one unguarded call in the renderer, after it
 * has decided the destination is allowed. Nothing else may.
 */
export const TRANSPORT = [GUARD_MODULE];

/**
 * A `fetch` member of an interface or of an object that implements one. Those
 * are the name of a capability being declared or defined, not a call: a
 * declaration ends in its return type, a definition opens a body. A real call
 * written as a bare statement ends in neither.
 */
export function isFetchMember(source, index) {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  const lineEnd = source.indexOf('\n', index);
  const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trimEnd();
  if (!/^\s*(?:async\s+)?fetch\s*\(/.test(line)) return false;
  return /\)\s*:\s*[^;]+;$/.test(line) || /\)\s*\{$/.test(line);
}

export function unguardedCalls(source, relativePath) {
  if (TRANSPORT.includes(relativePath)) return [];
  return outboundFetchCalls(source)
    .filter((call) => call.callee === 'fetch')
    .filter((call) => !isFetchMember(source, call.index))
    .map((call) => ({
      line: source.slice(0, call.index).split('\n').length,
      target: call.target,
    }));
}

export function checkDesktopLocalEgress(repoRoot = REPO_ROOT) {
  const failures = [];
  const rendererRoot = path.join(repoRoot, RENDERER_DIR);
  const files = sourceFilesUnder(rendererRoot);
  if (files.length === 0) return [`${RENDERER_DIR}: no renderer sources to check`];

  for (const absolute of files) {
    const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
    const source = readFileSync(absolute, 'utf8');
    for (const call of unguardedCalls(source, relative)) {
      failures.push(
        `${relative}:${call.line}: calls fetch() directly, which never reads the workspace's trust boundary. Use guardedFetch from ${GUARD_MODULE}.`,
      );
    }
  }

  for (const transport of TRANSPORT) {
    const source = readFileSync(path.join(repoRoot, transport), 'utf8');
    if (!/isOurCloudHost\(/.test(source)) {
      failures.push(`${transport}: no longer classifies the destination before dialling it`);
    }
    if (!/isLocalMode\(\)|isPrivateTrustBoundary\(/.test(source)) {
      failures.push(`${transport}: no longer reads the workspace's trust boundary`);
    }
  }

  return failures;
}

function main() {
  const failures = checkDesktopLocalEgress();
  if (failures.length > 0) {
    console.error('Desktop local-mode egress check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    'check-desktop-local-egress: every renderer request passes the trust-boundary chokepoint.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
