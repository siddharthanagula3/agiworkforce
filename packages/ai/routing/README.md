# @agiworkforce/routing

Status: Current
Owner role: Platform lead
Last updated: 2026-09-04
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
  explicit canonical model selections. `previewAutoRoute` explains a decision
  (every ranked candidate, its admission, score factors and reasons) with zero
  upstream calls; it calls `resolveAutoRoute` for `selected` and shares its
  ranking helpers for `candidates`, so the preview can never name a different
  winner than the real decision would reach.
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

Every environment variable this package reads is operator-only, server-side,
and safe to leave unset: each one falls back to a documented default in code,
and an unparseable value keeps that default rather than disabling the thing it
tunes. `apps/web/.env.example` carries the same list with its defaults.

Three are boolean stage flags, **off unless set to exactly `1`**:

- `AGI_ROUTING_TASK_FAMILY_STAGE` gates the task-family ordering stage. Off is
  the honest default: turning it on changes which model a request lands on, and
  the shadow-mode evidence that would justify that change (a CPST baseline per
  family, a measured router decision latency, a written list of shadow/live
  disagreements) does not exist yet. See
  `docs/architecture/execution-plan-contract.md` Section 5.
- `AGI_ROUTING_OBSERVED_HEALTH` gates observed-health ranking, which reorders
  already-admitted routes by measured failure rate and time to first token.
- `AGI_ROUTING_CANARY` gates shadow mirroring and canary serving.

The rest are windows and thresholds for `route-health-store.ts` and
`capability-health.ts`, one group per scope, all documented at their
definitions:

- Provider breaker: `AGI_ROUTE_HEALTH_WINDOW_MS`,
  `AGI_ROUTE_HEALTH_TRIP_WINDOW_MS`, and the five
  `AGI_ROUTE_BREAKER_*` thresholds.
- Model lockout: `AGI_MODEL_LOCKOUT_WINDOW_MS`,
  `AGI_MODEL_LOCKOUT_TRIP_WINDOW_MS`, and the five other
  `AGI_MODEL_LOCKOUT_*` thresholds.
- Credential cooldown: the seven `AGI_CREDENTIAL_COOLDOWN_*` values.
- Capability health: `AGI_CAPABILITY_HEALTH_WINDOW_MS` and
  `AGI_CAPABILITY_HEALTH_MISS_THRESHOLD`.

Nothing here reads a secret, and no secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for Local/BYOK/Managed routing, fallback behavior, provider labels, cost-sensitive routing, and any logic that could send data to a provider unexpectedly.

## Tests Required For Changes

Add tests for routing decisions, fallbacks, privacy-mode blocks, and cost/capability changes.

## Release / Deployment Notes

Routing changes are user-trust sensitive. Surface routing explanations should stay aligned.

## Failover plan and live health

`resolveAutoRoute` returns a primary route plus a fallback plan of at most
four entries, one provider each: the selected model's other providers first,
then other models drawn from a ladder that never widens admission (the
request's own slot ordering, the task's slots at every other profile in policy
order, the policy fallback slot, then the tier's allowed slots in authored
order). Every entry still passes the same tier, lifecycle, harness, trust-mode
and capability gates as the primary. Before 2026-09-04 an economy-profile task
on a paid tier had no fallback at all, so one provider outage failed every
simple chat; the ladder is what gives it another provider. The Rust resolver
mirrors the ladder and the cap, and the conformance fixture pins both.

When the caller passes `runtimeState` or `availableProviderIds`, a slot whose
best route is parked (circuit open, provider unhealthy) or has no managed
credential yields to the next dispatchable slot, walking the same ladder, and
the parked routes move to the end of the plan; the decision then carries
`reason: 'health_fallback'`. If every candidate is parked the first parked
model is still selected rather than stranding the request. Without live state
the walk is unchanged, which is why the fixture never sets it.

`capability-health.ts` learns something the compiled catalog cannot: whether a
route still HONOURS a capability it declares. The catalog flag is set at compile
time and the liveness probe (`scripts/probe-models.mjs`) sends no tools, so a
model that quietly stops honouring tool calls degraded every session until a
person edited the catalog. The serving path now records one observation per
finished turn against the route it served, honoured or missed, in its own
keyspace over the same `KeyValueStore` port the route health store uses;
`AGI_CAPABILITY_HEALTH_WINDOW_MS` and `AGI_CAPABILITY_HEALTH_MISS_THRESHOLD`
tune it, and a route is suspect only while the misses in the window have reached
the threshold and its most recent turn is still a miss, so one honoured turn
brings it back. Only model facts count: a required tool the model never called,
and tool arguments that are not JSON. A sandbox that would not start, our own
per-turn tool budgets, and a repeated search query are ours, not the model's,
and are excluded by name. This is a ranking input and never an admission one:
the declared flag still decides what may serve a request, a suspect route is
still selected when it is the only one, and the observation is kept out of the
`route` scope precisely so it cannot park anything or dilute the outcome rates
every non-tool request reads. `scripts/probe-models.mjs --tools` is the cheap
second signal, asking each answering route one trivial tool and reporting
whether it was honoured; it writes the probe file only, never the store.

Model continuity (`currentModelKey` and `previousTaskType`) is implemented
here and in Rust but deliberately not wired from the web request processor:
after a transient outage it would pin a conversation to the failover model,
which is usually the pricier one, for the rest of the conversation. Route
affinity (`preferredRouteId`) covers the prompt-cache case within one model.

The classifier's bare prose words for coding (`class`, `import`,
`undefined`) return a weak 0.6 confidence: they cannot pivot a running
conversation, and the web layer routes a weakly classified premium-profile
task at the balanced profile instead.

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
