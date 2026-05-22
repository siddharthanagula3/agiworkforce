# 2026-05-17 cleanup — restoration map

This archive holds files moved out of the live tree during the 2026-05-17 cleanup pass. Everything here is recoverable with a single `mv` back.

## Why so few files?

The initial survey (3 parallel surveyors) flagged ~13 archive candidates. Citation-grep against `CLAUDE.md`, `AGI_WORKFORCE.md`, `docs/PRD.md`, `docs/PRD-RESOLUTIONS-AND-AUDIT.md`, `docs/PRD-APPENDIX-C-MONOREPO-LAYOUT.md`, `CHANGELOG.md`, `AUDIT_LOG.md`, `MASTER_PLAN.md`, `tasks/todo.md` overturned **10 of 13**. PRD V4 actively cites:

- `tasks/auto-routing-spec.md` — cited 8× in PRD/PRICING/PRD-RESOLUTIONS as canonical pricing spec source
- `tasks/launch-readiness-2026-05-15.md` — cited 5× in AUDIT_LOG/CHANGELOG/MASTER_PLAN/PRD-APPENDIX-C
- `tasks/launch-readiness-wave2-plan.md` — cited 6× across the same docs
- `docs/cli-binary-size-2026-05-15.md` — PRD-RESOLUTIONS-AND-AUDIT marks it "durable infra refs"
- `docs/audit/AUDIT_REPORT_2026-05-01.md` — PRD-RESOLUTIONS-AND-AUDIT.md: "Every audit / security findings doc — keep"
- `docs/audit/FIX_QUEUE.md` — cited 7× across AGI_WORKFORCE/PRICING/README/HANDOFF
- `audit/scan_*.txt` — cited by PRD-RESOLUTIONS for audit closure tracking
- `reports/frontend-parity-r1/` — PRD-RESOLUTIONS: "in-flight Wave 6 input"
- `reports/frontend-reference-comparison/` — cited by CHANGELOG/MASTER_PLAN for active frontend-alignment wave
- `examples/google-batch-api.ts` + `examples/multi-provider-chat.ts` — cited by PRD-APPENDIX-C as named tutorials

The "stale" labels were wrong. PRD V4's Appendix C is the operational layout document for the entire repo — it pins many files we'd otherwise treat as historical. Bottom line: this repo is more disciplined than the surveyors gave it credit for.

## What's archived (3 files, ~211 KB)

| Original path                 | Archive path                                              | Size   | Date       | Why archived                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/cli/src/subagent_v2.rs` | `_archive/2026-05-17-cleanup/apps/cli/src/subagent_v2.rs` | 23 KB  | 2026-05-14 | v1.4 SubagentTaskRunner abstraction; superseded by `apps/cli/src/subagent.rs` which is the live implementation (called by `agent/mod.rs:16`, `agent/chat.rs:475`). Only reference was `lib.rs:43` mod declaration (also removed). |
| `apps/cli/src/tools.rs.bak`   | `_archive/2026-05-17-cleanup/apps/cli/src/tools.rs.bak`   | 141 KB | 2026-05-14 | Backup file. Never compiled (Rust ignores `.bak`). Zero references in any active file.                                                                                                                                            |
| `apps/cli/src/safety.rs.bak`  | `_archive/2026-05-17-cleanup/apps/cli/src/safety.rs.bak`  | 47 KB  | 2026-05-05 | Backup file. Never compiled. Zero references.                                                                                                                                                                                     |

## Code edit also applied

`apps/cli/src/lib.rs:43` — removed `pub mod subagent_v2;` line.

Verification: `cargo check -p agiworkforce-cli` → GREEN in 11.44s.

## How to restore

```bash
cd /Users/siddhartha/Desktop/agiworkforce
# Restore the Rust file
mv _archive/2026-05-17-cleanup/apps/cli/src/subagent_v2.rs apps/cli/src/subagent_v2.rs
# Restore the lib.rs mod declaration (manual edit at line 43)
# Add: pub mod subagent_v2;  between `pub mod subagent;` and `pub mod teams;`

# Restore the .bak files
mv _archive/2026-05-17-cleanup/apps/cli/src/tools.rs.bak apps/cli/src/tools.rs.bak
mv _archive/2026-05-17-cleanup/apps/cli/src/safety.rs.bak apps/cli/src/safety.rs.bak

# Or restore everything
mv _archive/2026-05-17-cleanup/apps/cli/src/* apps/cli/src/
```

## Suggested future cleanup (NOT executed)

These remain in the live tree because they have at least one citation, but the citation may be stale:

1. **`tasks/launch-readiness-2026-05-15.md` + `tasks/launch-readiness-wave2-plan.md`** — purely historical sprint plans. Citations are CHANGELOG/AUDIT_LOG entries describing past waves. They're safe to archive once you confirm no in-flight task references them. Check `tasks/todo.md` first.

2. **`docs/audit/AUDIT_REPORT_2026-05-01.md` + `docs/audit/FIX_QUEUE.md`** — superseded by `AUDIT_2026-05-03.md` per the audit lineage. PRD-RESOLUTIONS-AND-AUDIT says "retain all audit docs" but these are now ~16 days old and largely closed. Archive candidate post-Aug 1 launch.

3. **`docs/planning/cli-modernization-spec.md`** — historical CLI port reference; the port is done.

4. **`docs/launch/wave-3-*.md`** variants — once Wave 3 is fully shipped per the launch dashboard, these are historical.

5. **`apps/cli/src/policy/` directory** — PHASE2 scaffold with no external callers. Keep for now; archive at Sprint B close if `policy` subcommand remains unwired.

## What was kept despite being flagged

- `tasks/auto-routing-spec.md` — actively cited as canonical spec source
- `docs/cli-binary-size-2026-05-15.md` — "durable infra refs" per PRD
- `audit/scan_*.txt` (5 files) — cited for audit closure tracking
- `reports/frontend-parity-r1/` + `reports/frontend-reference-comparison/` — active Wave 6 input
- `examples/google-batch-api.ts` + `examples/multi-provider-chat.ts` + `examples/fullstack-saas/` + `examples/hooks/` — PRD-APPENDIX-C tutorial references
- `tasks/lessons.md` — CLAUDE.md §3.3 self-improvement-loop mandate

## Net impact

- **Files archived:** 3
- **Disk reclaimed (live tree):** ~211 KB
- **Code edits:** 1 line removed (`apps/cli/src/lib.rs:43`)
- **Build status:** GREEN (`cargo check -p agiworkforce-cli` passed in 11.44s)
- **Restoration time if needed:** <30 seconds (one `mv` + one `lib.rs` line)
