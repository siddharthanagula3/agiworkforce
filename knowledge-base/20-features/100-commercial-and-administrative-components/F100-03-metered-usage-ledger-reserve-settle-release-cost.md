---
id: "F100-03"
type: "feature"
title: "Metered usage ledger (reserve, settle, release, cost)"
aliases: ["Usage-event ingestion (S100.05)", "Usage ledger (S100.06)", "Credit reservation (S100.07)", "Credit settlement (S100.08)", "Credit refund/release (S100.09)", "Cost attribution (S100.10)", "managed_usage_requests", "reserve, finalize, release"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.05", "S100.06", "S100.07", "S100.08", "S100.09", "S100.10"]
depends_on: ["F100-01", "F100-02", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-inference-providers", "table:managed_usage_requests", "table:token_credits", "file:apps/web/lib/services/managed-usage-request-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-03 Metered usage ledger (reserve, settle, release, cost)

Every metered Cloud model call is recorded in a durable ledger. Before the call an estimated cost is held; afterwards the hold becomes the real cost, or is released if the call failed. A scheduled job recovers holds whose turn vanished. Cost is tagged by user, workspace, chat, key, schedule and app.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.05](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10005), [S100.06](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10006), [S100.07](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10007), [S100.08](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10008), [S100.09](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10009), [S100.10](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10010).

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

**What it does.** Reserves an estimated cost in microUSD under an idempotency key, moves the request through provider-started and client-delivered states, finalizes it at the billed cost with the provider cost kept separately, releases failed or stranded holds, and attributes each request to who and what caused it (managed-usage-request-service.ts:738-1306).

**Why it exists.** So balances and windows can always be recomputed from a ledger, a retried request is never charged twice, a failed reply is not charged, and the company can see what each call cost it versus what the customer was billed (S100.05 to S100.10 in the area brief).

**Who uses it.** The chat pipeline, voice, artifacts, scheduled tasks and API keys on the managed path; finance and operations people reading usage and cost reports.

**Problems it solves**

- Double charging on retry (idempotency keys, managed-usage-request-service.ts:403-425).
- Charging for failed replies (failed outcome records zero for both amounts, line 1166-1168).
- Quota held forever by a dead turn (recovery cron, recover-reservations/route.ts:34-92).
- Hidden margin loss (provider cost recorded separately, lines 1166-1169, 1262-1289).

**Use cases**

- A normal chat turn reserves, streams, then finalizes at the real token cost.
- A turn fails midway: the hold is released and nothing is billed.
- A turn is recovered after a stall and then delivers: a late settlement bills the delivered work (managed-usage-request-service.ts:1087-1139).
- A published app (artifact) makes AI calls: they are capped per app and cannot be billed to usage credits (line 763-769).

## 2. User experience

**Where to find it**

- Mostly invisible. The results show in web Settings > Usage ('Credit balances', 'This billing period') and usage history (apps/web/features/settings/sections/UsageSection.tsx:414, 1100).
- Usage credits and top-ups: Settings > Billing (apps/web/features/settings/sections/BillingSection.tsx).
- CLI, VS Code, Chrome and mobile show limits and balances through their own usage views; the ledger itself has no screen on them.

**Before you start**

- A Managed Cloud request. Reservation needs a user id, an idempotency key, a request hash, a provider and model, and a plan tier (managed-usage-request-service.ts:738-760).

**Screens and controls**

- Usage history grouped by a chosen dimension, with aria-label 'Group usage history by' (UsageSection.tsx:1110).
- 'Credit balances' lists Bonus credits and Purchased credits (UsageSection.tsx:430-431).
- Operator and admin usage export: /api/usage/history and the workspace usage export (per brief S100.24; not read in this feature).

**Journey**

1. Person sends a message.
2. Server reserves an estimated cost; if refused the person sees a limit message (F100-02).
3. Model streams the reply; the server marks provider started and client delivered.
4. On success the reservation is finalized at the real cost; on failure it is released.
5. Balances and meters update; if the stall left a hold, the recovery job releases it.

**What the person sees and gets**

- Updated meters and balances.
- An 'extra usage' message when fast mode needs usage credits that do not cover the message (managed-usage-request-service.ts:427-432).
- A notice when usage credits fund a request, only sent where the lookup works (managed-usage-request-service.ts:871-889).

**Settings**

- Usage credits on or off (usageCreditsEnabled, line 715).
- Auto-reload of credits (cron run-auto-reloads in vercel.json:77-80; panel features/billing/components/AutoReloadPanel.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Reservation through three database functions chosen by funding: plan windows with limits, extra usage on credits, and artifact runtime (managed-usage-request-service.ts:781-868).
- Idempotency key parsed and replays refused with distinct codes (lines 403-425, 777).
- Provider steps extend a reservation inside one request (reserveManagedUsageProviderStep, line 941).
- Lifecycle transitions mark_managed_usage_provider_started and mark_managed_usage_client_delivered (lines 1043-1071).
- Finalization calls finalize_managed_usage_request_microusd with outcome completed or failed; failed bills zero for billed and provider cost (lines 1140-1230).
- Late completion after recovery is billed through a separate durable settlement, and an undelivered recovery absorbs provider cost visibly with an error log (lines 1087-1139, 1243-1274).
- Provider cost and what the customer was billed are separate fields, and a served route can differ from the reserved route (lines 1140-1200, 1276-1289).
- Attribution: schedule run, conversation, API key (lines 614-712), plus workload, project id and session id (apps/web/lib/billing/usage-attribution.ts:4-8), organization id (line 742) and artifact subject key (line 763).
- Stranded reservations: a cron every 15 minutes releases them and drains the settlement queue, and also releases expired Free reservations and settles abandoned voice sessions (apps/web/app/api/cron/recover-reservations/route.ts:34-92; vercel.json:74-76).
- The recovery job skips itself in low-power mode (recover-reservations/route.ts:40-41; apps/web/lib/server/cron-low-power.ts:17).
- Refunds reverse credits: plan allowance and purchased credits are revoked in proportion to a refunded charge (apps/web/app/api/stripe-webhook/lib/refund-events.ts:147-216).

**Incomplete**

- The ledger is the table managed_usage_requests plus credit tables; the brief calls it append-only, but whether rows are updated in place by the lifecycle functions was not checked: the service runs update statements against managed_usage_requests (managed-usage-request-service.ts:614-712), so 'append-only' is not established.
- The usage reporting and export (S100.24) and the cost-of-goods ledger were not read for this page.

**Present but disconnected or switched off**

- A late settlement that is rejected leaves the cost absorbed and is only logged (managed-usage-request-service.ts:1115-1128).

**Not available**

- No per-app difference: all apps share the server path. A ledger entry for Local or own-key turns: unknown.

## 4. Required behaviour

**Established requirements**

- Each metered operation records a usage event (who, what model, how much, cost) into durable storage. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.05)
- An append-only usage ledger holds every reservation, settlement and release so balances and windows can be recomputed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.06)
- Before a metered operation runs its estimated cost is reserved against the account's limits and balance. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.07)
- After an operation the reservation is settled at actual cost and credits are deducted exactly once. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.08)
- Unused or failed reservations are released, stranded ones recovered, and refunded purchases reverse their credits. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.09)
- Costs are attributed to account, project, feature and model, and provider cost is kept separately from what the user is billed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.10)
- Allowance and purchased balance are distinct entitlements. (source: doc: docs/product/commercial.md (Allowance And Purchased Balance Are Distinct Entitlements))
- A cost of goods ledger exists. (source: doc: docs/product/commercial.md (Cost Of Goods Ledger))

