#!/usr/bin/env node

import { existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRACKED_STALE = ['reports', 'tasks', '_archive'];

const CACHE_STALE = ['.tmp', '.tmp_capture', '.playwright-mcp', '.remember', '.firecrawl'];

export const KEEP = [
  'README.md',
  'audit',
  'docs/agent-context',
  'docs/architecture',
  'docs/compliance',
  'docs/decisions',
  'docs/development',
  'docs/development',
  'docs/generated',
  'docs/product',
  'docs/runbooks',
  'docs/security',
  'docs/specs',
  'docs/standards',
  'docs/work',
  'apps',
  'packages',
  'crates',
  'services',
  'scripts',
];

export function isProtectedCleanupPath(candidate) {
  return KEEP.some(
    (protectedPath) => candidate === protectedPath || candidate.startsWith(`${protectedPath}/`),
  );
}

function countFiles(p) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${d}/${e.name}`);
      else n++;
    }
  };
  try {
    if (statSync(p).isDirectory()) walk(p);
    else n = 1;
  } catch {
    /* ignore */
  }
  return n;
}

function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const guard = (p) => {
    if (isProtectedCleanupPath(p)) {
      throw new Error(`refusing to remove protected path: ${p}`);
    }
  };

  const tracked = TRACKED_STALE.filter(existsSync);
  const caches = CACHE_STALE.filter(existsSync);

  console.log('# Tracked stale (git rm -r, recoverable from history)');
  for (const p of tracked) {
    guard(p);
    console.log(`  ${apply ? 'removing' : 'git rm -r'} ${p}  (${countFiles(p)} files)`);
    if (apply) execFileSync('git', ['rm', '-r', '--quiet', p]);
  }

  console.log('\n# Gitignored caches (rm -rf)');
  for (const p of caches) {
    guard(p);
    console.log(`  ${apply ? 'removing' : 'rm -rf'} ${p}  (${countFiles(p)} files)`);
    if (apply) execFileSync('rm', ['-rf', p]);
  }

  const total = [...tracked, ...caches].length;
  if (apply) {
    console.log(`\n✓ cleaned ${total} path(s). Review 'git status', then commit.`);
  } else {
    console.log(
      `\n${total} path(s) planned. Re-run with --apply in a git env, then commit.\n` +
        `Protected (never touched): ${KEEP.join(', ')}.\n` +
        `Note: review other docs/ subfolders (plans, research, launch, etc.) manually, not auto-removed.`,
    );
  }
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
