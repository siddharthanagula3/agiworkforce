---
id: "F091-09"
type: "feature"
title: "Model evaluation and rollout gate"
aliases: ["Model rollout evaluation", "Rollout cron", "evaluate-model-rollout", "Model rollout panel", "model_rollout_benchmarks", "Canary and shadow alerts", "S91.32"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.32"]
depends_on: ["surface:web", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "table:routing_decision_traces", "table:model_rollout_benchmarks", "table:managed_usage_requests", "F091-07", "api:GET /api/cron/evaluate-model-rollout"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-09 Model evaluation and rollout gate

An hourly server job compares each canary and shadow model with the promoted model in the same slot, writes benchmark rows per model, cohort and slot, and alerts on-call by page and email when quality, latency or cost is worse. It alerts only; it does not block a rollout itself. Operators read results in the 'rollout' admin tab.

Area: [91. Model and inference components](README.md). Requirement items: [S91.32](../../10-requirements/capabilities/091-model-and-inference-components.md#s9132).

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

**What it does.** Reads the last full hourly window of routing traces, computes per-cohort failure rate, p50 and p95 latency and cost per request, stores them, raises alerts, and purges old traces. (apps/web/app/api/cron/evaluate-model-rollout/route.ts:72; apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:80)

**Why it exists.** A new model should not widen to everyone before there is evidence it is not worse than the promoted one. A promotion carries evidence of its shadow and canary stages. (apps/web/db/neon/0212_routing_decision_traces.sql:21-23; doc: docs/architecture/provider-routing.md)

**Who uses it.** Operators and on-call engineers. Not used by people in the apps.

**Problems it solves**

- Silent regressions in a candidate model's failure rate, latency or cost.
- No record of how each lifecycle stage performed.
- Alert floods: a candidate is judged only against the control in the same slot and window, with a minimum sample size (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:140-150).

**Use cases**

- A canary model fails 8 points more often than control; on-call is paged once for six hours.
- An operator opens the 'Model rollout' tab to see slots with a canary or shadow and recent benchmarks.
- A shadow model's cost per request is over 1.5x control and an alert is sent.

## 2. User experience

**Where to find it**

- Web admin dashboard, tab 'rollout', heading 'Model rollout' (apps/web/features/admin/components/ModelRolloutPanel.tsx:48; apps/web/features/admin/pages/OperatorDashboardPage.tsx:487).
- Other apps: not available; server-only.

**Before you start**

- Platform admin for the panel and GET /api/admin/model-rollout (apps/web/app/api/admin/model-rollout/route.ts:55).
- Cron caller holding the cron secret for the job.

**Screens and controls**

- Panel text lists stage labels 'Canary serving' and 'Shadow mirroring' and a table with Canary and Shadow columns plus benchmarks (apps/web/features/admin/components/ModelRolloutPanel.tsx:24-25,87-89). Read-only; no control found.

**Journey**

1. Cron fires at minute 5 of every hour (vercel.json:182).
2. Job verifies the cron secret.
3. It reads the previous full window, records benchmarks, finds alerts, purges old traces.
4. New alerts are paged and emailed.
5. Operator reads the Model rollout tab and, if needed, uses the routing kill switch in the operator console.

**What the person sees and gets**

- Cron JSON: benchmarks, purged, purgedDecisions, alerts, paged or 'not_needed', emailed.
- Alert text: 'ROLLOUT COHORT ALERTS' lines such as 'quality on slot …' with failure rate, median latency or cost per request (apps/web/app/api/cron/evaluate-model-rollout/route.ts:25-33).
- Email and page subject '[AGI WARNING] <environment> model rollout regression · <kinds>'.

**Settings**

- Environment names: AGI_ROLLOUT_WINDOW_MS, AGI_ROLLOUT_MIN_SAMPLES, AGI_ROLLOUT_FAILURE_RATE_INCREASE, AGI_ROLLOUT_LATENCY_RATIO, AGI_ROLLOUT_COST_RATIO, AGI_ROUTING_TRACE_RETENTION_DAYS, AGI_ROUTING_TRACE_RETENTION_BATCH (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:21-29). Defaults: 1 hour, 20 samples, +5 points, 1.5x, 1.5x, 30 days, 5,000 rows.
- Cron secret CRON_SECRET (name only) (apps/web/lib/server/cron-auth.ts:63).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cron route returns 401 'Unauthorized' without a valid cron authorization (apps/web/app/api/cron/evaluate-model-rollout/route.ts:73-76).
- Scheduled hourly at minute 5 (vercel.json:182-183).
- Benchmark rows upserted per model, lifecycle stage, cohort, slot and window start; rows without a lifecycle stage are skipped (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:213-240).
- Alerts for quality, latency and cost compared with control (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:140-200).
- Alert dedup by claim key slot, cohort, candidate model and kind, 6 hours; if the store errors the alert is still sent; if no store, all alerts are sent (apps/web/app/api/cron/evaluate-model-rollout/route.ts:57-71).
- Claims are released and 500 returned when neither page nor email reached anyone (apps/web/app/api/cron/evaluate-model-rollout/route.ts:140-142).
- Read-only admin API and panel list stages (observed health, canary, shadow), slots and the 100 latest benchmarks (apps/web/app/api/admin/model-rollout/route.ts:55-70).
- Also purges expired routing traces and semantic decision traces (apps/web/app/api/cron/evaluate-model-rollout/route.ts:93-97).

**Incomplete**

- The job alerts only. No code found that blocks or reverses a rollout from these results; the operator pulls a canary by hand with the routing kill switch (apps/web/app/api/cron/evaluate-model-rollout/route.ts:126).
- Quality is measured as failure rate only, not answer quality (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:111).

**Present but disconnected or switched off**

- Canary and shadow stages depend on stage switches (observedHealthRankingEnabled, canaryRoutingEnabled, shadowMirroringEnabled); their current values were not read (apps/web/app/api/admin/model-rollout/route.ts:61-65).

**Not available**

- Any screen or job on the other five apps.

## 4. Required behaviour

**Established requirements**

- A model evaluation service scores models and cohorts and gates rollout. (source: S91.32)
- The scheduled job must pass the cron authorisation check or it is refused with 401. (source: Brief 'Should' for F091-09)
- Each window writes benchmark rows per model, cohort and slot. (source: Brief 'Should' for F091-09)
- Alerts are sent once per claim key; if the claim store is down, the alert is sent anyway. (source: Brief 'Should' for F091-09)
- The hourly job compares candidate cohorts with the promoted model and pages on call. (source: doc: docs/architecture/provider-routing.md)

**Acceptance criteria**

1. GET without the bearer secret returns 401 and writes nothing.
2. With traces in the window, model_rollout_benchmarks gets one row per model, lifecycle stage, cohort and slot; rerun updates it, not duplicates.
3. A candidate below the minimum sample count raises no alert.
4. A candidate with failure rate more than 5 points above control raises a 'quality' alert.
5. A second run within 6 hours with the same condition does not page again.
6. If the claim store throws, the alert is still sent.
7. If neither page nor email is delivered, response is 500 and claims are released.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- 'Gates rollout' in the brief means evidence plus alert for a human; no automatic gate was found [inferred from reading the job and service].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let promotion tooling refuse a widen when the last window shows an open alert for that slot.
- [proposed] Add a semantic quality score beside failure rate (a semantic assessment service exists in the same folder, apps/web/lib/services/model-rollout/semantic-response-assessment-service.ts, not wired here as read).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | Rollout cron | `apps/web/app/api/cron/evaluate-model-rollout/route.ts` | Scheduled job: auth, benchmarks, alerts, purge. |
| config | Cron schedule | `vercel.json` | Runs the job at minute 5 each hour. |
| service | Cron auth | `apps/web/lib/server/cron-auth.ts` | verifyCronRequest with constant-time compare and failure throttle. |
| service | Rollout evaluation service | `apps/web/lib/services/model-rollout/rollout-evaluation-service.ts` | Config, cohort metrics SQL, alert rules, benchmark upsert, purge, listing. |
| service | Routing decision trace service | `apps/web/lib/services/model-rollout/routing-decision-trace-service.ts` | Writes the traces the job reads. |
| service | Shadow dispatch service | `apps/web/lib/services/model-rollout/shadow-dispatch-service.ts` | Mirrors a share of turns to a shadow model. |
| service | Rollout routing inputs | `apps/web/lib/services/model-rollout/rollout-routing-inputs.ts` | Flag and prompt variant inputs for routing. |
| table | routing_decision_traces | `apps/web/db/neon/0212_routing_decision_traces.sql` | Source rows. |
| table | model_rollout_benchmarks | `apps/web/db/neon/0212_routing_decision_traces.sql` | Benchmark output with unique window index. |
| table | managed_usage_requests | `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql` | Joined for cost per request. |
| endpoint | Admin model rollout | `apps/web/app/api/admin/model-rollout/route.ts` | GET stages, slots and recent benchmarks. |
| component | ModelRolloutPanel | `apps/web/features/admin/components/ModelRolloutPanel.tsx` | Operator tab 'Model rollout'. |
| component | OperatorDashboardPage | `apps/web/features/admin/pages/OperatorDashboardPage.tsx` | Hosts the rollout tab. |
| integration | On-call pager | `apps/web/lib/server/incident/pager.ts` | pageOnCall for warning alerts. |
| integration | Support email client | `apps/web/lib/support/handoff/resend-client.ts` | Sends the alert email. |
| service | Key-value store | `apps/web/lib/server/key-value.ts` | Alert claim keys with TTL. |
| service | Semantic decision trace purge | `apps/web/lib/services/semantic-decisions/trace-service.ts` | Purged by the same job. |
| config | Model families and slots | `packages/ai/model-registry/catalog/model-families.json` | Slot and family definitions that canary and shadow reference (named in AGENTS.md). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Scheduler calls GET with a bearer secret. | outside service | vercel.json:182 |
| Secret checked with constant-time compare and a per-client failure throttle; failure returns 401. | our servers | apps/web/lib/server/cron-auth.ts:62-82; apps/web/app/api/cron/evaluate-model-rollout/route.ts:73 |
| Window is the last full window aligned to the window size. | our servers | apps/web/app/api/cron/evaluate-model-rollout/route.ts:79-81 |
| SQL aggregates traces and joins cost from managed_usage_requests. | our servers | apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:92-120 |
| Benchmarks are upserted; alerts computed; old traces purged. | our servers | apps/web/app/api/cron/evaluate-model-rollout/route.ts:91-97 |
| New alerts claimed in the key-value store, then sent to the on-call pager and by email (pager and email are outside services). | our servers | apps/web/app/api/cron/evaluate-model-rollout/route.ts:134-139 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Benchmark rows (failure rate, p50, p95, cost per request, sample count) | table model_rollout_benchmarks | server only | no purge of benchmark rows found in the code read: unknown |
| Alert claim keys | key-value store | server only | 6 hour TTL (apps/web/app/api/cron/evaluate-model-rollout/route.ts:23) |
| Routing traces | routing_decision_traces | server only | deleted after 30 days by default, in batches |

**Models and providers.** Works on model keys and slots from the registry; no model call is made by the job. Shadow cohort requests are real provider calls charged as platform cost (doc: docs/architecture/provider-routing.md).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No user account: the cron secret authorizes the job. The admin view needs a platform admin. |
| Permissions | verifyCronRequest; requirePlatformAdmin for the panel API. |
| Subscription | none found in the code for this feature. |
| Limits and metering | Max duration 60 seconds (apps/web/app/api/cron/evaluate-model-rollout/route.ts:19). Shadow requests are capped per slot per day (doc: docs/architecture/provider-routing.md). |
| Feature flags | Routing flags 'routing.canary' and 'routing.shadow' with a kill switch (apps/web/lib/feature-flags/routing-flags.ts:10-11; cron route.ts:126). |
| Model compatibility | Evaluated per model key in a slot; control is the promoted model of the same slot. |
| Provider restrictions | none found in the code for the evaluation itself. |
| Local mode | Not applicable: server-only; Local turns on devices are not in routing_decision_traces as far as read: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Bad or missing authorization | 401 and warning 'Unauthorized model rollout cron request'. | apps/web/app/api/cron/evaluate-model-rollout/route.ts:73-76 |
| Too many bad secrets from one client | Throttled for 60 seconds window after 10 failures. | apps/web/lib/server/cron-auth.ts:20-22 |
| Database read fails | 500 'Internal server error'. | apps/web/app/api/cron/evaluate-model-rollout/route.ts:98-104 |
| No alerts | 200 with paged 'not_needed'. | apps/web/app/api/cron/evaluate-model-rollout/route.ts:108-115 |
| Claim store unavailable | Alert sent anyway; warning logged. | apps/web/app/api/cron/evaluate-model-rollout/route.ts:66-69 |
| Neither channel delivers | 500 and claims released so the next run retries. | apps/web/app/api/cron/evaluate-model-rollout/route.ts:141,160 |
| Only one channel delivers | Claim kept; 200. | apps/web/app/api/cron/evaluate-model-rollout/route.ts:141 |
| Too few samples | No alert for that cohort. | apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:149 |
| Panel load error | The panel shows an alert region for errors; exact text not read. | apps/web/features/admin/components/ModelRolloutPanel.tsx:56 (role=alert seen) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/cron/evaluate-model-rollout/route.test.ts`: 401 refusal, benchmarks and purge, paging, dedup, claim release, one-channel failure, read failure.
- `apps/web/lib/services/model-rollout/__tests__/rollout-evaluation.test.ts`: Alert detection and config resolution.
- `apps/web/lib/services/model-rollout/__tests__/routing-decision-trace.test.ts`: Trace writes.
- `apps/web/lib/services/model-rollout/__tests__/shadow-dispatch.test.ts`: Shadow mirroring.
- `apps/web/lib/services/model-rollout/__tests__/rollout-routing-inputs.test.ts`: Rollout routing inputs.
- `apps/web/app/api/admin/model-rollout/__tests__/route.test.ts`: Admin rollout API.

**Test scenarios**

- **Unauthorized call**
  1. Call the cron path without the bearer secret
  - Expected: 401 and no database write.
- **Benchmarks per window**
  1. Seed traces for control and canary in one hour
  2. Call with the secret
  3. Query model_rollout_benchmarks
  - Expected: One row per model, cohort and slot; rerun leaves the same row count.
- **Quality alert**
  1. Seed 30 control traces at 1% failure and 30 canary traces at 10%
  2. Run the job
  - Expected: A quality alert, a page and an email.
- **Dedup**
  1. Run twice within 6 hours
  - Expected: Second run reports no new page.
- **Store down**
  1. Make the key-value store throw
  2. Run with an alert present
  - Expected: Alert still sent.
- **Operator view**
  1. Sign in as platform admin
  2. Open admin tab Rollout
  - Expected: Stage switches, slots with canary or shadow and the latest benchmarks.

**Where to look when it fails**

- Logs 'Unauthorized model rollout cron request', '[model-rollout] alert dedup unavailable; paging anyway', 'Model rollout cohort alert dispatched' and '…not delivered', 'Model rollout cron could not evaluate cohorts'.
- Tables model_rollout_benchmarks and routing_decision_traces.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No automatic gate: results only alert a human.** Affects: Operators; any rollout. Evidence: apps/web/app/api/cron/evaluate-model-rollout/route.ts:126. Work needed: Decide whether the brief's 'gates rollout' requires an enforced block, then connect promotion tooling.
- **Quality is failure rate only.** Affects: Operators. Evidence: apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:111. Work needed: Add answer-quality evidence.
- **Benchmark rows have no purge in the code read.** Affects: Database size. Evidence: purge function only targets routing traces (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:243). Work needed: Confirm retention and add if needed.
- **Latency for non-stream successes is not recorded on traces, so p50 uses duration or ttft only when set.** Affects: Latency alerts. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:266. Work needed: Record latency on those outcomes.

**Depends on**

- surface:web
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- table:routing_decision_traces
- table:model_rollout_benchmarks
- table:managed_usage_requests
- F091-07
- api:GET /api/cron/evaluate-model-rollout

## Unknown

- Current values of the canary, shadow and observed-health switches in production.
- Whether benchmark rows are ever deleted.
- Whether any process outside this job reads benchmarks to decide promotion.
- Whether the alert path is configured in production (pager and email settings).
