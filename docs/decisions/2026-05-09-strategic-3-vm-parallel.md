# ADR: 3-VM parallel build for Foundation Sprint

## Status

Accepted — 2026-05-09.

## Context

The Foundation Sprint had seven substantive tasks (1.2 through 1.8) plus one prep task (1.1). Sequentially, that is 7+ working days assuming no rework. The sprint window was tight (Wave 2–4 plus integration), and the risk of any single task slipping was high because each touched a different surface or layer.

Three execution patterns were considered:

1. **Single-engineer, sequential**: 7 tasks × ~1 day each = ~7 days. Lowest-risk for code conflicts but slow and bottlenecked on one engineer.
2. **Single-engineer, time-multiplexed**: same engineer rotates between branches. Realistic but yields slower per-task progress.
3. **Multi-VM parallel**: each task gets its own branch and execution context (a worktree or a separate VM). Tasks run concurrently; integration happens in a merge train at the end.

Option 3 carries merge-conflict risk: seven branches diverging from the same base will collide on shared files (e.g. `pnpm-lock.yaml`, `apps/desktop/package.json`, root `tsconfig.base.json`).

## Decision

We adopt the 3-VM parallel pattern. Three execution contexts (worktrees or VMs) run concurrently. The seven sprint branches are created up front:

- `task-1.1-stripe-migrations-staging`
- `task-1.2-dispatch-listener`
- `task-1.3-createstore-onchange`
- `task-1.4-messagequeue` (off `task-1.3-createstore-onchange`)
- `task-1.5-async-context`
- `task-1.6-llm-runtime`
- `task-1.7-services-inversion`
- `task-1.8-orphan-wiring`

The merge train is a separate Wave 5.5 task that rebases each branch onto main in dependency order with CI green at each step.

To minimise conflicts:

- Tasks deliberately touch disjoint paths where possible (1.2 → desktop services, 1.4 → packages/runtime/queue, 1.7 → services/api-gateway/worker, 1.8 → cross-surface adapters).
- Cross-cutting changes to `pnpm-lock.yaml` are accepted as "regenerate at merge time."
- Branch 1.4 is explicitly off 1.3 because the queue is built on top of `createStore`. Other dependencies are noted in task descriptions.

## Consequences

**Positive**

- Sprint completes in roughly 1 day of wall-clock, not 7. Foundation primitives land before any feature work that depends on them.
- Code review can happen per branch, in parallel. Reviewers do not wait on a single PR.
- A failing branch (e.g. unforeseen Tauri API change in 1.5) does not block the others.
- The `try_with` over `with` decision in §4 (ADR `2026-05-09-try-with-rust-context.md`) traces directly to needing incremental adoption across parallel branches.

**Negative**

- Merge conflicts during Wave 5.5 are real. Lockfile regeneration is the most common conflict; small surface-level imports occasionally collide. Mitigated by sequential rebase order in Wave 5.5.
- Cross-task coordination requires explicit task descriptions and an integration team (this team, `agi-foundation-integration`). Wave 5.1 surfaces the missing migrations from 1.7; Wave 5.2 verifies the package.json from 1.6 is correct. Without the explicit Wave 5 backstop, late-discovered gaps would block the merge train.
- Engineers running parallel work need clear scope boundaries. Two branches modifying the same file is the failure mode; we mitigate by review of branch task descriptions before kickoff.

## References

- `docs/architecture/foundation-2026.md` §10 row 2.
- Team config `agi-foundation-integration` description listing the 7 sprint branches.
- Wave 5.5 — `task-w55-merge-train` (forthcoming).
