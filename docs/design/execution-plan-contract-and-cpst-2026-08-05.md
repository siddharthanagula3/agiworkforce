# ExecutionPlan Contract And Cost-Per-Successful-Task (CPST)

Status: Draft — design spec, nothing implemented
Owner: Platform lead
Last updated: 2026-08-05

Design spec for (a) a single `ExecutionPlan` value that names every knob a
request is executed with, expressed as an extension of the routing types that
already exist, and (b) `CPST`, the metric that decides whether a routing change
was worth making. It also fixes the staged rollout and the gates.

This document changes no code. Every statement about current behaviour is
anchored to a file and, where useful, a line. Everything not proven by a repo
file is in "Open Questions" and is marked unknown — it is never asserted.

## 1. Why This Exists

Today the router answers one question — _which model_ — and answers it well.
Everything else that determines what a request costs and whether it succeeds
(reasoning effort, service tier, tool bundle, retrieval, caching, retries,
verification, escalation) is decided somewhere else, is not recorded, and is
therefore not optimisable. We can see spend per model. We cannot see spend per
_finished task_, so we cannot tell an expensive route that works from a cheap
route that fails twice and then escalates.

Two consequences:

1. **Model choice is being tuned against the wrong objective.** Cost-per-token
   and cost-per-request both reward a cheap route that quietly fails. Only
   cost-per-**successful**-task rewards the route that finishes the job.
2. **Provider price moves cannot be absorbed.** A curated price is a single
   number in one file; when it moves, the only lever we have today is to
   re-point a slot at a different model by hand. With an `ExecutionPlan` the
   same move can be absorbed by effort, tier, cache, or verifier changes that
   do not degrade the product.

Motivating example (dated, and the only market datum in this document):
a provider price step-up for Claude Sonnet 5 dated **2026-09-01** was cited in
the brief that commissioned this design. **No repo file records that change.**
What the repo does record is the current curated price for `claude-sonnet-5` in
`packages/ai/model-registry/catalog/models.curation.json` — `costOverride`
`inputCost: 3`, `outputCost: 15`, `cached_input: 0.3` — in USD per 1M tokens
(the per-million divisor is applied in
`apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`). Treat the 2026-09-01
step-up as **unverified** until a curation update lands. Repo docs must not
carry a market price table; the curation catalog is the only place a price
belongs.

## 2. What Exists Today

### 2.1 Two resolvers, one policy source

The Auto policy is authored once and compiled, then consumed by two independent
resolver implementations:

- **Curation source:** `packages/ai/model-registry/catalog/routing-policies.json`
  (`schemaVersion: 1`) and `packages/ai/model-registry/catalog/harnesses.json`
  (`schemaVersion: 1`). These are the only hand-edited inputs.
- **Codegen:** `pnpm sync:models` runs
  `packages/ai/model-registry/scripts/compile.mjs`, producing
  `packages/ai/model-registry/generated/registry.json` /`registry.ts` and the
  Rust-embedded registry under
  `crates/agiworkforce-model-registry/src/generated/`. **Generated outputs are
  never hand-edited.** Any field this document proposes lands in the curation
  JSON and its schema, then regenerates.
- **Rust resolver:** `crates/agiworkforce-model-registry/src/lib.rs` —
  `AutoRoutingRequest` (line 112), `evaluate_eligibility` (line 458),
  `resolve_auto_route` (line 718), `build_provider_fallbacks` (line 656).
- **TypeScript resolver:** `packages/ai/routing/src/auto.ts` —
  `AutoRoutingRequest` (line 105), `SelectedAutoRoute` (line 166),
  `resolveAutoRoute`.

**The two resolvers have already diverged.** The TS request carries
`budgetRemainingCents`, `estimatedInputTokens`, `estimatedOutputTokens`,
`capabilityDocument`, `capabilityRequirements`, and
`fallbackToAutoForCapabilityMismatch`; the Rust request carries none of those.
`UnavailableAutoRoute` in TS has eight codes, the Rust `UnavailableCode` has
six. Any `ExecutionPlan` work must either land in both or explicitly nominate
one as canonical — see Open Question OQ-1.

### 2.2 Desktop router

