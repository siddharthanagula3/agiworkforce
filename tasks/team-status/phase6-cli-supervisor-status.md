# Phase 6 CLI Supervisor Status

Last updated: 2026-05-18

## Branch
`claude/phase6-cli-2026-05-18`
Worktree: `/Users/siddhartha/Desktop/agiworkforce-phase6-cli`

## Commits
1. `c925aecd0` — `refactor(cli): add phase 6 reorg skeleton — features/ platform/ data/ dirs`
2. `ca1220e91` — `refactor(cli): move plan_mode → features/plan/ (pilot migration)`

## Steps completed
- [x] Step 1 — Worktree created from `claude/refine-local-plan-yhjFU`
- [x] Step 2 — Inventory complete (`reference-index/phase6-cli-rust-index.json`, 289 files catalogued)
- [x] Step 3 — Skeleton commit (11 placeholder mod.rs + SHAPE.md + lib.rs declarations)
- [x] Step 4 — Pilot migration: `plan_mode.rs → features/plan/plan_mode.rs`
- [x] Step 5 — Verifier: `--help` shows 22 subcommands, no regressions

## Gate results (post-pilot)
- cargo check: PASS
- cargo clippy --lib -D warnings -D unsafe-code: PASS
- cargo test --lib: 1331 pass / 6 fail (same 6 pre-existing deepseek failures)
- cargo run -- --help: 22 subcommands confirmed

## Pre-existing test failures (not introduced by reorg)
6 tests in output::tests and provider::tests fail due to missing deepseek
model catalog data (deepseek-chat, deepseek-reasoner). Documented at baseline.
These fail on main branch HEAD too.

## Recommended next pilots (3)

### 1. plugins.rs → features/plugins/plan_mode.rs (Priority: HIGH)
- 700 lines, manifest discovery for 5 plugin paths
- Callers: search needed but bounded (plugin subcommand + init)
- Well-bounded: no TUI deps, no async complexity

### 2. hooks.rs → features/hooks/mod.rs (Priority: HIGH)
- 1946 lines, 19 canonical hook events
- Active use in agent/ and repl/ but no circular deps expected
- Run `grep -rn "use.*hooks\|crate::hooks" src/` first to enumerate callers

### 3. policy/ directory → platform/policy/ (Priority: MEDIUM)
- Already a subdir (4 files, ~840 lines)
- macOS/Linux/Windows sandbox policy — stable, rarely touched
- Clean move: git mv entire directory + update lib.rs `pub mod policy`

## STOP criteria (none hit)
- No subcommand contract changes
- No workspace Cargo.toml touched
- No crate rename
- No push
