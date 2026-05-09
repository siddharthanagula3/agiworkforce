# ADR: Foundation-first sprint sequencing

## Status

Accepted — 2026-05-09.

## Context

After the Wave 1–4 work cleared the existing audit P0/P1 list, the road forward had two competing paths:

1. **Feature-first**: ship Pro+ tier, advanced agentic loops, expanded skills, computer-use UX before paying down the implicit-shared-state debt. Faster perceived progress; risks compounding tech debt.
2. **Foundation-first**: pay down the seven primitives identified in the gap matrices (`tasks/research/gap-matrix/*.md`) before any new feature work. Slower perceived progress; reduces future re-work.

The risk of the feature-first path was concrete: every feature already in flight (background agents, Dispatch, multi-surface chat continuity) was stepping on the lack of `AsyncLocalStorage`-style context, the absence of a unified `withRetry`, the per-surface zustand sprawl. New features added on top would either ship broken or themselves need to refactor the primitives later.

## Decision

We sequence foundation primitives before features. The seven Foundation Sprint tasks (1.2 through 1.8) ship first; feature work that builds on them follows. This drives the dependency ordering:

- Tasks 1.4 (queue), 1.5 (context) build on Task 1.3 (state).
- Task 1.7 (worker direction inversion) depends on Task 1.6 (llm-runtime) for retry semantics in poll loops.
- Task 1.2 (dispatch listener) depends on Task 1.5 (context) for per-message tracking.
- Task 1.8 (orphan packages) wires existing packages but assumes Task 1.6 (llm-runtime) for cross-package retry.

The architectural narrative in `docs/architecture/foundation-2026.md` §9 explicitly walks a single send flow that exercises every primitive — the document only exists because the foundation does.

## Consequences

**Positive**

- Future feature PRs are smaller and safer. Background-agent work in Sprint B builds on `AsyncLocalStorage<AgentContext>` instead of inventing per-agent context propagation.
- Cross-surface feature parity is achievable. A new feature added to chat in `packages/unified-chat` automatically benefits from the queue, the watchdog, the retry generator across all six surfaces.
- ADRs (this directory) capture the reasoning at the moment of decision. New engineers do not need to reverse-engineer the trade-offs from code.

**Negative**

- Visible product velocity slowed for the duration of the sprint. Externally, "we shipped seven internal primitives" reads less excitingly than "we shipped Pro+ tier."
- Some features that would have been shipped in this window are deferred to Sprint B and beyond (e.g. expanded compute-use surfaces, marketplace skills curation).
- The cost is recouped only if the primitives are actually used. A feature that bypasses, for example, `appStateStore` in favour of a one-off zustand store erodes the payoff. Mitigated by code-review checklists referencing this directory.

## References

- `docs/architecture/foundation-2026.md` §10 row 3.
- `tasks/research/gap-matrix/*` — gap analysis that produced the seven tasks.
- Wave 5.6 architecture doc commit `ebd6c0c41`.
