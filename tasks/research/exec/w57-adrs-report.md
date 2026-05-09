# Wave 5.7 — 17 ADRs — report

**Branch**: `task-w57-adrs`
**Owner**: `docs-engineer@agi-foundation-integration`
**Date**: 2026-05-09
**Status**: completed

## Deliverable

- 17 ADR files at `docs/decisions/2026-05-09-{slug}.md`.
- 1 index at `docs/decisions/README.md`.
- All in Michael Nygard format: Title / Status / Context / Decision / Consequences (+ References).

## ADR list

### Architectural (12)

| #   | Slug                                                   | Source task        |
| --- | ------------------------------------------------------ | ------------------ |
| 1   | `2026-05-09-bridge-over-rewrite-store-migration.md`    | 1.3                |
| 2   | `2026-05-09-depth-counter-circularity.md`              | 1.3                |
| 3   | `2026-05-09-onchange-fires-before-listeners.md`        | 1.3                |
| 4   | `2026-05-09-per-surface-queue-factory.md`              | 1.4                |
| 5   | `2026-05-09-dispatch-two-layer-dedup.md`               | 1.2                |
| 6   | `2026-05-09-dispatch-supabase-rpc-injection.md`        | 1.2                |
| 7   | `2026-05-09-sticky-retry-context.md`                   | 1.6                |
| 8   | `2026-05-09-stream-watchdog-promise-race.md`           | 1.6                |
| 9   | `2026-05-09-worksecret-codec-in-types.md`              | 1.7                |
| 10  | `2026-05-09-per-endpoint-auth-ladder.md`               | 1.7                |
| 11  | `2026-05-09-try-with-rust-context.md`                  | 1.5                |
| 12  | `2026-05-09-zoom-unsupported-until-tabs-permission.md` | 1.8 (browser-tool) |

### Strategic (5)

| #   | Slug                                                  |
| --- | ----------------------------------------------------- |
| 13  | `2026-05-09-strategic-maximalist-surface-coverage.md` |
| 14  | `2026-05-09-strategic-3-vm-parallel.md`               |
| 15  | `2026-05-09-strategic-foundation-first-sprint.md`     |
| 16  | `2026-05-09-strategic-both-equal-customer-focus.md`   |
| 17  | `2026-05-09-strategic-acquisition-optionality.md`     |

## Format compliance

Each ADR has:

- `# ADR: <title>`
- `## Status` — Accepted with date 2026-05-09.
- `## Context` — what motivated the decision; alternatives considered.
- `## Decision` — what we decided.
- `## Consequences` — Positive bullets, Negative bullets (with mitigations).
- `## References` — links to architecture doc sections, source files, source reports.

## Cross-references

ADRs reference back to the Wave 5.6 architecture doc (`docs/architecture/foundation-2026.md`) by section number, and back to the source Foundation Sprint reports (`tasks/research/exec/1.{2,3,4,5,6,7,8}-report.md`) where relevant. The strategic ADRs cross-reference each other (e.g. acquisition-optionality references worksecret-codec-in-types and dispatch-supabase-rpc-injection as architectural consequences).

## Strategic decisions sourcing

The 5 strategic decisions are not on disk in `tasks/research/strategic-decisions-2026-05-09.md` (verified as missing in the Wave 5.6 report). The team config `agi-foundation-integration` description enumerates them by name. ADRs 13–17 capture each one with full Context / Decision / Consequences treatment based on how each shapes the Foundation Sprint architecture; the canonical strategic-decisions file, if and when it lands, should be referenced by these ADRs as a primary source.

## Verification

- File count: 17 ADRs + 1 README = 18 files in `docs/decisions/`.
- All files use the same date prefix `2026-05-09-`.
- Index at `docs/decisions/README.md` lists all 17 with one-line summaries.
- Each ADR cites at least one source file or report.
- No emojis in any file (per project preferences).
- Conventional Commits used for the commit landing this work.

## Branch

`task-w57-adrs` off `main` at `a0a4baf82`. Working tree contains store-migration-engineer's WIP from a stash that was popped accidentally during Wave 5.6 cherry-pick; that WIP is unrelated to this PR and is being staged separately by them. My commit stages only `docs/decisions/` and this report.

## Next

Wave 5.7 complete. Both Wave 5.6 and 5.7 deliverables now landed on their dedicated branches (`task-w56-foundation-arch-doc` and `task-w57-adrs`). Going idle per teammate prompt.