`apps/desktop/src-tauri/src/core/llm/llm_router.rs` is the live desktop router:

- `RoutingStrategy` (line 257): `Auto`, `AutoEconomy`, `AutoBalanced`,
  `AutoPremium`, `CostOptimized`, `LatencyOptimized`, `LocalFirst`.
- `RouterPreferences` (line 271): `provider`, `model`, `strategy`, `context`,
  `prefer_cloud_credits`, legacy `local_only` / `managed_cloud_only`, and the
  canonical `trust_mode`.
- `effective_trust_mode` (line 319) fails closed to `TrustMode::Local` when
  `trust_mode` is unset — the documented fix for a prior bug where unthreaded
  call sites reached BYOK/managed cloud by omission.
- `candidates()` (line 953) is the single assembly chokepoint and re-filters
  every path by trust mode at the end.
- `auto_policy_candidate()` (line 1731) is the bridge into the canonical
  resolver; when the resolver returns `Unavailable` it returns an **empty**
  candidate list rather than fabricating a fallback.

`RouterContext` (line 365) also carries advisory, unvalidated free-form fields —
`suggested_tool_categories`, `auto_execute_tools`, `routing_reason`,
`confidence` — that nothing enforces. These are the closest thing we have to a
tool bundle and an approval policy today, and they are the wrong shape.

Note a naming collision worth not tripping on: `apps/cli/src/routing/strategy.rs`
defines an unrelated CLI-local `RoutingStrategy` trait. It is compiled and
re-exported from `apps/cli/src/routing/mod.rs` but has no call sites — parked,
not deleted. It is **not** the desktop enum and must not be conflated with it.

### 2.3 Classification and continuity

`packages/ai/routing/src/classify.ts` provides `classifyTaskLocally` (heuristic,
returns one of the canonical 11 `RoutingTaskType` values with a confidence) and
`applyConversationContext` (a 5-turn sticky pivot over recent task types).
`packages/ai/routing/src/model-switch-cache.ts` provides `assessModelSwitchCache`,
which is already the cross-surface truth that switching model mid-conversation is
a guaranteed prompt-cache miss. `routing-policies.json` `auto.continuity` already
sets `preserveExplicitSelection`, `preferCurrentModelWhenEligible`,
`preferCurrentRouteForCache`, and `reevaluateOnTaskChange` all to `true`.

Session stickiness is therefore **already policy**; what is missing is that
nothing measures whether honouring it or breaking it was the cheaper choice.

### 2.4 Managed-usage ledger

`public.managed_usage_requests`, created in
`apps/web/db/neon/0056_managed_usage_request_lifecycle.sql` (columns from line 13)
and extended by `apps/web/db/neon/0066_managed_usage_rolling_caps.sql`, is the
only durable per-request cost ledger in the repo. It carries
`estimated_cost_cents`, `actual_cost_cents`, a lifecycle `status`, and a free-form
`usage jsonb not null default '{}'::jsonb` column.

Service layer: `apps/web/lib/services/managed-usage-request-service.ts`
(`reserveManagedUsageRequest`, `finalizeManagedUsageRequest`) and
`apps/web/lib/services/managed-usage-accounting-service.ts`
(`finalizeObservedManagedUsage`, which writes `accounting`, `reason`,
`providerCalls`, `totalTokens` and the observed token counters into the `usage`
jsonb). That jsonb is the existing, already-used, no-migration channel for
accounting metadata.

Everything else is narrower: `apps/web/app/api/usage/route.ts` returns only
aggregate percentages; `apps/web/lib/cost-tracker.ts` is an in-memory span-attribute
tracker that resets on cold start and is not wired to the ledger;
`apps/desktop/src-tauri/src/core/llm/daily_budget.rs` is a per-day spend cap in
local SQLite with no per-request granularity.

## 3. The ExecutionPlan Contract

`ExecutionPlan` is the **resolved, immutable record of how one task attempt will
be executed**. It is an _output_ of admission, never an input that can widen it:
a plan can never grant a trust mode, tier, or capability that
`evaluate_eligibility` did not already grant. It is produced next to
`SelectedAutoRoute`, carried with the request, and echoed into telemetry.

