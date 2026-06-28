#!/usr/bin/env node
// AGI repo cleanup — remove stale audits / reports / working notes / caches.
//
// Conservative + explicit: it only touches a hard-coded STALE allowlist and
// refuses to touch anything in KEEP. SAFE BY DEFAULT (lists the plan and
// exits). Pass --apply to execute. Tracked dirs are removed with `git rm -r`
// (recoverable from history); gitignored caches with `rm -rf`.
//
// Must run in a git environment (NOT the Cowork sandbox, which blocks git
// writes and file removal). Review the dry-run, then --apply, then commit.
//
//   node scripts/clean-repo.mjs            # dry-run (default)
//   node scripts/clean-repo.mjs --apply    # execute

import { existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Tracked, stale → git rm -r (kept in history, recoverable).
const TRACKED_STALE = ['audit', 'reports', 'tasks', '_archive', 'docs/archive'];

// Gitignored caches / scratch → rm -rf.
const CACHE_STALE = ['.tmp', '.tmp_capture', '.playwright-mcp', '.remember', '.firecrawl'];

// Never touch these (canonical sources of truth + product code).
const KEEP = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'docs/current',
  'docs/engineering',
  'docs/agent-context',
  'docs/strategy',
  'docs/spec',
  'apps',
  'packages',
  'crates',
  'services',
  'scripts',
];

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
    if (KEEP.some((k) => p === k || p.startsWith(`${k}/`))) {
      throw new Error(`refusing to remove protected path: ${p}`);
    }
  };

  const tracked = TRACKED_STALE.filter(existsSync);
  const caches = CACHE_STALE.filter(existsSync);

  console.log('# Tracked stale (git rm -r — recoverable from history)');
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
        `Note: review other docs/ subfolders (plans, research, launch, etc.) manually — not auto-removed.`,
    );
  }
}

main();
