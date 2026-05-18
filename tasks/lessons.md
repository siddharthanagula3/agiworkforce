# Lessons Learned

## 2026-05-06: Full codebase audit

### Lesson 1: Agents checking a single file miss distributed patterns

The VS Code audit agent counted only `registerCommand` calls in `extension.ts` and declared 48 ghost commands. Reality: commands are registered in `errorExplainerProvider.ts`, `terminalProvider.ts`, `tokenCounter.ts`, `desktopBridge.ts`, `subsystemHealth.ts`. Always grep the entire `src/` not just the main entry file.

### Lesson 2: Canonical migrations can be incomplete even when they reference tables

`supabase/migrations/20260505000006` referenced `processed_stripe_events` with INSERT and ALTER TABLE but never created it. The CREATE TABLE was only in the legacy `apps/web/supabase/migrations/` path. Any migration that does DML on a table must own or guard-create that table.

### Lesson 3: Sentinel constants that can never match are silent failures

`FAST_STATUS_MODEL = "__sentinel_fast_status__"` at chatwidget.rs:346 — the condition `model == FAST_STATUS_MODEL` was always false. No compiler warning, no test failure, no runtime error — just a feature that never worked. When removing a hardcoded string, replace it with the actual check (provider-based), not a sentinel.

### Lesson 4: "Dead code" directories may still supply live types

`UnifiedAgenticChat/` directory was flagged as dead because the main component was replaced by `ChatInterface`. But `CommandPalette`, `SearchModal`, `KeyboardShortcutsOverlay`, `ToolLabel` inside the same directory were still imported by App.tsx, KeybindingsSettings, and stores. Always check `grep -rn "ComponentDir/"` before deleting a whole directory.

### Lesson 5: False alarm classification requires deeper verification

Initial P0-2 (48 ghost commands) was wrong. Before marking something P0, always verify by running the test or doing a wider grep. The lesson: don't trust agent findings without spot-checking the claim against the actual code.

## 2026-05-18: Root-level reference docs need post-launch review

### Lesson 6: Three large root-level docs predate the reference-index reorg

At the time the mobile-pilot reorg branch was created, three large untracked-or-tracked files sit at repo root:
- `REFERENCE_INDEX.md` (~230 KB)
- `REFERENCE_STRUCTURE.md` (~16 KB)
- `MASTER_PLAN.md` (~205 KB)

These were left untouched by the One-Source Reorg Phase 3 (mobile pilot, per founder directive on 2026-05-18). They are likely superseded by the new `reference-index/` tree + `docs/PRD.md` V5 but a careful diff is needed before deletion or relocation.

**Action item for post-launch (post-2026-08-16):** read the three files end-to-end, diff them against:
- `reference-index/README.md` (new)
- `reference-index/mobile-code-index.json` (new)
- `docs/PRD.md` V5
- `AGI_WORKFORCE.md`

Then either: (a) archive to `_archive/`, (b) merge unique content into the canonical sources, or (c) delete. Do not touch during the launch crunch — too many engineers may still be referencing them.
