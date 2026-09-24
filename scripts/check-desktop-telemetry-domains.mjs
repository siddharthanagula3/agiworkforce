#!/usr/bin/env node

// A vocabulary nothing emits describes nothing. The desktop shell names the
// parts of itself it reports on; this reads that list out of the source and
// fails any name with no production call site, and any call site naming a
// domain the list does not hold. Tests are excluded deliberately: a domain
// proved only by its own test is not instrumented.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SHELL_DIR = 'apps/desktop/electron';
export const DOMAIN_SOURCE = 'apps/desktop/electron/runtime/desktopTelemetry.ts';
export const EMITTER_SOURCE = 'apps/desktop/electron/runtime/desktopTelemetryService.ts';
export const EMITTER = 'recordDesktopEvent';
const DOMAIN_LIST = 'DESKTOP_TELEMETRY_DOMAINS';

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

/** The declared vocabulary, read from the array rather than restated here. */
export function declaredDomains(source) {
  const start = source.indexOf(`${DOMAIN_LIST} = [`);
  if (start === -1) return [];
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  if (open === -1 || close === -1) return [];
  return [...source.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]);
}

/**
 * Every domain an emit call names, found by balancing the braces of the event
 * object so a call spread over several lines is read whole.
 */
export function emittedDomains(source) {
  const found = [];
  const marker = `${EMITTER}(`;
  let cursor = source.indexOf(marker);
  while (cursor !== -1) {
    const start = source.indexOf('{', cursor);
    const nextCall = source.indexOf(marker, cursor + marker.length);
    if (start === -1 || (nextCall !== -1 && start > nextCall)) {
      cursor = nextCall;
      continue;
    }
    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(start, end + 1);
    const domain = body.match(/domain\s*:\s*'([a-z_]+)'/);
    found.push({
      line: source.slice(0, cursor).split('\n').length,
      domain: domain ? domain[1] : null,
    });
    cursor = source.indexOf(marker, end);
  }
  return found;
}

export function checkDesktopTelemetryDomains(repoRoot = REPO_ROOT) {
  const failures = [];
  let declared;
  try {
    declared = declaredDomains(readFileSync(path.join(repoRoot, DOMAIN_SOURCE), 'utf8'));
  } catch {
    return [`${DOMAIN_SOURCE}: the telemetry vocabulary could not be read`];
  }
  if (declared.length === 0) return [`${DOMAIN_SOURCE}: ${DOMAIN_LIST} names no domain`];

  const emitted = new Map();
  for (const file of sourceFiles(repoRoot, SHELL_DIR)) {
    if (file === DOMAIN_SOURCE || file === EMITTER_SOURCE) continue;
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    for (const call of emittedDomains(source)) {
      const at = `${file}:${call.line}`;
      if (call.domain === null) {
        failures.push(`${at}: ${EMITTER} is called without a literal domain`);
        continue;
      }
      if (!declared.includes(call.domain)) {
        failures.push(`${at}: reports on "${call.domain}", which ${DOMAIN_LIST} does not name`);
        continue;
      }
      if (!emitted.has(call.domain)) emitted.set(call.domain, at);
    }
  }

  for (const domain of declared) {
    if (!emitted.has(domain)) {
      failures.push(`${DOMAIN_SOURCE}: nothing in ${SHELL_DIR} reports on "${domain}"`);
    }
  }
  return failures;
}

function main() {
  const failures = checkDesktopTelemetryDomains();
  if (failures.length > 0) {
    console.error('Desktop telemetry domain check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('check-desktop-telemetry-domains: every shell domain reports on itself.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
