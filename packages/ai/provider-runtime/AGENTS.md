# Provider Runtime Agent Rules

Status: Current
Owner: Provider/platform owner
Last updated: 2026-07-16

Read root `AGENTS.md`, then this file, then this file.

## Scope

`packages/ai/provider-runtime` owns provider-independent LLM runtime abstractions —
streaming/event normalization and AGI-owned tool-loop scaffolding — consumed
by provider packages, services, Web, and Desktop. Renamed from
`llm-runtime` to `provider-runtime` in the W4 T-wave (DM #10 rename
confirmed by the founder, executed 2026-07-16).

## Lane Contract

- Primary lane: `provider-routing`.
- Owned write path: `packages/ai/provider-runtime/**`, plus sibling
  `provider-routing` packages (`packages/ai/providers/**`,
  `packages/ai/provider-protocol/**`, `packages/ai/routing/**`, `packages/ai/search/**`)
  when a task assigns them together.
- UI code, vendor SDK clients, billing ledger logic, and app-specific
  request handlers are out of lane (README "What Does Not Belong Here").

## High-Risk Areas

- Runtime changes here can affect every model provider at once; coordinate
  with the provider/platform owner before changing stream/event shapes or
  tool-loop control flow.
- Vendor SDKs may sit behind provider adapters, never inside this package's
  core interfaces — this package is the provider-independent layer the
  adapters normalize into.
- No secrets: provider keys are passed in by callers per provider mode,
  never read or stored here.

## Verification

- `pnpm --filter @agiworkforce/provider-runtime typecheck`
- `pnpm --filter @agiworkforce/provider-runtime test`
- `pnpm --filter @agiworkforce/provider-runtime build`
- Model/routing changes: `scripts/check-no-hardcoded-models.sh`
