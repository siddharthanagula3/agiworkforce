---
id: "F091-05"
type: "feature"
title: "Retries, fallback and provider errors"
aliases: ["Provider-error normalization", "Route health monitor", "Fallback coordinator", "Retry management", "Managed failover", "Route breaker", "S91.15, S91.21, S91.22, S91.26"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.15", "S91.21", "S91.22", "S91.26"]
depends_on: ["F091-02", "F091-03", "F091-04", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "mode:cloud", "surface:web", "provider:openrouter", "provider:anthropic"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-05 Retries, fallback and provider errors

When a provider call fails, the error is classified. Safe failures are retried on the same route or moved to another route; some classes never rotate. Outcomes are written to a health store so bad routes are skipped. Failed or refused turns release their usage reservation.

Area: [91. Model and inference components](README.md). Requirement items: [S91.15](../../10-requirements/capabilities/091-model-and-inference-components.md#s9115), [S91.21](../../10-requirements/capabilities/091-model-and-inference-components.md#s9121), [S91.22](../../10-requirements/capabilities/091-model-and-inference-components.md#s9122), [S91.26](../../10-requirements/capabilities/091-model-and-inference-components.md#s9126).

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

**What it does.** Maps provider errors into one category list, retries start-of-stream failures on the same route within a time budget, plans fallbacks, rotates routes in createFailoverPlan, records outcomes to a health store and refunds failed reservations (packages/ai/provider-runtime/src/errors.ts:33, :817; apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:198-239; apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:386; apps/web/app/api/llm/v1/chat/completions/route.ts:195, :363).

**Why it exists.** Providers fail often. People should usually not notice, and a failure must not cost them credits or silently spend more elsewhere.

**Who uses it.** Every chat user (invisible); operators read health and failures.

**Problems it solves**

- Transient 5xx and overloads.
- Rate limits and spent quotas on one key.
- Bad credentials.
- Retrying doomed requests and wasting the turn budget.
- Spending on another paid provider when an account runs out of money.

**Use cases**

- Provider returns an overload at stream start: same route retried after backoff.
- A key is rejected: other routes on that provider are skipped and another provider is tried.
- Auto request fails on a route: next route in the plan serves.
- All routes fail: reservation is released and an error response is returned.

## 2. User experience

**Where to find it**

- No control. Web: a notice when a different model served the answer (FallbackReasonNotice test at apps/web/features/chat/__tests__/FallbackReasonNotice.test.tsx; MessageBubble.tsx:555, :838).
- Mobile: messageFallbackNotice (apps/mobile/src/features/chat/utils/fallbackNotice.ts:28).
- Other apps: unknown.

**Before you start**

- Cloud mode.

**Screens and controls**

- Fallback notice under a message when a backup served it.

**Journey**

1. Person sends a message.
2. First route fails before any text.
3. Server retries or rotates; the person sees a longer wait.
4. Reply arrives, with a notice if another model served it.
5. If all fail, an error appears and usage is released.

**What the person sees and gets**

- Fallback notice from the fallback-reason header (apps/web/lib/chat-fallback-reason.ts; mobile fallbackNotice.ts:9-24).
- Upstream error response built by buildUpstreamErrorResponse (route.ts:1314-1330).

**Settings**

- Operator environment names: AGI_ROUTE_HEALTH_*, AGI_ROUTE_BREAKER_*, AGI_MODEL_LOCKOUT_*, AGI_CREDENTIAL_COOLDOWN_* (packages/ai/routing/src/route-health-store.ts:48-79); AGI_ROUTING_OBSERVED_HEALTH (auto.ts:766).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Classification: categories include aborted, api_timeout, rate_limit, server_overload, context_overflow, auth, billing_exhausted, quota_exhausted, safety, content_blocked, empty_response, connection, server_error, client_error (packages/ai/provider-runtime/src/errors.ts:33-100); an adapter's own classification is read first (:197-210).
- Same-route retry at stream start: 2 attempts, 3 for overload, never for auth or context overflow, Retry-After over the 32s ceiling gives up, all inside the 40s first-token budget (apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:27, :184-239; packages/ai/provider-runtime/src/retry.ts:11-13, :217-235).
- Failover: eligible categories are connection, server_error, server_overload, capacity_off_switch, api_timeout, rate_limit, quota_exhausted, empty_response, unsupported_input; never rotate billing_exhausted, safety, content_blocked (apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:102-146).
- A rejected credential skips the provider's other routes (managed-failover.ts:700-720; packages/ai/provider-runtime/src/failover.ts:25-57).
- Candidates are re-checked at attempt time for plan access, provider availability, breaker, cooldown, training opt-out and context fit (managed-failover.ts:481-575).
- Auto fallback plan: at most 4 routes, up to 2 same-model alternatives first, then other slots (packages/ai/routing/src/auto.ts:757, :764, :1574-1620).
- Pinned model plans hold other routes of the same model only (managed-failover.ts:14-20 comment; auto.ts:1506-1513).
- One Auto-only rotation across paid providers for an unfunded account (managed-failover.ts:171-180).
- Health recording: each attempt failure is written as a route, provider or credential outcome to a key-value store (route.ts:363-387; apps/web/lib/services/free-lane/runtime-state-service.ts:653-760); ranking reads it unless AGI_ROUTING_OBSERVED_HEALTH is off (packages/ai/routing/src/auto.ts:766-770, :937).
- Refund: failed turns settle the reservation as failed with zero cost (route.ts:195-250); a stopped turn with tokens is billed (stream-transform.ts:131-139).

**Incomplete**

- Brief says up to 10 retries with at most 3 for overload and a 32 second cap. The 10-retry loop (withRetry) exists but I found no production caller in apps, packages or services; the chat path uses the 2 and 3 attempt rule instead (packages/ai/provider-runtime/src/retry.ts:9, :77).
- Explicit-model fallback plan has no 4-route cap (auto.ts:1506-1513).
- Only the single-turn stream path was read in detail; tool-loop and research-loop each build their own plan (route.ts:603, :1051).

**Present but disconnected or switched off**

- withRetry in packages/ai/provider-runtime/src/retry.ts: exported, no production caller found (the VS Code extension has its own function of the same name at apps/extension-vscode/src/utils/api.ts:215).

**Not available**

- Retry or fallback in Local mode: unknown.
- Per-app differences: none expected since fallback is on the server.

## 4. Required behaviour

**Established requirements**

- Provider errors are normalised into classified upstream errors. (source: S91.15 Should)
- Route health is observed and fed back into routing. (source: S91.21 Should)
- A fallback coordinator plans and executes provider failover. (source: S91.22 Should)
- Retries are managed with backoff, Retry-After ceilings and per-model same-route retry budgets. (source: S91.26 Should)
- Failed or refused turns release their usage reservation. (source: feature use text; code at route.ts:195-250)
- An agent never destroys user data; failures must not be silent. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A 529 at stream start is retried on the same route and the second attempt's answer is returned.
2. A 401 is not retried on the same route.
3. A Retry-After above 32 seconds ends the retry and lets rotation proceed.
4. An exhausted-balance error never moves a pinned model to another provider.
5. After a rotation, the answer header names the serving model and a fallback reason.
6. After all routes fail, the managed usage reservation is released and the user sees an error.
7. Three consecutive failures on a route make the route breaker skip it for later requests (defaults: 3 consecutive, 50 percent over 5 samples).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The retry caps in the brief (10 and 3) describe withRetry, not the live chat path.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Either wire withRetry into a caller or delete it, and correct the brief.
- [proposed] Cap explicit-model fallback plans at 4.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | classifyError | `packages/ai/provider-runtime/src/errors.ts` | Error categories and classification (:33, :817). |
| service | retry helpers | `packages/ai/provider-runtime/src/retry.ts` | Backoff constants, computeDelay (:225), retryAfterExceedsCeiling (:217), withRetry (:77). |
| service | credential failover | `packages/ai/provider-runtime/src/failover.ts` | CredentialFailoverState (:25). |
| service | same-route retry | `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts` | sameRouteRetryDelayMs (:198) and start with retries (:241). |
| service | managed failover | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | createFailoverPlan (:386), eligible and never-rotate sets (:102, :141). |
| service | fallback plan builder | `packages/ai/routing/src/auto.ts` | buildProviderFallbacks and MAX_FALLBACK_ROUTES (:757, :1574). |
| service | failover plan types | `apps/web/app/api/llm/v1/chat/completions/lib/failover-plan.ts` | FailoverRoute and gateway-backed harness check. |
| service | adapter errors | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-errors.ts` | Error chunk to classified Error, keeps Retry-After (:36-60). |
| service | route health store | `packages/ai/routing/src/route-health-store.ts` | Windows, thresholds, breaker state (:83-101, :528, :756). |
| service | breaker profiles | `packages/ai/routing/src/breaker-profiles.ts` | Category to scope and outcome class (:160, :185). |
| service | runtime state service | `apps/web/lib/services/free-lane/runtime-state-service.ts` | Persists outcomes to the key-value store (:653, :752). |
| service | route breaker | `apps/web/app/api/llm/v1/chat/completions/lib/route-breaker.ts` | Reads breaker state for dispatch. |
| endpoint | chat route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Failover loop (:1254-1330), refundFailedReservation (:195), recordResilienceObservation (:363). |
| service | fallback reason header | `apps/web/lib/chat-fallback-reason.ts` | Header and notice text for a backup answer. |
| component | Mobile fallback notice | `apps/mobile/src/features/chat/utils/fallbackNotice.ts` | Reads header and builds notice (:9, :28). |
| component | Operator costs panel | `apps/web/features/admin/components/OperatorCostsPanel.tsx` | Shows fallback reasons per grep; panel details unread. |
| test | managed failover tests | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.test.ts` | Rotation rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Adapter yields an error chunk or throws; the first chunk is peeked and mapped to an Error with status, Retry-After and classification. | our servers | adapter-factory.ts:161-182; adapter-errors.ts:36-60 |
| Same-route retry waits with backoff if the class and budget allow. | our servers | provider-deadlines.ts:198-290 |
| If still failed, createFailoverPlan.next decides: never-rotate classes stop; free lane re-enters its stage; same-route transient retry; OpenRouter route-retry for the same model; then the next admissible candidate. | our servers | managed-failover.ts:880-994 |
| Each failure is written as a health outcome to the key-value store, which ranking reads next time. | our servers | route.ts:363-387; runtime-state-service.ts:752-760 |
| If no route is left, the reservation is settled as failed and the error is returned. | our servers | route.ts:1308-1330; route.ts:195-250 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Route, provider and credential outcome events | Key-value store behind getKeyValueStore (runtime-state-service.ts:332, :656) | Shared by all server instances through the store | Expire by window; event TTL buffer 60 seconds beyond the window (route-health-store.ts:~95-110 constants; observation window 30 minutes default, line 76-82). |
| Failed usage reservation outcome | Managed usage records (finalizeManagedUsageRequest) | Server side | Billing retention is another feature |

**Models and providers.** Provider classification differs per vendor in adapters; failover crosses providers for Auto and, for pinned models, other providers of the same model only.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud account. |
| Permissions | Workspace model policy checked for every hop, including the OpenRouter route-retry (managed-failover.ts:734-775). |
| Subscription | Plan access re-checked on every candidate (managed-failover.ts:556-562). |
| Limits and metering | One reservation across all attempts; settled once on the model that served (managed-failover.ts:50-58 comment; route.ts:195). |
| Feature flags | AGI_ROUTING_OBSERVED_HEALTH on by default; breaker thresholds via AGI_ROUTE_BREAKER_* names. |
| Model compatibility | Fallback candidates must fit the already-fitted conversation (managed-failover.ts:567). |
| Provider restrictions | Candidates that may train on inputs are skipped for opted-out accounts (managed-failover.ts:563-567). |
| Local mode | Fallback and health code here is for managed cloud. Local mode behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Retry | 2 attempts, 3 for overload; backoff base 500 ms up to 32 s with up to 25 percent extra jitter. | provider-deadlines.ts:27; retry.ts:11-16, :225-240 |
| Cancel while waiting | Sleep rejects; no new attempt. | provider-deadlines.ts:277-284 |
| Timeout | A deadline expiry is not retried on the same route; rotation layer decides. | provider-deadlines.ts:198-203 |
| Budget spent | No further route is tried when the 40 second first-token budget is spent. | route.ts:1286-1300 |
| Billing exhausted | Not rotated; one Auto-only exception. | managed-failover.ts:171-180 |
| Tool state bound | After tool-call ids are minted the turn stays on that provider. | managed-failover.ts:536-541 |
| Offline / recovery | Breaker half-open and cooldown after failures; rediscovery by later requests. | packages/ai/routing/src/route-health-store.ts:83-110, :528 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.test.ts`: rotation rules [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.policy.test.ts`: policy checks on hops [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.free-lane.test.ts`: free-lane rotation [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/provider-deadlines.retry.test.ts`: retry 529 on same route, no retry on 401, cap on failing route, fewer attempts for non-overload, abort stops backoff, Retry-After over ceiling gives up (read)
- `apps/web/app/api/llm/v1/chat/completions/__tests__/route.managed-failover.test.ts`: route-level failover [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/route-breaker.test.ts`: breaker [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.route-health.test.ts`: route health in request processor [inferred from file name]
- `packages/ai/provider-runtime/src/__tests__/retry.test.ts`: withRetry [inferred from file name]
- `packages/ai/provider-runtime/src/__tests__/errors.test.ts`: classification [inferred from file name]
- `packages/ai/routing/src/__tests__/route-health-store.test.ts`: health store [inferred from file name]
- `packages/ai/routing/src/__tests__/fallback-plan.test.ts`: fallback plan [inferred from file name]
- `scripts/check-retry-semantics.test.mjs`: retry semantics guard [inferred from file name]

**Test scenarios**

- **Overload at start**
  1. Provider double returns an overload error once, then succeeds.
  - Expected: Same route retried; one answer; no fallback notice.
- **Rejected key**
  1. Provider double returns an auth error on a route; another provider has a working route.
  - Expected: Other routes of the first provider are skipped; second provider serves (Auto).
- **Pinned model, out of money**
  1. Pinned model route returns a billing-exhausted error.
  - Expected: No other paid provider is tried; error shown; reservation released.
- **Retry-After too long**
  1. Provider returns Retry-After of 120 seconds.
  - Expected: No same-route wait; rotation or error.
- **Breaker**
  1. Make a route fail three times in a row in a test store.
  2. Send a new Auto request.
  - Expected: Route is skipped and a different route is chosen.

**Where to look when it fails**

- Logs 'Managed failover: rotating to fallback route', 'Managed failover refused: failure class must never rotate', and 'Managed failover candidate skipped: ...' (managed-failover.ts:482-575, :880-990).
- Log 'Managed failover: resilience observation was not recorded' (route.ts:380).
- Key-value store keys from routeHealthEventsKey (route-health-store.ts:375).
- Error categories from classifyError.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The 10-retry rule in the brief is not on the live chat path; withRetry has no production caller.** Affects: Operators and testers expecting 10 retries.. Evidence: packages/ai/provider-runtime/src/retry.ts:9, :77; grep found no non-test caller. Work needed: Wire it, delete it, or correct the brief and the product statement.
- **Explicit-model fallback plan is not capped at 4 routes.** Affects: Pinned model requests.. Evidence: packages/ai/routing/src/auto.ts:1506-1513 versus :1620. Work needed: Add a cap or document it.
- **Brief cites request-processor.ts:1665 for route health; that line is a type field, the writes are in route.ts and runtime-state-service.ts.** Affects: Readers.. Evidence: request-processor.ts:1640-1670. Work needed: Update brief.

**Depends on**

- F091-02
- F091-03
- F091-04
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- mode:cloud
- surface:web
- provider:openrouter
- provider:anthropic

## Unknown

- Whether any production path calls withRetry.
- Local-mode retry and fallback.
- Which operator view shows route health and its exact labels.
- Cap on explicit-model fallback plans in practice (depends on registry routes).
- Fallback notice on CLI, VS Code, Chrome, Desktop.
- Exact health window defaults beyond the lines read.
