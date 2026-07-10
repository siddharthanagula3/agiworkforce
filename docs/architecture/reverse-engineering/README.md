# AGI Workforce — Reverse-Engineering & Architecture Documentation

Status: Current
Owner: Platform lead
Last updated: 2026-07-10

## Purpose

This doc set lets an engineer fully understand the AGI Workforce architecture **without reading the implementation first**. It is a reverse-engineering map: it describes how the six surfaces, two runtimes, three trust boundaries, shared TypeScript packages, and shared Rust crates fit together, how a chat request flows end to end, how streaming and sync work, and which load-bearing design decisions constrain everything else.

It is a deliverable of the `docs/current/agi-parity-master-plan.md` wave queue (item 8). It is **descriptive documentation only** — it changes no product code. Where a capability is in progress or is a tracked gap, the relevant file says so and cites `docs/agent-context/known-flaws.md` or `docs/current/parity-implementation-matrix.md`.

## How to read this

Start at area 1 (platform architecture) for the big picture, then 2 (shared packages) for the "single source of truth" map, then 3–4 (runtime + streaming) for the hot path. Areas 5–8 cover data/sync, state, platform adapters, and the UI/design system. Areas 9–10 cover competitor mapping and the rationale behind the load-bearing choices.

## Contents

| #   | File                                                                           | Area                                                                                                                               | Coverage                                                                 |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | [01-platform-architecture.md](./01-platform-architecture.md)                   | Six surfaces, two runtimes, three trust boundaries, capability-first design, dependency graph                                      | Fully documented                                                         |
| 2   | [02-shared-packages.md](./02-shared-packages.md)                               | Every shared TS package + Rust crate: what it owns and who consumes it (SSOT map)                                                  | Fully documented                                                         |
| 3   | [03-ai-runtime-and-routing.md](./03-ai-runtime-and-routing.md)                 | Chat request flow, provider adapters, v1 byte-stable contract, tool-loop, MCP approve→resume, model-id resolution, cost accounting | Fully documented (desktop Rust decode path partly live-gated)            |
| 4   | [04-streaming.md](./04-streaming.md)                                           | SSE framing, StreamChunk variants, message lifecycle, artifact live-streaming, tool audit-trail collapse                           | Fully documented; message-lifecycle enum unification flagged in-progress |
| 5   | [05-data-and-sync.md](./05-data-and-sync.md)                                   | cloud-contracts Zod schemas, sync-apply cross-language fixtures, Neon RLS, delta-sync (0038)                                       | Fully documented; gateway RLS gap flagged                                |
| 6   | [06-state-management.md](./06-state-management.md)                             | Store layer per surface, shared vs per-app stores                                                                                  | Fully documented                                                         |
| 7   | [07-platform-adapters.md](./07-platform-adapters.md)                           | Where platform-specific code legitimately lives (Tauri/Expo/VS Code/Chrome/CLI) vs shared logic                                    | Fully documented                                                         |
| 8   | [08-ui-design-system.md](./08-ui-design-system.md)                             | `@agiworkforce/ui`, design-tokens, unified-chat components, settings modal shell, marketing system                                 | Fully documented; residual per-surface primitive forks flagged           |
| 9   | [09-reverse-engineering-notes.md](./09-reverse-engineering-notes.md)           | How the product maps to ChatGPT/Claude patterns; what is at parity vs in progress                                                  | Documented; parity status is a moving target — cites the matrix          |
| 10  | [10-design-decisions.md](./10-design-decisions.md)                             | Load-bearing choices + rationale, cross-referencing decision logs                                                                  | Fully documented                                                         |
| 11  | [11-capability-parity-matrix.md](./11-capability-parity-matrix.md)             | Per-capability reverse-engineered → our implementation → parity status (done/partial/gap) for the master-plan capability list      | Fully documented; statuses honestly downgraded where flagged             |
| 12  | [12-user-flows-screens-interaction.md](./12-user-flows-screens-interaction.md) | Screens, user flows, layout system, interaction patterns — reverse-engineered from claude.ai/ChatGPT → our routes/components       | Fully documented; per-surface parity flagged                             |

## Canonical upstream sources

This doc set synthesizes and cross-references (it does not replace) the canonical docs. When they disagree, the canonical source wins:

- `AGENTS.md` — tool-neutral agent entry point, repo map, non-negotiables.
- `docs/current/source-of-truth.md` — compact product source of truth.
- `docs/current/technical-architecture.md` — monorepo shape, data ownership, provider strategy.
- `docs/current/parity-implementation-matrix.md` — feature-by-feature parity status.
- `docs/current/agi-parity-master-plan.md` — active governing spec.
- `docs/architecture/shared-packages-decision-log.md` — package consolidation adjudication.
- `docs/plans/monorepo-restructure-2026-07-08.md` + `docs/plans/rust-engine-extraction-2026-07-09.md` — executing restructure plans (P0–P6).
- `docs/agent-context/repo-map.json`, `docs/agent-context/known-flaws.md`.
- `docs/research/claudeai-component-spec-2026-07-10.md` + the live audits under `docs/research/`.

## Verification note

Facts here were read from the repository at branch `chore/repo-restructure-2026-07` (tip contains master-plan commit `929d13f93`). Package names, `exports` maps, crate names, and the v1 route dispatch table were read directly from `package.json`, `Cargo.toml`, and source. Parity/status labels are cited from the matrix and known-flaws ledger and will drift as waves land — re-verify against those two files before treating any status as current.
