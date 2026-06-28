#!/usr/bin/env node
// AGI structure migration — folder-per-tool, step 1 (import-transparent).
//
// Converts flat leaf modules into folders using the language's barrel
// resolution, which is BEHAVIOR-PRESERVING and BUILD-GREEN:
//   Rust:  `mod web;`        resolves `web.rs`  OR `web/mod.rs`  (identical)
//   TS:    `import './web'`  resolves `web.ts`  OR `web/index.ts` (identical)
// So callers never change. This only does the safe move; the higher-value
// internal split (co-locating prompt/validation/UI inside each folder) is a
// guided per-tool follow-up that rides the Tool-trait work (INC-1.2).
//
// SAFE BY DEFAULT: prints the plan and exits. Pass --apply to execute via
// `git mv` (preserves history). Must run in a git + build capable environment
// (this is intentionally NOT runnable from the Cowork sandbox, which blocks
// git writes and file moves).
//
// Usage:
//   node scripts/migrate-structure.mjs            # dry-run (default)
//   node scripts/migrate-structure.mjs --apply    # execute git mv
//   node scripts/migrate-structure.mjs --target apps/cli/src/features/exec/tools

import { readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';

// Targets to migrate. Add more dirs over time (web/desktop tools, commands).
const TARGETS = [
  {
    dir: 'apps/cli/src/features/exec/tools',
    lang: 'rust',
    exclude: ['mod.rs'], // the folder barrel/registry stays
    verify: 'cargo check -p agiworkforce-cli',
  },
];

const BARREL = { rust: 'mod.rs', ts: 'index.ts' };
const LEAF_EXT = { rust: ['.rs'], ts: ['.ts', '.tsx'] };

function planTarget(t) {
  const moves = [];
  if (!existsSync(t.dir)) return { moves, missing: true };
  for (const name of readdirSync(t.dir)) {
    const from = join(t.dir, name);
    if (statSync(from).isDirectory()) continue; // already a folder
    if (t.exclude.includes(name)) continue;
    if (!LEAF_EXT[t.lang].includes(extname(name))) continue;
    if (name === BARREL[t.lang]) continue;
    const stem = basename(name, extname(name));
    const to = join(t.dir, stem, BARREL[t.lang]);
    if (existsSync(join(t.dir, stem))) {
      moves.push({ from, to, skip: 'folder already exists' });
    } else {
      moves.push({ from, to });
    }
  }
  return { moves, missing: false };
}

function gitMv(from, to) {
  const dir = to.slice(0, to.lastIndexOf('/'));
  execFileSync('mkdir', ['-p', dir]);
  execFileSync('git', ['mv', from, to]);
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const targetArg = args.includes('--target') ? args[args.indexOf('--target') + 1] : null;
  const targets = targetArg ? TARGETS.filter((t) => t.dir === targetArg) : TARGETS;

  let planned = 0;
  let done = 0;
  for (const t of targets) {
    const { moves, missing } = planTarget(t);
    if (missing) {
      console.warn(`⚠ target not found: ${t.dir}`);
      continue;
    }
    console.log(`\n# ${t.dir}  (${t.lang})`);
    for (const m of moves) {
      if (m.skip) {
        console.log(`  skip  ${m.from}  (${m.skip})`);
        continue;
      }
      planned++;
      if (apply) {
        gitMv(m.from, m.to);
        done++;
        console.log(`  moved ${m.from} -> ${m.to}`);
      } else {
        console.log(`  git mv ${m.from} ${m.to}`);
      }
    }
    console.log(`  verify: ${t.verify}`);
  }

  if (apply) {
    console.log(`\n✓ moved ${done} module(s). Now run each target's verify command, then commit.`);
  } else {
    console.log(
      `\n${planned} planned move(s). Re-run with --apply in a git+build env, then run the verify command(s) and commit.\n` +
        `Each move is import-transparent (barrel resolution), so callers are unchanged.`,
    );
  }
}

main();
