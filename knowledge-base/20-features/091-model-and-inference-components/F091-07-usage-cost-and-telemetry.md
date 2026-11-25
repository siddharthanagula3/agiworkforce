---
id: "F091-07"
type: "feature"
title: "Usage, cost and telemetry"
aliases: ["Usage extraction", "Inference telemetry", "Usage accumulator", "CPST usage fields", "Routing decision trace", "S91.16", "S91.31", "Managed usage ledger"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.16", "S91.31"]
depends_on: ["surface:web", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "SYS-inference-providers", "table:managed_usage_requests", "table:routing_decision_traces", "table:provider_cost_events", "file:apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-07 Usage, cost and telemetry

On the web Cloud chat endpoint, the server reads token counts (input, output, cache, reasoning) from each provider stream, prices them, settles the managed usage reservation, and writes spans, metrics and a routing trace with route, latency, cost and outcome. A failed call is settled at zero cost but still records its outcome. Server-side only.

Area: [91. Model and inference components](README.md). Requirement items: [S91.16](../../10-requirements/capabilities/091-model-and-inference-components.md#s9116), [S91.31](../../10-requirements/capabilities/091-model-and-inference-components.md#s9131).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collects usage numbers from every provider response on the web Cloud chat endpoint, turns them into a billed cost and a provider cost, settles the usage reservation, and emits telemetry (spans, metrics, a routing-decision trace row) naming model, provider, route, latency and outcome. (apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts:28; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:334; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:44)

**Why it exists.** Cloud (managed) inference is billed and capped, so every call needs exact usage; operators also need to see which route served a turn and whether it failed. The brief requires usage numbers on every call and an outcome even on failure. (doc: knowledge-base/data/area-briefs/091-model-and-inference-components.md S91.16, S91.31)

**Who uses it.** The billing and quota system uses the numbers to settle reservations; operators read costs, routing and rollout views; engineers read spans and logs. People see their own usage only through account or plan meters, which this brief did not read.

**Problems it solves**

- Charging the wrong amount: tokens, cache reads and writes, reasoning tokens and provider-reported cost all feed the price (apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts:5-17).
- Double billing after a crash: the reservation is marked 'provider started' before the provider call, and an expired lease is refunded as 'outcome_unknown' (apps/web/app/api/llm/v1/chat/completions/route.ts:533; apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:9).
- Not knowing why a turn failed or which route served it: spans, a trace row and a turn-outcome metric carry route, provider, model and error code (apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:44,126).

**Use cases**

- A user sends a chat turn in Cloud mode; the stream ends with a usage chunk; the server prices it and settles the reservation.
- A user presses Stop mid-answer; the turn is still billed on estimated tokens if any text was delivered (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:107-165).
- An operator opens the Costs tab and explains one request: served route, fallback, cost, cache tokens (apps/web/features/admin/components/OperatorCostsPanel.tsx:230).

## 2. User experience

**Where to find it**

- Web: no person-facing screen in this feature. Operators: admin dashboard tabs 'costs', 'routing' and 'rollout' (apps/web/features/admin/pages/OperatorDashboardPage.tsx:38-60); the Costs panel has the headings 'Cost breakdown, last 24 hours' and 'Explain one request' (apps/web/features/admin/components/OperatorCostsPanel.tsx:230).
- Desktop, Mobile, CLI, VS Code, Chrome: nothing found in this feature; these apps send chat to the web endpoint in Cloud mode [inferred]; Local and own-key paths were not read, so unknown.

**Before you start**

- Cloud mode (managed) on the web chat endpoint; the code throws 'billing_protocol_error' if a managed turn has no reservation (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:313-318).
- Operator views need a platform admin (requirePlatformAdmin) (apps/web/app/api/admin/observability/route.ts:33).

**Screens and controls**

- Costs panel: dimension tabs route, model, user, tenant; table columns Requests, Cache hit, Actual, Retail, Value, Fallbacks, p50 / p95 (apps/web/features/admin/components/OperatorCostsPanel.tsx:230-262).
- Explain form: fields 'Account id' and 'Idempotency key', button 'Explain' (apps/web/features/admin/components/OperatorCostsPanel.tsx:290-310).

**Journey**

1. A person sends a Cloud turn (not visible to them as telemetry).
2. Server reserves usage, then marks provider started, then calls the provider.
3. Stream usage chunks are folded into one accumulator.
4. On finish the server prices the usage and settles the reservation as completed or failed.
5. Telemetry rows and spans are written; an operator later reads them in the admin Costs or Routing tabs.

**What the person sees and gets**

- Operator: tables, 'Reading the breakdown…' spinner, error 'Could not load the cost breakdown.', empty text 'No provider cost event was recorded in the last 24 hours…' (apps/web/features/admin/components/OperatorCostsPanel.tsx:195-228).
- Person: a quota warning header may be sent when credits run low (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6190).

**Settings**

- No user setting found for this feature. Server settings names only: AGI_ROUTING_TRACE_RETENTION_DAYS, AGI_ROUTING_TRACE_RETENTION_BATCH (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:27-28).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Usage accumulator keeps the highest input and output counts and the last cache, reasoning and provider-reported cost values (apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts:28-62).
- Non-stream and stream paths both settle the managed reservation with token, cache, reasoning and server-tool usage (apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:143; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:334).
- Provider-reported cost is used only if within a 0.1x to 10x band of the catalog estimate (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:210-218).
- Failed attempts are settled at zero cost with the outcome and error class (apps/web/app/api/llm/v1/chat/completions/route.ts:212-223).
- A client Stop with delivered text is settled as completed on estimated tokens (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:134-165).
- Provider-started mark is persisted before the provider loop; failure to mark refunds and returns an error (apps/web/app/api/llm/v1/chat/completions/route.ts:526-553).
- Routing decision trace row written fire-and-forget, then completed with outcome, error_code, ttft, duration, cost (apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:44,126).
- Spans via withSpan with domain 'model', redaction, OTel bridge and metrics (apps/web/lib/observability/span.ts:76; apps/web/app/api/llm/v1/chat/completions/route.ts:1465).
- Stage-0 CPST fields (task outcome, retries, fallback, route plan id, task family) added to the settlement usage (apps/web/lib/cpst-telemetry.ts:52).

**Incomplete**

- CPST verifier result is always 'skipped' and task outcome is never 'success' (only 'abandoned', 'failure' or 'unknown') (apps/web/lib/cpst-telemetry.ts:35-42,57).
- The successful non-stream trace outcome is persisted without ttft, duration or cost (apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:266).

**Present but disconnected or switched off**

- Trace pending-map is in process memory, bounded to 2,000 entries; an outcome for an evicted or other-instance decision is skipped (apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:98,170).

**Not available**

- No per-app status in the brief; Desktop, Mobile, CLI, VS Code and Chrome usage telemetry for Local and own-key modes was not read: unknown.

## 4. Required behaviour

**Established requirements**

- Token usage (input, output, cache, reasoning) is extracted from each provider response. (source: S91.16)
- Each inference emits telemetry (spans, usage, cost, route, latency, outcome). (source: S91.31)
- A failed call must still record its outcome. (source: S91.31 (brief 'Should' for F091-07))
- Managed usage is marked started before the provider call so a crash cannot double-bill. (source: S91.31 / apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:9)

**Acceptance criteria**

1. A completed Cloud turn leaves a managed usage row with input, output, cache and reasoning counts and a cost.
2. A provider error before output leaves the reservation released at zero cost with the error class recorded.
3. A turn stopped by the client after text was delivered is billed (not refunded).
4. A routing_decision_traces row exists for the request id with kind 'served' and a final outcome.
5. Killing the server after the provider-started mark leaves the row in provider_started and a later recovery refunds it as outcome_unknown; the same idempotency key cannot start a second provider call.
6. The Costs panel shows the request's route, fallback flag, actual cost and cache tokens.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Telemetry write failures must never fail or delay the turn (apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:164 comment states this) [inferred as requirement].
- Names of provider and model in spans are redacted of secrets before leaving the process [inferred from redactAttributes in span.ts].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record ttft, duration and cost on the successful non-stream trace outcome too.
- [proposed] Persist the pending-trace map or reconcile uncompleted traces so multi-instance deployments do not lose outcomes.
- [proposed] Produce a 'success' task outcome and a real verifier result once a verifier seam exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Usage accumulator | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts` | Folds provider usage chunks into one set of counts. |
| service | Stream settlement | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Resolves billed outcome, prices usage, settles reservation on streams. |
| service | Non-stream response builder | `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts` | Same settlement for non-stream replies, plus trace outcome. |
| endpoint | Chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Marks provider started, refunds failed reservations, wraps the turn in a span. |
| service | Request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reserves managed usage and persists the routing decision. |
| service | Managed usage request service | `apps/web/lib/services/managed-usage-request-service.ts` | reserve, mark started, finalize, idempotency and lease handling. |
| schema | Managed usage lifecycle migration | `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql` | Statuses reserved, provider_started, completed, released, outcome_unknown and recovery functions. |
| service | CPST telemetry | `apps/web/lib/cpst-telemetry.ts` | Builds task outcome, fallback and route-plan fields for the settlement. |
| service | Span helper | `apps/web/lib/observability/span.ts` | withSpan: trace context, redaction, metrics, logs, error on refusal. |
| service | Metrics | `apps/web/lib/observability/metrics.ts` | recordTurnOutcome, recordRoutingDecision, recordSpanMetrics. |
| service | Routing decision trace service | `apps/web/lib/services/model-rollout/routing-decision-trace-service.ts` | Writes and completes routing_decision_traces rows. |
| table | routing_decision_traces | `apps/web/db/neon/0212_routing_decision_traces.sql` | Per-turn route, cohort, outcome, error code, latency, cost. |
| table | managed_usage_requests | `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql` | Reservation and settlement ledger per request. |
| table | provider_cost_events | `apps/web/db/neon/0180_provider_cost_events_customer_and_cogs_split.sql` | Provider cost events with cache units, read by operator breakdown. |
| service | Route and cache observability | `apps/web/lib/services/route-cache-observability-service.ts` | Breakdown by route, model, user, tenant and per-request explain. |
| endpoint | Admin observability | `apps/web/app/api/admin/observability/route.ts` | GET breakdown; platform admin and rate limit. |
| endpoint | Admin explain | `apps/web/app/api/admin/observability/explain/route.ts` | GET one request explanation. |
| component | OperatorCostsPanel | `apps/web/features/admin/components/OperatorCostsPanel.tsx` | Operator Costs tab UI. |
| component | OperatorDashboardPage | `apps/web/features/admin/pages/OperatorDashboardPage.tsx` | Hosts the admin tabs. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Request admitted; managed usage is reserved with an idempotency key (the request id), estimated cost and a lease. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6148 |
| Routing decision is persisted as a trace row (non-blocking). | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4864 |
| Reservation marked provider_started before the provider call; on failure the reservation is refunded and an error returned. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:533 |
| Provider call; stream chunks of type 'usage' fold into the accumulator. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:657 |
| Settlement: price tokens, server tools and cost source; finalize reservation as completed or failed. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:334 |
| Trace outcome and turn metric recorded; delivery marker set for non-failed turns. | our servers | apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:126; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:362 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Managed usage request row (tokens, cache, reasoning, cost, status, attempt outcome, error class) | table managed_usage_requests (Neon Postgres) | server only | retention rule not read: unknown |
| Routing decision trace (route, provider, model key, cohort, outcome, error code, ttft, duration, cost, prompt stamps) | table routing_decision_traces | server only | purged by the hourly rollout cron after the retention window (default 30 days); account erasure deletes the subject's rows (apps/web/db/neon/0212_routing_decision_traces.sql:25-27; apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:34) |
| Provider cost event with cache read/write units | table provider_cost_events | server only | unknown |
| Span log lines and metrics | logs and the OpenTelemetry collector | server only | unknown |

**Models and providers.** The usage chunk comes from whichever provider adapter served the turn; fields vary per provider (cache write 1h, reasoning, reported cost, search and code-execution counts are optional) (apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts:5-17). Pricing comes from the catalog via LLMCostCalculator (apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:115).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account needed for managed Cloud turns; operator views need a platform admin (apps/web/app/api/admin/observability/route.ts:33). |
| Permissions | Admin endpoints require requirePlatformAdmin and the 'admin-operator' rate limit (apps/web/app/api/admin/observability/route.ts:30-33). |
| Subscription | This feature is the metering side of the subscription: plan tier, credits and quota features are passed to the reservation (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6148-6170). Per-plan rules are owned by SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Reservation lease defaults to 900 seconds, bounded 60 to 3600 in the database function (apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:130). Pending trace map limit 2,000 (apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:98). |
| Feature flags | Flag variants are stored on the trace row (flag_variants) and joined into the cohort label (apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:105). No flag turns this feature off: none found in the code. |
| Model compatibility | Optional usage fields (reasoning, cache write 1h, fast speed, server tools) depend on what the provider reports; missing fields stay undefined. |
| Provider restrictions | Free trial and free lane turns settle through a separate path (settleFreeTrialRequest) (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:262). |
| Local mode | Not read for Desktop or Mobile local inference; this web pipeline does not run on the device. Whether Local turns record any usage on the device: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Provider error before output | Reservation released at zero cost; attempt outcome 'failed' with error class recorded. | apps/web/app/api/llm/v1/chat/completions/route.ts:212-223 |
| Client cancel after output | Settled as completed using estimated prompt tokens and delivered text. | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:134-165 |
| Cancel with nothing delivered | Observed counts kept; refunded in full. | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:149 |
| Settlement write fails after a failure | Logged as 'managed_chat_release_unrecorded'; user response not changed. | apps/web/app/api/llm/v1/chat/completions/route.ts:226-235 |
| Same idempotency key replayed | 409 idempotency_in_progress, idempotency_replay or idempotency_conflict. | apps/web/lib/services/managed-usage-request-service.ts:404-422 |
| Lease expired then turn delivered anyway | Late settlement records the cost so the provider is not paid for free. | apps/web/lib/services/managed-usage-request-service.ts:1077-1090 |
| Trace write fails | Warning '[routing-trace] decision was not persisted'; the turn continues. | apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:170 |
| Provider-reported cost outside sanity band | Ignored with a warning; estimate used. | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:296 |
| Offline or reconnect on device apps | not handled in this feature; client behaviour not read. | No code for this feature exists on the device apps as far as searched (apps/web only). |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.test.ts`: Usage accumulator behaviour.
- `apps/web/lib/__tests__/cpst-telemetry.test.ts`: CPST fields.
- `apps/web/lib/services/model-rollout/__tests__/routing-decision-trace.test.ts`: Routing trace record and outcome.
- `apps/web/lib/services/__tests__/managed-usage-lifecycle.invariants.test.ts`: Managed usage lifecycle rules.
- `apps/web/lib/services/__tests__/managed-usage-idempotency.test.ts`: Idempotency on reservation.
- `apps/web/lib/services/__tests__/managed-usage-request-service.provider-cost.test.ts`: Provider cost on finalization.
- `apps/web/app/api/admin/observability/route.test.ts`: Admin observability endpoint.
- `apps/web/features/admin/components/OperatorCostsPanel.test.tsx`: Costs panel UI.
- `apps/web/lib/observability/__tests__/refusal-and-turn-call-sites.test.ts`: Span and turn call sites.

**Test scenarios**

- **Completed stream is billed**
  1. Send a Cloud turn to a test account
  2. Wait for the stream to end
  3. Query managed_usage_requests for the request id
  - Expected: Status completed, token counts and cost set, cost source recorded.
- **Provider failure**
  1. Force the provider to error before any token
  2. Check the response and managed_usage_requests
  - Expected: Status released, cost 0, error class stored, trace outcome 'failed' with error_code.
- **Stop mid-answer**
  1. Start a long answer
  2. Stop after some text
  3. Check settlement
  - Expected: Completed with non-zero estimated tokens and cost.
- **Crash after provider start**
  1. Reserve and mark started in a test database
  2. Let the lease expire
  3. Run recovery
  - Expected: Row becomes outcome_unknown and the reservation is refunded once; a retry with the same key is refused.
- **Operator explain**
  1. Open the admin Costs tab
  2. Enter the account id and idempotency key
  3. Press Explain
  - Expected: Served route, fallback, status, cost and cache tokens shown.

**Where to look when it fails**

- Log 'span <name> failed' and event 'span' lines (apps/web/lib/observability/span.ts:128-146).
- Log 'managed_chat_release_unrecorded', '[routing-trace] decision was not persisted', 'Ignored provider-reported cost outside the catalog sanity band'.
- Tables managed_usage_requests, routing_decision_traces, provider_cost_events.
- Error codes billing_unavailable, billing_protocol_error, billing_state_conflict, idempotency_*.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **CPST outcome never reports success and verifier result is always skipped.** Affects: Operators on web Cloud. Evidence: apps/web/lib/cpst-telemetry.ts:35-42. Work needed: Add a success signal and a verifier seam.
- **Successful non-stream trace outcome has no latency or cost.** Affects: Rollout evaluation (cost and latency alerts) for non-stream turns. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:266. Work needed: Pass ttft, duration and cost to persistRoutingDecisionOutcome.
- **Pending trace state is per-process memory.** Affects: Multi-instance web deployments. Evidence: apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:98. Work needed: Make completion not depend on process memory.
- **Telemetry for Local and own-key modes and the five non-web apps is not part of this feature as found.** Affects: Desktop, Mobile, CLI, VS Code, Chrome. Evidence: Not read. Work needed: Establish what each app records and where.

**Depends on**

- surface:web
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- SYS-inference-providers
- table:managed_usage_requests
- table:routing_decision_traces
- table:provider_cost_events
- file:apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts

## Unknown

- Usage and telemetry for Local mode on Desktop and Mobile, and for own-key mode on any app.
- Retention of managed_usage_requests, provider_cost_events and span logs.
- Where the person-facing usage meters read these numbers (not read).
- Whether the OTel collector is configured in production.
