#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SCANNED_DIRS = ['apps/web/app', 'apps/web/lib'];

/**
 * Every paid model call is dispatched through a server provider adapter. A
 * module that dispatches one has to hold the cost against a budget before the
 * provider runs: the plan's managed credits, the Free usage windows, or the
 * guest caps. A call with none of these reaches the provider bill and never the
 * account that caused it, which is how follow-up suggestions and automated code
 * review ran uncharged until 2026-10-10.
 */
export const PROVIDER_CALL = /\bbuildServerProviderAdapter\s*\(/;

export const RESERVATION_ENTRY_POINTS = Object.freeze([
  'reserveManagedUsageRequest',
  'reserveManagedUsageProviderStep',
  'reserveBackgroundUsage',
  'beginFreeTrialRequest',
  'reserveGuestSpend',
]);

/**
 * Modules that dispatch a provider call without holding it against an account,
 * each with why that is correct. The guard fails on anything outside this map
 * and on any entry that no longer dispatches or now reserves, so the list can
 * only shrink.
 */
export const KNOWN_UNRESERVED = Object.freeze({
  'apps/web/lib/services/provider-adapter-service.ts':
    'Defines the adapter factory; it dispatches nothing itself.',
  'apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts':
    'Builds the adapter for a chat turn that request-processor.ts reserves before dispatch.',
  'apps/web/lib/e2b/runtime.ts':
    'Reads a managed harness credential from the adapter config; no model call is made here, and the sandbox it serves is reserved in compute-metering.ts.',
  'apps/web/lib/moderation/output-moderation.ts':
    'The safety classifier for a generated image the user was already charged for. A safety check must run whatever the budget, so it is platform cost.',
  'apps/web/lib/services/model-rollout/shadow-dispatch-service.ts':
    'Mirrors traffic to a rollout candidate for evaluation, bounded by each slot’s global daily cap and never billed to a user.',
  'apps/web/lib/support/agent/answer/model-route.ts':
    'The support assistant is platform-borne and admitted by its own call limit (admitModelCall).',
});

const CODE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED = /(^|\/)(node_modules|__tests__|\.next|dist)(\/|$)|\.test\.[a-z]+$|\.d\.ts$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (SKIPPED.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function scannedFiles(repoRoot = REPO_ROOT, dirs = SCANNED_DIRS) {
  const files = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(repoRoot, dir))) {
      if (CODE_EXTENSIONS.has(path.extname(file))) {
        files.push(path.relative(repoRoot, file).split(path.sep).join('/'));
      }
    }
  }
  return files.sort();
}

export function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function dispatchesProviderCall(source) {
  return PROVIDER_CALL.test(withoutComments(source));
}

export function reservesBeforeDispatch(source) {
  const code = withoutComments(source);
  return RESERVATION_ENTRY_POINTS.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(code));
}

export function checkProviderCallReservation(
  repoRoot = REPO_ROOT,
  dirs = SCANNED_DIRS,
  known = KNOWN_UNRESERVED,
) {
  const dispatching = [];
  const unreserved = [];
  for (const file of scannedFiles(repoRoot, dirs)) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    if (!dispatchesProviderCall(source)) continue;
    dispatching.push(file);
    if (!reservesBeforeDispatch(source)) unreserved.push(file);
  }
  const unexpected = unreserved.filter((file) => !(file in known));
  const stale = Object.keys(known).filter((file) => !unreserved.includes(file));
  return { dispatching, unreserved, unexpected, stale };
}

function main() {
  const result = checkProviderCallReservation();
  if (result.unexpected.length > 0) {
    console.error(
      'A module dispatches a paid provider call without holding its cost against a budget.\n' +
        'Reserve it first (reserveManagedUsageRequest, reserveBackgroundUsage for a side call,\n' +
        'beginFreeTrialRequest on Free) and settle it after, or, if the cost is truly the\n' +
        'platform’s, add the file to KNOWN_UNRESERVED with the reason.\n',
    );
    for (const file of result.unexpected) console.error(`  ${file}`);
    process.exitCode = 1;
    return;
  }
  if (result.stale.length > 0) {
    console.error(
      'These files no longer dispatch unreserved provider calls and must leave KNOWN_UNRESERVED:\n' +
        result.stale.map((file) => `  ${file}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `check-provider-call-reservation: ${result.dispatching.length} modules dispatch provider calls, ` +
      `${result.unreserved.length} known platform-borne, none new`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
