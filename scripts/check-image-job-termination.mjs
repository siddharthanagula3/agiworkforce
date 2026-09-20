#!/usr/bin/env node

// A durable image job must be able to reach its end without the request that
// submitted it. Every way of ending one is an UPDATE in the store that sets
// terminal_at, so this guard enumerates those from the store's own SQL and
// refuses any that only a route can reach: a job whose only closer is an HTTP
// handler is a job that sits unfinished whenever the caller does not come back.
// Cancellation is the case that found this. Its close was reachable only from
// the cancel route, so an attempt that died holding the claim left the job
// cancelling for good.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const STORE_PATH = 'apps/web/lib/server/image-generation-jobs.ts';
export const BACKGROUND_DIR = 'apps/web/app/api/media/image/lib';
export const ROUTE_DIR = 'apps/web/app/api/media/image';
export const DRAIN_PATH = 'apps/web/app/api/media/image/lib/image-job-drain.ts';

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function walk(root, dir, out) {
  let entries;
  try {
    entries = readdirSync(path.join(root, dir));
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relative = `${dir}/${entry}`;
    if (statSync(path.join(root, relative)).isDirectory()) walk(root, relative, out);
    else if (entry.endsWith('.ts') && !entry.includes('.test.')) out.push(relative);
  }
  return out;
}

/**
 * The exported store functions whose SQL sets terminal_at, which is what makes
 * a job over. Read from the store rather than listed here, so a new ending is
 * covered the day it is written.
 */
export function readTerminalTransitions(source) {
  const names = [];
  const pattern = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  const starts = [];
  for (const match of source.matchAll(pattern)) {
    starts.push({ name: match[1], index: match.index ?? 0 });
  }
  for (const [position, entry] of starts.entries()) {
    const end = position + 1 < starts.length ? starts[position + 1].index : source.length;
    const body = source.slice(entry.index, end);
    if (/terminal_at\s*=\s*now\(\)/.test(body)) names.push(entry.name);
  }
  return [...new Set(names)].sort();
}

function referenceCount(files, name) {
  return files.filter((file) => new RegExp(`\\b${name}\\b`).test(file.source)).map((f) => f.path);
}

export function checkImageJobTermination(repoRoot = REPO_ROOT) {
  const failures = [];
  const store = read(repoRoot, STORE_PATH);
  if (store === null) {
    failures.push(`${STORE_PATH} is missing; nothing records a durable image job`);
    return failures;
  }

  const transitions = readTerminalTransitions(store);
  if (transitions.length === 0) {
    failures.push(`${STORE_PATH} declares no way to end a job`);
    return failures;
  }

  const background = walk(repoRoot, BACKGROUND_DIR, []).map((relative) => ({
    path: relative,
    source: read(repoRoot, relative) ?? '',
  }));
  if (background.length === 0) {
    failures.push(`${BACKGROUND_DIR} holds nothing that could run a job off the request path`);
    return failures;
  }
  const routes = walk(repoRoot, ROUTE_DIR, [])
    .filter((relative) => relative.endsWith('/route.ts'))
    .map((relative) => ({ path: relative, source: read(repoRoot, relative) ?? '' }));

  for (const name of transitions) {
    const fromBackground = referenceCount(background, name);
    if (fromBackground.length > 0) continue;
    const fromRoutes = referenceCount(routes, name);
    failures.push(
      fromRoutes.length > 0
        ? `${name} ends a job but is reachable only from ${fromRoutes.join(', ')}, so a job it should end waits on the caller`
        : `${name} ends a job and nothing calls it`,
    );
  }

  const drain = read(repoRoot, DRAIN_PATH);
  if (drain === null) {
    failures.push(`${DRAIN_PATH} is missing, so no queued work finishes an abandoned job`);
  } else if (!/reconcileCancelledImageGenerationJob/.test(drain)) {
    failures.push(`${DRAIN_PATH} does not finish a cancellation whose attempt never came back`);
  }

  return failures;
}

function main() {
  const failures = checkImageJobTermination();
  if (failures.length > 0) {
    console.error('Durable image job termination failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('Durable image jobs: every ending is reachable without the submitting request.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
