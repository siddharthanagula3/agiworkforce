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
