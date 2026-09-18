#!/usr/bin/env node

/**
 * A structured log field built from a prompt, a tool result or a credential is
 * a leak whatever the message around it says. The scanner that decides this is
 * apps/web/lib/identity/log-hygiene.ts, imported here rather than reimplemented
 * so the guard and the unit tests measure the same thing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  FIELDS_NEVER_LOGGED,
  logCallSites,
  rawContentReferences,
} from '../apps/web/lib/identity/log-hygiene.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Trees whose log calls carry model input or provider credentials. */
export const SCANNED_ROOTS = Object.freeze([
  'apps/web/app/api/llm',
  'apps/web/lib/observability',
  'packages/ai/providers',
]);

const EXCLUDED_DIRECTORY = /^(__tests__|__mocks__|__fixtures__|node_modules|dist|build|coverage)$/;

export function productFiles(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return EXCLUDED_DIRECTORY.test(entry.name) ? [] : productFiles(full);
    }
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(test|spec|d)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

export function logHygieneViolations(repoRoot = REPO_ROOT) {
  const violations = [];
  let scanned = 0;
  let sites = 0;

  for (const root of SCANNED_ROOTS) {
    const absolute = path.join(repoRoot, root);
    const files = productFiles(absolute);
    if (files.length === 0) {
      violations.push(
        `${root} matched no product file. A scanned root that has moved stops proving anything; ` +
          `update SCANNED_ROOTS in scripts/check-llm-log-hygiene.mjs.`,
      );
      continue;
    }
    for (const file of files) {
      scanned += 1;
      const source = readFileSync(file, 'utf8');
      for (const site of logCallSites(source)) {
        sites += 1;
        const hits = rawContentReferences(site.text);
        if (hits.length === 0) continue;
        violations.push(
          `${path.relative(repoRoot, file)}:${site.line} logs ${hits.join(', ')}. ` +
            `Log a count, a length or an id instead.`,
        );
      }
    }
  }

  return { violations, scanned, sites };
}

function main() {
  const repoRoot = REPO_ROOT;
  // A root that exists but has been emptied would otherwise pass silently.
  for (const root of SCANNED_ROOTS) {
    try {
      statSync(path.join(repoRoot, root));
    } catch {
      console.error(`✗ LLM log hygiene: scanned root ${root} does not exist.`);
      process.exit(1);
    }
  }

  const { violations, scanned, sites } = logHygieneViolations(repoRoot);
  if (violations.length > 0) {
    console.error('✗ LLM log hygiene check failed:');
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }

  console.log(
    `✓ LLM log hygiene: ${sites} log call site(s) in ${scanned} file(s) name none of the ` +
      `${FIELDS_NEVER_LOGGED.length} fields that carry customer text or a credential.`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
