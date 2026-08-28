# @agiworkforce/routing

Status: Current
Owner role: Platform lead
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Shared model/provider routing logic for selecting providers, models, fallbacks, and routing metadata.

## Consumers

Web, Desktop, services, provider packages, and shared chat/runtime surfaces.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Routing policy logic.
- Model/provider capability matching.
- Fallback and routing explanation metadata.
- Model-switch prompt-cache consequence assessment.

## What Does Not Belong Here

- Provider SDK clients.
- Billing ledger settlement.
- UI components.
- Hidden Managed gateway defaults.

## Key Files

- `src/index.ts` - public export surface.
- `src/auto.ts` - pure registry-backed route resolver for Auto aliases and
  explicit canonical model selections.
- `src/classify.ts` - local task classifier and conversation-pivot logic.
- `src/model-switch-cache.ts` - pure cache-reset warning policy for model changes.
- `src/pricing.ts` - compatibility pricing and lifecycle helpers.
- `src/task-family.ts` - deterministic structural task-family fast path
  (no prose, no LLM, no network); ambiguous requests decline and fall through.
- `src/task-family-routing.ts` - per-family quality floor plus cost-ranked
  ordering of the already-admitted candidate set, behind an operator flag.
- `src/task-family-continuity.ts` - session stickiness and escalation-only
  switching, built on `assessModelSwitchCache`.
- `src/__tests__/fixtures/task-family-corpus.ts` - the eval-corpus seed
  (12 families x 6 labelled rows plus ambiguous rows).

## Commands

- `pnpm --filter @agiworkforce/routing typecheck`
- `pnpm --filter @agiworkforce/routing test`
- `pnpm --filter @agiworkforce/routing build`

## Environment / Secrets

No secrets belong in this package.

`AGI_ROUTING_TASK_FAMILY_STAGE` is the only environment variable this package
reads. It is an operator-only server flag, **off unless set to exactly `1`**,
and it gates the task-family ordering stage. Off is the honest default: turning
it on changes which model a request lands on, and the shadow-mode evidence that
would justify that change (a CPST baseline per family, a measured router
decision latency, a written list of shadow/live disagreements) does not exist
yet. See `docs/architecture/execution-plan-contract.md` Section 5.

## Security, Privacy, Data Boundaries

Security/privacy review is required for Local/BYOK/Managed routing, fallback behavior, provider labels, cost-sensitive routing, and any logic that could send data to a provider unexpectedly.

## Tests Required For Changes

Add tests for routing decisions, fallbacks, privacy-mode blocks, and cost/capability changes.

## Release / Deployment Notes

Routing changes are user-trust sensitive. Surface routing explanations should stay aligned.

## Known Caveats

Managed gateway paths must remain explicitly labeled and consented.
`resolveAutoRoute` is the canonical policy resolver for both Auto aliases and
explicit canonical selections; the name remains for compatibility while
application call sites and the Rust Desktop/CLI resolver migrate from legacy
`@agiworkforce/types#resolveAutoModeModel` and provider task maps. Dynamic
host-discovered Local/BYOK models remain runtime-admitted because they cannot
be enumerated in the static registry. Harness-dependent tasks fail closed
until their feature is marked implemented in the registry.

The task-family stage exists in TypeScript only. The Rust resolver
(`crates/agiworkforce-model-registry/src/lib.rs`) has already diverged from this
one, and which of the two is canonical is design-doc open question **OQ-1**,
still undecided. Rust adoption of the task-family stage follows OQ-1; do not
port it before that question is answered, because doing so doubles the
divergence surface. The stage's curated policy
(`auto.taskFamilies` in `packages/ai/model-registry/catalog/routing-policies.json`)
is compiled into the shared registry and is simply ignored by the Rust
deserializer today.

Benchmark-based quality floors are supported by the schema but no seeded family
uses one: benchmark coverage in the registry is partial, and the floor is
fail-closed, so a benchmark floor would exclude every model with no recorded
score - including the models most Auto slots point at.

Nothing here ranks candidates by benchmark score or by model freshness, and no
product surface may describe Auto as benchmark-aware, benchmark-learning, or
freshness-aware routing. `auto.tasks.<task>.benchmarkWeights` in
`packages/ai/model-registry/catalog/routing-policies.json` is inert metadata:
the schema requires the key, the compiler copies it into the shared registry and
its two generated Rust mirrors, but the `AutoTaskPolicy` interface in
`src/auto.ts` does not declare the field and no TypeScript or Rust reader ever
dereferences it. Slot order comes from `preferredSlots` plus the cost-ranked
task-family stage, nothing else. The catalog's per-model `knowledgeCutoff` and
`released` values are display/curation metadata that this package never reads,
so recency of a model's training data is not a routing input. The one recency
signal that does route is a property of the _prompt_, not the model:
`src/classify.ts` sends research-shaped requests to search-capable models.

## CODEOWNERS

Primary: Platform lead. Secondary: provider/platform and security/privacy for provider-mode behavior.