**Acceptance criteria**

1. Sending the same idempotency key and body while a request is in progress returns 409 idempotency_in_progress; after it finishes returns 409 idempotency_replay; a different body returns 409 idempotency_conflict.
2. A completed request settles once at the actual cost; a failed request leaves billed and provider cost at zero and the hold released.
3. A reservation whose turn disappears is released by the recovery cron within its schedule and the user's window frees.
4. A request that completes after its lease was recovered is billed once through the late settlement or logged as absorbed.
5. An artifact call is refused when billed to usage credits, and refused when the per-app cap is reached.
6. A refunded top-up or plan charge revokes the matching credits in proportion, and a repeat of the same webhook revokes nothing more.
7. Each finalized request carries attribution fields where known (conversation, API key, schedule run, workload, project, session).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Settlement being idempotent by key is what makes overlapping cron runs safe [inferred from recover-reservations/route.ts:26-31 comment].
- Balances are derived from the ledger and credit tables, not stored only as counters [inferred from the area brief; not verified in SQL].

**Proposed improvements** (suggestions, not requirements)

- [proposed] State in the brief whether the ledger is append-only or a lifecycle table, and align the wording.
- [proposed] Add a page-level reconciliation that proves the sum of settlements equals the sum of credit deductions for a period.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | reserveManagedUsageRequest | `apps/web/lib/services/managed-usage-request-service.ts` | Reserve estimated cost (line 738). |
| service | reserveManagedUsageProviderStep | `apps/web/lib/services/managed-usage-request-service.ts` | Extend a reservation for another provider step (line 941). |
| service | markManagedUsageProviderStarted and ClientDelivered | `apps/web/lib/services/managed-usage-request-service.ts` | Lifecycle transitions (lines 1065-1071). |
| service | finalizeManagedUsageRequest | `apps/web/lib/services/managed-usage-request-service.ts` | Settle or release and record provider cost (line 1140). |
| service | settleLateManagedUsage | `apps/web/lib/services/managed-usage-request-service.ts` | Bills delivered work after recovery (line 1087). |
| service | usage-attribution | `apps/web/lib/billing/usage-attribution.ts` | Workload, project id and session id normalization (lines 4-28). |
| service | CreditService | `apps/web/lib/services/credit-service.ts` | settleCreditsDurably, processPendingSettlements, getBalance (used at managed-usage-request-service.ts:1103 and recover-reservations/route.ts:59). |
| job | recover-reservations cron | `apps/web/app/api/cron/recover-reservations/route.ts` | Every 15 minutes: recover stranded reservations and drain settlements (vercel.json:74-76). |
| service | free-trial-service | `apps/web/lib/services/free-trial-service.ts` | Free usage reservation, settlement and release (lines 606, 814, 975). |
| table | managed_usage_requests | `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql` | Request lifecycle rows: status, cost, usage json, attribution columns (created at line 13). |
| schema | microUSD ledger functions | `apps/web/db/neon/0182_managed_usage_microusd_ledger.sql` | reserve, finalize and recover functions in microUSD (lines 1816, 2069, 2695, 2874). |
| schema | overage classification | `apps/web/db/neon/0281_managed_usage_overage_classification.sql` | Marks requests funded by usage credits (is_overage). |
| table | token_credits | `apps/web/db/neon/0004_token_credits.sql` | Credit accounts per period with allocated and top-up amounts. |
| table | credit_transactions | `apps/web/app/api/stripe-webhook/lib/refund-events.ts` | Refund reversal rows read at lines 49-62. |
| schema | durable credit settlements | `apps/web/db/neon/0055_durable_credit_settlements.sql` | Settlement queue the cron drains. |
| service | refund-events | `apps/web/app/api/stripe-webhook/lib/refund-events.ts` | revokeTopUpRefund and revokePlanRefund (lines 147, 178). |
| service | chat request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Calls reserve (line 6148) and finalize (line 6740). |
| service | stream-transform | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Finalizes when a stream ends (line 334). |
| service | cogs-ledger-service | `apps/web/lib/services/cogs-ledger-service.ts` | Cost of goods records, imported by tier-unit-quota-service.ts:19-22. |
| screen | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Balances and usage history on web. |
| service | cron auth | `apps/web/lib/server/cron-auth.ts` | verifyCronRequest guards the cron routes (line 62). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The chat pipeline estimates the cost and calls reserve with an idempotency key and request hash. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6148; managed-usage-request-service.ts:738 |
| A database function takes a per-user lock, checks caps and balance and writes the reservation row, returning a decision. | our servers | managed-usage-request-service.ts:781-868; 0182_managed_usage_microusd_ledger.sql:2069 |
| Attribution fields are written onto the row. | our servers | managed-usage-request-service.ts:880-889 |
| The server calls the model provider and streams the reply; lifecycle marks are written. | outside service | request-processor.ts (provider call); managed-usage-request-service.ts:1043-1071 |
| On end, finalize writes the billed cost and records the provider cost and served route. | our servers | managed-usage-request-service.ts:1140-1289; stream-transform.ts:334 |
| If auto-reload applies and cost was positive, a reload check is triggered. | our servers | managed-usage-request-service.ts:1291-1293 |
| Every 15 minutes the cron recovers stale reservations and drains the settlement queue. | our servers | recover-reservations/route.ts:59-60; vercel.json:74-76 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Request row: user, idempotency key, hash, provider, model, status, estimated and actual cost, usage json, attribution ids | table managed_usage_requests | Server only; apps read aggregated usage through the usage API | Included in account export and erasure manifests (apps/web/lib/services/deletion-manifest.ts lists billing tables; exact managed_usage_requests handling not read); retention period unknown |
| Credit accounts and transactions | tables token_credits and credit_transactions | Server only | unknown |
| Provider cost record per settled request | cost of goods ledger (recordSettledProviderCost, managed-usage-request-service.ts:1262) | Server only | unknown |