Field-by-field mapping. "Exists" means the value is already computed somewhere;
"New" means nothing in the repo produces it.

| #   | Field               | Status today                   | Existing anchor                                                                                                                                                                                                                                                                                                                                                                                                                          | Where the new part lives                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `modelSnapshot`     | Partial                        | `SelectedAutoRoute.model_key` / `provider_model_id` / `route_id` (lib.rs:175; auto.ts:166); slots pin a `modelKey` in `routing-policies.json`                                                                                                                                                                                                                                                                                            | Add `registryRevision` to the plan. **No anchor exists**: `generated/registry.json` carries only `schemaVersion: 1` — no content hash, no `generatedAt`. `compile.mjs` must emit one. See OQ-2.                                                                                                                                                                                                                                                                                            |
| 2   | `providerEndpoint`  | Exists                         | `SelectedAutoRoute.harness_id` + `harnesses.json` `provider` / `apiFamily` / `adapter`                                                                                                                                                                                                                                                                                                                                                   | No new field. The plan records `harnessId`; base URLs and credentials stay adapter-owned and **must not** be put in the plan.                                                                                                                                                                                                                                                                                                                                                              |
| 3   | `reasoningEffort`   | Data exists, not routed        | Per-model `reasoning` block in `models.curation.json` (`control`, `supportedEfforts`, `defaultEffort`, `canDisableThinking`, `request.effortPath`)                                                                                                                                                                                                                                                                                       | New policy: `auto.tasks.<task>.reasoningEffort.{economy,balanced,premium}` in `routing-policies.json`. Validated against the selected model's `supportedEfforts` inside `evaluate_eligibility` — an unsupported effort makes the candidate ineligible, it does not silently downgrade.                                                                                                                                                                                                     |
| 4   | `serviceTier`       | Fragmented                     | `ServiceTier { Fast, Flex }` in `crates/agiworkforce-protocol/src/config_types.rs:357`; OpenAI adapter accepts `'auto' \| 'default' \| 'flex'` in `packages/ai/providers/openai/src/types.ts:90`; Anthropic gating in `packages/ai/provider-protocol/src/anthropic-payload-policy.ts` (`allowsServiceTier`, `serviceTier`)                                                                                                               | New: one vocabulary `standard \| flex \| priority \| batch`, declared per harness in `harnesses.json` under the **existing** `features.<name>.{providerSupport,implementation}` shape as `features.serviceTier`. A tier that is not `implemented` on the chosen harness is not selectable. **`batch` is out of scope for the first slice** — it implies an async submit/poll lifecycle no adapter has. The `Fast`/`priority` naming collision must be resolved before either ships (OQ-3). |
| 5   | `executionLocation` | **Exists and is enforced**     | `TrustMode {Local, OnDevice, Byok, ManagedCloud}` (lib.rs); `RouterPreferences.trust_mode` (llm_router.rs:271); `effective_trust_mode` fail-closed (llm_router.rs:319); `provider_matches_trust_mode` (llm_router.rs:289); route-level `trustModes` and the 14 `runtimeProfiles` in `harnesses.json`                                                                                                                                     | No new field and **no new authority**. The plan records the `{trustMode, runtimeProfileId}` pair that admission already resolved. This is the one field the plan is forbidden to influence.                                                                                                                                                                                                                                                                                                |
| 6   | `harnessVersion`    | Missing                        | `harnessId` exists; `harnesses.json` has top-level `schemaVersion` and per-harness `adapter` (a workspace package name)                                                                                                                                                                                                                                                                                                                  | New: `{harnessId, adapterPackage, adapterVersion, catalogSchemaVersion}`. Weak today — every first-party adapter package is version `0.0.1` — so it is only meaningful once adapters are versioned or `compile.mjs` emits a content hash (same fix as OQ-2).                                                                                                                                                                                                                               |
| 7   | `toolBundle`        | Advisory only                  | `RouterContext.suggested_tool_categories` / `auto_execute_tools` (llm_router.rs:365) are free-form and unvalidated. The only **validated** tool-ish gate is `auto.tasks.<task>.requiredHarnessFeatures` checked against `harnesses.json` `features` (`webSearch`, `webSearchInjection`, `toolDiscovery`, …)                                                                                                                              | New: named, versioned bundles in `routing-policies.json` (`auto.toolBundles.<id> = {tools: [...], version}`), referenced per task and profile. The plan carries the bundle id **and** the resolved tool list. `suggested_tool_categories` is deprecated by this, not extended.                                                                                                                                                                                                             |
| 8   | `retrievalPolicy`   | Missing at routing level       | Project knowledge exists as a desktop-local feature (`apps/desktop/src-tauri/src/features/projects/knowledge.rs`); nothing routes on it                                                                                                                                                                                                                                                                                                  | New: `{mode: none\|project\|workspace\|web, maxChunks, maxTokens, sources[]}` declared per task in `routing-policies.json`. **Hard constraint:** retrieval sources are trust-mode scoped and enforced at the same gate as route eligibility — a `Local` plan may not name a managed source, and retrieved content stays data, never instructions.                                                                                                                                          |
| 9   | `cachePolicy`       | Partial, real                  | `packages/ai/provider-protocol/src/anthropic-payload-policy.ts` (`cacheRetention: 'short'\|'long'\|'none'`, `enableCacheControl`, base-URL gating); cache token accounting (`cacheReadTokens`, `cacheWriteTokens`, `cacheWrite1hTokens`) in `apps/web/lib/services/managed-usage-accounting-service.ts`; `assessModelSwitchCache` in `packages/ai/routing/src/model-switch-cache.ts`; `auto.continuity.preferCurrentRouteForCache: true` | New on the plan: `{enable, retention, breakpoints}`, sourced from the per-harness feature plus a per-task policy. The router must treat a plan change that resets the cache as a **cost event**, priced via `assessModelSwitchCache`, not as free.                                                                                                                                                                                                                                         |
| 10  | `verifier`          | **Nothing exists**             | Confirmed absent: no verifier, judge, or grading concept in the routing or usage paths                                                                                                                                                                                                                                                                                                                                                   | Fully new: `{kind: none\|deterministic\|model\|hybrid, id, budgetCents, onFail: retry\|escalate\|fail}`, declared in a new `auto.verifiers` block and referenced per task family. Verifier cost is variable cost and counts in CPST. Execution seam is undecided (OQ-4).                                                                                                                                                                                                                   |
| 11  | `fallbackPolicy`    | Ladder exists, policy does not | `build_provider_fallbacks` (lib.rs:656) yields distinct-provider fallbacks; `SelectedAutoRoute.fallbacks` carries them; explicit selections deliberately get none; desktop `candidates()` builds its own ordered list (llm_router.rs:953); web computes a budget-driven cheaper-model swap producing `fallbackReason` (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1953`)                                         | New: `{maxAttempts, ladder: [routeId…], escalateOnly: bool, triggers: [provider_error\|timeout\|verifier_fail\|budget]}`. The existing `fallbacks[]` becomes the resolved ladder; **when** to walk it is the new part. `escalateOnly: true` is the default for the router work in §5 — a switch may only move up the ladder, never sideways.                                                                                                                                               |
| 12  | `budget`            | Two disconnected halves        | TS-only `budgetRemainingCents` affordability **bias** (`packages/ai/routing/src/auto.ts`, called from `request-processor.ts:1725`); the hard limit is the reservation in `managed_usage_requests`; desktop has only a daily cap (`daily_budget.rs`). The Rust `AutoRoutingRequest` has no budget field at all                                                                                                                            | New on the plan: `{perTaskCents, remainingCents, hardStop}`. The plan records **what the router assumed**. The durable reservation stays the only hard limit — the plan never becomes a second gate, and the workhorse fallback slot stays un-budget-filtered as it is today.                                                                                                                                                                                                              |
| 13  | `approvalPolicy`    | Advisory only                  | `RouterContext.auto_execute_tools` (llm_router.rs:365) is the only hook, and it is unvalidated                                                                                                                                                                                                                                                                                                                                           | New: `{autoExecuteTools, requireApprovalFor: […], escalationRequiresApproval}`. Must satisfy the standing rule that destructive, external, privileged, or expensive agent actions require explicit approval. Which surfaces already render an approval UI is **not verified here** (OQ-5).                                                                                                                                                                                                 |

### 3.1 Placement summary

- **Curation JSON** (`routing-policies.json`, `harnesses.json`) gains:
  `reasoningEffort` per task/profile, `features.serviceTier` per harness,
  `toolBundles`, `retrievalPolicy` per task, `cachePolicy` per task/harness,
  `verifiers`, `fallbackPolicy` per task, `approvalPolicy` per task. Each needs a
  schema addition in `packages/ai/model-registry/scripts/compile.mjs` and a
  `schemaVersion` bump; then `pnpm sync:models` regenerates.
- **Resolver request types** (`AutoRoutingRequest`, both languages) gain only what
  the caller genuinely knows and the policy cannot: `budgetRemainingCents`
  (already TS-only), `approvalContext`, and the session's `currentPlanId` for
  stickiness.
- **Resolver output** (`SelectedAutoRoute`, both languages) gains `plan:
ExecutionPlan` and `planId`.
- **Desktop `RouterPreferences`** gains nothing. `RoutingStrategy`,
  `trust_mode`, and `RouterContext` stay as they are; the plan is returned
  alongside `RouteCandidate`, not folded into preferences.

### 3.2 Invariants

1. A plan never widens admission. Trust mode, runtime profile, tier ceiling,
   lifecycle, harness allow-list, and capability checks all run first; the plan
   describes the survivor.
2. A plan is immutable per attempt. A retry or a fallback produces a **new**
   plan with a new `planId` and the same `routePlanId` lineage — that is what
   makes retries countable.
3. A plan is fully serialisable and contains no secrets, no base URLs, no
   credentials, and no user content.
4. Absent policy is not permissive. An unknown `serviceTier`, an unsupported
   `reasoningEffort`, or a `verifier` whose id does not resolve makes the
   candidate ineligible — it never silently falls through to a default.

## 4. CPST — Cost Per Successful Task

### 4.1 Definition

For a window `W` and a task family `F`:

```
CPST(F, W) =
    ( Σ attempt_cost + Σ tool_cost + Σ verifier_cost + Σ retry_cost + Σ fallback_cost )
    ------------------------------------------------------------------------------------
                    count( tasks in F, W where task_outcome = 'success' )
```

- The numerator is **all variable cost incurred in the window**, including the
  cost of attempts on tasks that never succeeded. Failed work is not free and is
  not excluded.
- `retry_cost` and `fallback_cost` are not separate ledgers; they are the
  attempt/tool/verifier cost of attempts whose plan lineage marks them as a
  retry or a fallback. They are broken out so the ratio is inspectable.
- The denominator counts **tasks**, not requests. One task may span many billed
  requests (the agentic tool loop already models this via
  `managed_usage_request_extensions` and `operation_key`).
- Cache-reset cost is real numerator cost: a mid-task model switch re-bills the
  whole prefix at full input price (`assessModelSwitchCache`).
- CPST is only comparable **within** a task family. A global CPST number is a
  vanity metric and must not be used as a gate.

### 4.2 Required telemetry fields

Six fields, plus the cost fields the ledger already has.

**Naming rule.** The `usage jsonb` payload today uses camelCase keys
(`accounting`, `reason`, `providerCalls`, `totalTokens`, and the spread
`inputTokens`/`outputTokens`/`cacheReadTokens`/…). Promoted SQL columns in
`apps/web/db/neon/` use snake_case. So each field has both spellings and they
are not interchangeable.

**Collision warning.** `outcome` is already taken. `finalizeManagedUsageRequest`
takes `outcome: 'completed' | 'failed'` and the row has `status`, both of which
describe the **charge**, not the task. The task-success field must therefore be
named `task_outcome` / `taskOutcome`. Reusing `outcome` would silently conflate
"we billed it" with "it worked".

| Field (jsonb key) | Promoted column   | Type / vocabulary                                                 | Source today                                                                                                                                                                                                                                                              | Wiring required                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskOutcome`     | `task_outcome`    | `success \| failure \| abandoned \| unknown`                      | **Nothing produces it.** The nearest value is the billing `outcome`, which is not task success                                                                                                                                                                            | New. Set at the same finalize call site; `unknown` is a first-class value and must not be coerced to `success`                                                                                                                                                                                                                                                                |
| `retries`         | `retries`         | integer ≥ 0                                                       | **Absent.** "Retry" in the SQL/services means idempotency-key replay or `credit_settlement_jobs.attempts`, i.e. settlement retries, never model attempts                                                                                                                  | New counter incremented per additional attempt within one task; per-attempt rows already have a home in `managed_usage_request_extensions.operation_key` if row-level audit is needed                                                                                                                                                                                         |
| `fallbackUsed`    | `fallback_used`   | boolean, plus `fallbackReason` string                             | **The value already exists in memory** as `fallbackReason` in `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` (lines 1953, 2278, 2553) and is returned in the HTTP response — but it is never passed to reserve or finalize, so it is never persisted | Pass it into the `usage` object at the existing call sites (`reserveManagedUsageRequest` at line 2307, and the matching `finalizeObservedManagedUsage`)                                                                                                                                                                                                                       |
| `verifierResult`  | `verifier_result` | `pass \| fail \| skipped \| unavailable`                          | **Nothing exists.** No verifier concept anywhere                                                                                                                                                                                                                          | New; blocked on the verifier seam (OQ-4). Until then it is always `skipped` and must be recorded as such rather than omitted                                                                                                                                                                                                                                                  |
| `routePlanId`     | `route_plan_id`   | opaque string                                                     | `routeDecision` (`harnessId`, `code`, `modelKey`, `provider`) is computed at `request-processor.ts:1720` and used only to pick provider/model; nothing persists an identifier                                                                                             | New; derived from the `ExecutionPlan` (§3). AMENDED 2026-08-05 (implementation finding): `code` exists only on `UnavailableAutoRoute`, which 422s before any reservation exists and can never reach finalize — the shipped interim id is `interim:<harnessId>:<routeId>:<reason>` from `SelectedAutoRoute`, self-labelled `interim:` so no consumer mistakes it for a plan id |
| `taskFamily`      | `task_family`     | the canonical 11-value `RoutingTaskType`, narrowed further per §6 | `classifyTaskLocally` (`packages/ai/routing/src/classify.ts`) already produces a `RoutingTaskType` + confidence, and `resolvedTaskType` is already computed on the web path                                                                                               | Persist the already-computed value; also persist the classifier confidence so low-confidence rows can be excluded from gates                                                                                                                                                                                                                                                  |

### 4.3 Where these land

**Phase 1 — no migration.** All six go into the existing
`usage jsonb` on `public.managed_usage_requests`, via the `usage` argument of
`finalizeManagedUsageRequest`. This is exactly the pattern
`finalizeObservedManagedUsage` already uses for `accounting` / `reason` /
`providerCalls` / `totalTokens`. The column has no schema enforcement, so every
consumer must treat the keys as optional and absent-until-backfilled.

**Phase 2 — promote once query patterns stabilise.** A later migration in
`apps/web/db/neon/` promotes the frequently-filtered keys — at minimum
`task_outcome`, `task_family`, `route_plan_id` — to real columns with indexes.
Do not promote on day one; the jsonb shape will change during shadow mode.

**Per-attempt rows.** If a retry needs its own auditable row rather than a
counter, `managed_usage_request_extensions` (added in `0066`) already models
sub-request lifecycle with a per-step `operation_key` and is the right table to
extend.

**Surface coverage is uneven and must be stated honestly.** The ledger is
web/managed-cloud only. Desktop has only `daily_budget.rs` (a daily cap, no
per-request rows); CLI, mobile, and the extensions have nothing. `cost-tracker.ts`
is in-memory and resets on cold start — it is **not** a CPST source. So the first
CPST numbers describe managed cloud only. Extending CPST to desktop BYOK/local
is a separate slice and is not assumed here.

## 5. Staged Rollout

Every stage is gated. No stage starts before the previous stage's exit criteria
are met with recorded evidence.

### Stage 0 — Instrument (no behaviour change)

Land the six telemetry fields in the `usage` jsonb. Persist `fallbackReason`
and the interim route identifier (AMENDED 2026-08-05: `routeDecision.code` is
unavailable-route-only; the shipped value is `interim:<harnessId>:<routeId>:<reason>`
from `SelectedAutoRoute`). Persist the classifier's task type and confidence.
Nothing about routing changes; the only risk surface is the hot
chat-completions path's idempotency and lease contracts, which must not be
altered.

TAXONOMY BRIDGE (2026-08-05): the persisted `task_family` key carries the
canonical 11-value `RoutingTaskType`; the router stage's 12-value `TaskFamily`
(and its quality floors and the §6 corpus) use a different, finer taxonomy that
is computed only when the stage flag is on and is not persisted. The Stage-0
CPST baseline is therefore keyed on `RoutingTaskType`; a written
`RoutingTaskType → TaskFamily` mapping table must accompany Stage 1 so shadow
comparisons and floors join on one taxonomy.

Exit: ≥ 2 weeks of managed-cloud rows carrying all six keys, with a measured
non-null rate per key, and a first CPST baseline per task family. **The baseline
is the number every later gate is compared against — there is no external
benchmark for it.**

### Stage 1 — Shadow mode

Compute the `ExecutionPlan` and the router's preferred route on every request,
record both, and **execute the current route regardless**. Shadow decisions are
log-only and cannot affect billing, trust boundaries, or user-visible model
labels.

Prerequisite (2026-08-05 finding): the stage's `taskFamilyDecision` reason
codes are currently attached to `SelectedAutoRoute` and then dropped — never
logged or persisted. Shadow mode is unimplementable until the decision (family,
reason code, ordering, ladder) is observably recorded per request.

Exit: shadow plan produced for ≥ 95% of eligible requests; measured router
decision latency; a counterfactual CPST estimate per task family; and a written
list of every case where the shadow plan disagreed with the live route in a way
that would have crossed a trust boundary (target: zero, and any non-zero result
blocks Stage 2).

### Stage 2 — Route low-risk, verifiable families first

Enable live routing only for task families that are (a) low blast-radius and
(b) mechanically verifiable, so `verifierResult` is real rather than `skipped`.
Session stickiness stays on (`auto.continuity` is already all-true) and
switching is **escalation-only**: within a session the plan may move up the
ladder but never sideways, because a sideways move buys nothing and pays the
full cache-reset penalty.

Exit: the gates in §5.1 hold for the enabled families over a full window.

### Stage 3 — Widen

Add families one at a time, each with its own baseline and its own gate check.
High-risk families (anything destructive, external, privileged, or expensive)
are last and only behind `approvalPolicy`.

### 5.1 Gates

> **These are internal targets, not market facts, not benchmarks, and not
> claims about any competitor or provider.** None of them is measured in this
> repo today. They are the acceptance thresholds this program proposes, and they
> must be re-derived from Stage 0/1 data before Stage 2 begins. If the measured
> baseline says a target is wrong, change the target and record why — do not
> ship against a number that was guessed.

| Gate                        | Internal target                      | Measured from                                                                                                |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Router decision latency     | p95 ≤ ~100 ms                        | Time inside plan resolution only, excluding provider latency. No repo measurement exists today               |
| Router overhead             | ≤ 1–3% of CPST                       | Verifier + classifier + any router-side model call, divided by CPST for the same family                      |
| Escalation rate             | ≤ 5–10% of tasks                     | Share of tasks whose lineage shows at least one escalation up the fallback ladder                            |
| Quality on routine families | ≥ 98% of the balanced-model baseline | The Stage 0 baseline for that family, measured on the eval corpus (§6), with the balanced profile as control |
| High-risk families          | No regression                        | Same corpus; any statistically meaningful drop blocks the stage outright                                     |

Two ranges above (`1–3%`, `5–10%`) are deliberately ranges. They are the
tolerance band we are willing to argue about, not a precision claim.

### 5.2 Rollback

Every stage is reversible by configuration. Shadow mode is log-only by
construction. Stage 2+ routing is per-task-family and must be disableable per
family without a deploy — NOTE (2026-08-05): only the global
`AGI_ROUTING_TASK_FAMILY_STAGE` kill-switch exists today; building the
per-family gate is a Stage-2 prerequisite, not an optional refinement.
Telemetry stays on through a rollback — the rows are how we find out what went
wrong.

## 6. Eval Corpus

8–12 task families, drawn from and narrowing the canonical 11-value
`RoutingTaskType` taxonomy that `routing-policies.json` already uses
(`simple_chat`, `general`, `coding`, `reasoning`, `creative_writing`,
`multimodal`, `long_context`, `research`, `agentic`, `computer-use`,
`image_generation`). Each family needs:

1. A fixed, versioned set of tasks with deterministic inputs.
2. A grader — deterministic where possible; a model grader only where it is not,
   and its cost counts as router overhead.
3. A recorded balanced-profile baseline (the control for the ≥ 98% gate).
4. A risk label (`low` / `high`) that decides its rollout stage.

There is **no eval corpus and no `evals` directory in the repo today.** This is
net-new work, and the eval corpus is a prerequisite for Stage 2, not a
parallel nice-to-have.

## 7. Non-Goals

- Not a replacement for the trust-boundary model. `ExecutionPlan` is subordinate
  to it.
- Not a change to `RoutingStrategy`, the profile ladder, or slot curation.
- Not a price table. Prices live in
  `packages/ai/model-registry/catalog/models.curation.json` and nowhere else.
- Not a resurrection of `apps/cli/src/routing/strategy.rs`. That parked design
  is out of scope; if it is ever removed, its re-export in
  `apps/cli/src/routing/mod.rs` must be removed in the same change.
- Not a CPST for local or BYOK execution in the first slice — those surfaces
  have no per-request ledger.

## 8. Open Questions

Each of these is genuinely undecided. None should be resolved by assumption.

- **OQ-1 — Which resolver is canonical?** `packages/ai/routing/src/auto.ts` and
  `crates/agiworkforce-model-registry/src/lib.rs` have already diverged (budget
  and capability fields, and eight vs six unavailable codes). Adding
  `ExecutionPlan` to both doubles the divergence surface. Options: designate one
  canonical and have the other call it; generate both from the schema; or accept
  the divergence with a conformance test. Undecided.
- **OQ-2 — What identifies a model snapshot?** `generated/registry.json` exposes
  only `schemaVersion: 1`; there is no content hash, no `generatedAt`, and every
  first-party adapter package is `0.0.1`. Without one of those, `modelSnapshot`
  and `harnessVersion` cannot be pinned. Requires a `compile.mjs` change.
- **OQ-3 — Service-tier vocabulary.** The repo already has
  `ServiceTier { Fast, Flex }` (protocol config), `'auto' | 'default' | 'flex'`
  (OpenAI adapter), and a per-endpoint Anthropic gate. `standard/flex/priority/batch`
  collides with `Fast`. Which vocabulary wins, and who migrates, is undecided.
  Whether any provider we use exposes a batch or priority tier at all is
  **not verified in this repo** and must be confirmed from official provider
  documentation before the field is authored.
- **OQ-4 — Who runs the verifier?** No verifier seam exists. Candidates include
  the web tool loop (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`)
  and the desktop router path, but neither has been designed for it. Until this
  is answered `verifierResult` is always `skipped`.
- **OQ-5 — Approval-policy coverage.** Which surfaces already render an approval
  prompt for destructive/expensive actions was not verified while writing this
  document. Unknown.
- **OQ-6 — Task identity across requests.** CPST's denominator counts tasks, but
  nothing in the ledger groups requests into a task. `managed_usage_request_extensions`
  groups provider steps within one billed request, which is narrower. A task
  identifier is required and its owner is undecided.
- **OQ-7 — The 2026-09-01 Sonnet 5 step-up.** Unverified against any repo file
  (§1). Until a curation update lands, no planning number should depend on it.
- **OQ-8 — Non-managed surfaces.** Desktop BYOK/local, CLI, mobile, and the
  extensions have no per-request cost ledger. Whether CPST extends there, and at
  what privacy cost, is undecided — local execution telemetry touches the
  local-first trust boundary and cannot be added by default.

## 9. Verification For This Document

```bash
pnpm docs:check
pnpm check:llm-operability
```

Both are documentation gates. This document changes no code, so no surface test
applies to it. The code slices it describes each carry their own checks —
`pnpm sync:models` after any curation edit, plus the registry and routing package
tests.