**Models and providers.** The reservation records the provider and model and the finalization records the route actually served, which can differ from the reserved route (managed-usage-request-service.ts:1180-1200). The billed amount is the model's official price for the usage; the provider cost is what the served route cost the company (lines 1146-1150). Prices and routes belong to SYS-model-catalog-and-routing and SYS-inference-providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A user id is required; the reservation is keyed to it (managed-usage-request-service.ts:738-745). |
| Permissions | Writes use the server's privileged database connection; users cannot write the ledger. Reading usage is scoped to the account or workspace (see S100.24). |
| Subscription | Reservation caps come from the plan and the catalog version stored on the credit period (managed-usage-request-service.ts:596-612). Extra usage on credits needs usage credits turned on (line 715). |
| Limits and metering | This feature is the metering. Units are microUSD (apps/web/lib/server/managed-usage-policy.ts:22 for the ledger cent scale). |
| Feature flags | The recovery cron skips in low-power mode (recover-reservations/route.ts:40-41). Billing-specific feature flags for metering: none found in this read. |
| Model compatibility | All managed models are metered; flagship status changes the cap that applies (managed-usage-request-service.ts:792-799). |
| Provider restrictions | none found in the code at this layer; the served provider is recorded, not restricted. |
| Local mode | none found in the code: no ledger write was found for on-device turns in this read. Whether Local or own-key turns create any usage event is unknown; see SYS-local-inference and SYS-execution-boundaries. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Idempotency key already in progress or finished | 409 with a specific code; start a new key for a deliberate new turn. | managed-usage-request-service.ts:403-425 |
| Billing function returns an invalid shape | 503 billing_protocol_error. | managed-usage-request-service.ts:894-906, 1209-1230 |
| Failed model call | Outcome failed; billed and provider cost are zero; request released. | managed-usage-request-service.ts:1166-1169 |
| Lease expired then turn delivers | Recovery already refunded; finalize returns already_finalized and a late settlement bills the work, or the cost is absorbed and logged. | managed-usage-request-service.ts:1087-1139, 1243-1274 |
| Cron saturates its batch of 500 | Warn log says a backlog remains for the next sweep. | recover-reservations/route.ts:32, 67-84 |
| Low-power mode | Recovery cron returns without work. | recover-reservations/route.ts:40-41 |
| Metered-unit or attribution write fails | Logged; the request continues, and the allowance counts the unit when it settles. | managed-usage-request-service.ts:626-645, 651-673 |
| Offline or timeout on the app | not handled in this feature; the server holds the lease for 900 seconds by default (managed-usage-request-service.ts:864). | managed-usage-request-service.ts:864 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-usage-request-service.test.ts`: By file name: service behaviour. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-lifecycle.invariants.test.ts`: By file name: lifecycle invariants. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-idempotency.test.ts`: By file name: idempotency. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-request-service.provider-cost.test.ts`: By file name: provider cost versus billed cost. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-request-service.artifact-cap.test.ts`: By file name: per-app artifact cap. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-admission-choke-point.test.ts`: By file name: admission path. Contents not read.
- `apps/web/__tests__/billing/managed-usage-lifecycle-migration.test.ts`: By file name: lifecycle database functions. Contents not read.
- `apps/web/db/neon/managed-usage-microusd-migration.test.ts`: By file name: microUSD ledger migration. Contents not read.
- `apps/web/app/api/cron/recover-reservations/route.test.ts`: By file name: the recovery cron route. Contents not read.
- `apps/web/lib/services/__tests__/billing-refund-service.settlement.test.ts`: By file name: refund settlement. Contents not read.

**Test scenarios**

- **Reserve then settle**
  1. Send a managed turn in a test account.
  2. Read the managed_usage_requests row while streaming and after it ends.
  - Expected: Row goes reserved, then provider_started, then completed, with actual cost set once.
- **Failed reply**
  1. Force the provider call to fail.
  2. Read the row and the account's window usage.
  - Expected: Outcome failed with zero billed and provider cost; window usage unchanged.
- **Stranded reservation**
  1. Reserve a request and stop the turn without finalizing.
  2. Wait past the lease and call the recovery cron with valid cron credentials.
  - Expected: Reservation released, settlement queue drained, the window frees; response lists processed counts.
- **Retry with the same key**
  1. Send the same key and body twice, then once with a different body.
  - Expected: 409 idempotency_in_progress or idempotency_replay, then idempotency_conflict.
- **Refund reverses credits**
  1. Refund a test top-up charge in Stripe test mode.
  2. Deliver the charge.refunded webhook twice.
  - Expected: Purchased credits are revoked in proportion once; the second delivery revokes nothing more.

**Where to look when it fails**

- Log events managed_usage_reservation_recovery, managed_usage_reservation_recovery_saturated, managed_usage_finalize_after_recovery, managed_usage_late_settlement_rejected, managed_usage_attempt_outcome_unrecorded.
- Tables managed_usage_requests, token_credits, credit_transactions, credit settlement queue.
- Error code billing_protocol_error and billing_unavailable on the client.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief calls the ledger append-only, but the service updates managed_usage_requests rows in place for attribution and outcome.** Affects: Engineers relying on the brief. Evidence: managed-usage-request-service.ts:614-712. Work needed: Verify the SQL and word the requirement as an auditable lifecycle, or add an append-only event table.
- **Brief says Reservation is at managed-usage-request-service.ts:738-827 and cost attribution at 614-712; attribution of organization and feature is only partly there (organization id passed in at line 742; feature is the quotaFeature tag).** Affects: Cost reports by workspace and feature. Evidence: managed-usage-request-service.ts:742, 1160-1165. Work needed: Confirm where organization_id is written to the row and that reports group by it.
- **No evidence of a ledger entry for Local or own-key turns.** Affects: mode:local, mode:own-key. Evidence: No write found outside the managed path. Work needed: Decide if device-only turns need no ledger and record that in SYS-execution-boundaries.
- **The cron test file exists but the recovery path has no scenario recorded as run in any file I read.** Affects: Operations. Evidence: apps/web/app/api/cron/recover-reservations/route.test.ts exists; no result file. Work needed: Run the scenario above and record the result.
- **Late settlement can be rejected and the cost absorbed with only a log line.** Affects: Margin. Evidence: managed-usage-request-service.ts:1115-1128. Work needed: Add an alert or a daily count of absorbed costs.

**Depends on**

- F100-01
- F100-02
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-inference-providers
- table:managed_usage_requests
- table:token_credits
- file:apps/web/lib/services/managed-usage-request-service.ts

## Unknown

- Whether the ledger rows are append-only in the SQL or updated in place.
- Where organization_id is written to the request row and whether reports group by it.
- Retention and deletion of managed_usage_requests and credit transaction rows.
- Whether any device-only (Local or own-key) turn produces a usage event.
- How Free requests map onto the managed ledger versus the free-trial service.
- Exact contents of the settlement queue table name and its schema.
