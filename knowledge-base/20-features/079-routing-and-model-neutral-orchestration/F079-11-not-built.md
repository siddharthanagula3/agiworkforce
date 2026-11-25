---
id: "F079-11"
type: "feature"
title: "Not built"
aliases: ["Not built", "Advisor escalation", "Confidence-based abstention", "Classification adapter", "Jev adapter", "Routing evaluation dashboard", "S79.22", "S79.25", "S79.29", "S79.31"]
area: "79 Routing and model-neutral orchestration"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S79.22", "S79.25", "S79.29", "S79.31"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-observability-and-operations", "SYS-inference-providers", "SYS-data-model-and-migrations", "F079-08", "table:routing_decision_traces", "api:GET /api/admin/model-rollout", "file:packages/ai/routing/src/classify.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-11 Not built

Four routing ideas the brief marks not applicable in every app: a worker asking a stronger advisor model, abstaining when unsure, a pluggable classifier adapter, and a routing evaluation dashboard. The code has related but different pieces: a heuristic classifier with no model fallback, a shadow decision provider, and operator views over routing traces.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.22](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7922), [S79.25](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7925), [S79.29](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7929), [S79.31](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7931).

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

**What it does.** Records what is not built as a product feature and what nearby code exists, so no one assumes more or less than the code shows.

**Why it exists.** The brief lists these four items so the product area is complete; the statuses say not applicable.

**Who uses it.** Engineers and testers planning routing work; nobody uses these as features today.

**Problems it solves**

- Avoids false claims that the product has advisor escalation or abstention.
- Points operators to the partial visibility that does exist.

**Use cases**

- An engineer asks 'can a model ask a stronger model for help?'; answer: no such code found.
- An operator asks 'where can I see routing outcomes?'; answer: the Operator dashboard rollout tab, observability panels and SLO catalogue.
- A planner asks 'is Jev wired into routing?'; answer: a semantic decision transport exists, shadow-first, and does not select the model.

## 2. User experience

**Where to find it**

- No person-facing control for advisor escalation, abstention or a classifier adapter.
- Operators: Operator dashboard tab 'rollout' showing 'Model rollout' (apps/web/features/admin/pages/OperatorDashboardPage.tsx:46,487; apps/web/features/admin/components/ModelRolloutPanel.tsx:46-50).
- Observability dashboard definition 'Model routing' with panels 'Routing decisions by route' and 'Share of turns with no route' (apps/web/lib/observability/dashboards.ts:847-871).

**Before you start**

- Operator pages need a platform admin (apps/web/app/api/admin/model-rollout/route.ts:50-54).

**Screens and controls**

- Rollout panel reads GET /api/admin/model-rollout: stage switches (observed health, canary, shadow), canary and shadow slots, and recent benchmarks (route.ts:56-66).

**Journey**

1. Operator opens the Operator dashboard, selects the rollout tab, reads stage flags, slots and benchmarks.

**What the person sees and gets**

- Benchmarks by model, lifecycle stage and cohort computed by a cron from routing_decision_traces (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts; cron route apps/web/app/api/cron/evaluate-model-rollout/route.ts; schedule in vercel.json:182).

**Settings**

- AGI_ROLLOUT_WINDOW_MS, AGI_ROLLOUT_MIN_SAMPLES, AGI_ROLLOUT_FAILURE_RATE_INCREASE, AGI_ROLLOUT_LATENCY_RATIO, AGI_ROLLOUT_COST_RATIO (rollout-evaluation-service.ts:21-29).
- TYPESAFE_API_KEY, TYPESAFE_BASE_URL, TYPESAFE_MODEL, TYPESAFE_INPUT_MICROUSD_PER_MTOK configure the decision transport; names only (apps/web/lib/services/semantic-decisions/config.ts:24-34).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Heuristic classifier with sticky pivot and token guard; it has no model fallback and every caller routes on type alone (packages/ai/routing/src/classify.ts:1-12).
- Classification failure falls back to a safe default (brief S79.30; apps/cli/src/routing/classify.rs and packages/ai/routing/src/task-family.ts are listed there; not opened).
- Trace rows feed SLO objectives for chat, first token and completion (apps/web/lib/server/slo/catalogue.ts:66-71,100-150), anomaly checks (apps/web/lib/server/slo/anomaly.ts:45,58), a metrics dashboard definition (dashboards.ts:847-871) and the operator rollout tab.
- Response assessment can run in off, shadow or active mode and records accepted, confidence and clarification fields in the trace (packages/ai/routing/src/routing-trace.ts:21-35; request-processor.ts:4717-4735). What it changes today is the response budget (function name assessSemanticResponseBudget).

**Incomplete**

- Semantic decision transport and shadow turn signals exist on the web server (packages/ai/provider-runtime/src/typesafe-decisions.ts:1-60; apps/web/lib/services/semantic-decisions/turn-signals.ts; request-processor.ts scheduleTurnSignalsShadow) but are shadow-first and unconfigured by default: the config returns unconfigured when its settings are unset (config.ts:24-40). Whether it is enabled in production is unknown.
- The operator rollout view shows canary and shadow benchmarks, not an evaluation of every routing decision against outcomes.

**Present but disconnected or switched off**

- The decision transport does not select the model: the project spec forbids it from choosing trust mode, price, quota, provider or overriding a selected model (doc: docs/specs/semantic-decisions/audit.md, model routing row).

**Not available**

- Advisor escalation: no code found that lets a worker consult a stronger advisor model (grep over apps/web, packages/ai and apps/cli routing code returned only unrelated uses of the word).
- Confidence-based abstention in routing: none found; the classifier confidence is advisory only (classify.ts:11-13).
- Pluggable classifier adapter selecting Jev for routing: not wired into the classifier; classify.ts has no adapter hook.
- A dedicated 'routing evaluation dashboard' page: none found; partial views above.
- All four on Mobile, Desktop, CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- A worker model can escalate to a stronger advisor when needed. (source: S79.22 brief 'Should' (status not applicable))
- When routing or the answer is low-confidence, the system abstains or asks rather than guessing. (source: S79.25 brief 'Should' (status not applicable))
- A pluggable classification adapter can replace or augment the heuristic classifier. (source: S79.29 brief 'Should' (status not applicable))
- Operators can see a dashboard evaluating routing decisions and outcomes. (source: S79.31 brief 'Should' (status not applicable))
- The semantic decision service must not select trust mode, price, quota, residency, provider availability, user plan or override a selected model. (source: doc: docs/specs/semantic-decisions/audit.md)

**Acceptance criteria**

1. No person-facing control claims advisor escalation or abstention exists.
2. The classifier returns a task type without calling a model.
3. With no decision transport settings, semantic decision code reports unconfigured and does not throw.
4. A platform admin can read /api/admin/model-rollout; others get a refusal.
5. SLO catalogue chat objective reads only served rows, not shadow rows.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the brief says not applicable everywhere, no acceptance test should require these features [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide per item whether it is out of scope for good or planned, and update the brief.
- [proposed] If an evaluation dashboard is wanted, build it on routing_decision_traces and the existing observability panels.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | classifyTaskLocally | `packages/ai/routing/src/classify.ts` | Heuristic classifier; header states no model fallback. |
| service | task family routing | `packages/ai/routing/src/task-family.ts` | Listed by the brief for classification fallback (not opened). |
| service | CLI classify | `apps/cli/src/routing/classify.rs` | CLI classifier (listed by the brief; not opened). |
| service | Decision provider transport | `packages/ai/provider-runtime/src/typesafe-decisions.ts` | Wraps an external semantic decision client as a DecisionProvider. |
| config | decision transport config | `apps/web/lib/services/semantic-decisions/config.ts` | Reads settings, validates host, never defaults an endpoint. |
| service | turn signals shadow | `apps/web/lib/services/semantic-decisions/turn-signals.ts` | Shadow turn signals; leaves an explicitly named model alone (53). |
| service | semantic trace service | `apps/web/lib/services/semantic-decisions/trace-service.ts` | Persists semantic decision traces (uses rollout-evaluation-service). |
| service | response assessment in trace | `packages/ai/routing/src/routing-trace.ts` | RoutingResponseAssessmentTrace type (21-35). |
| service | request processor assessment | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Runs assessSemanticResponseBudget (4717) and shadow signals (4890+). |
| table | routing_decision_traces | `apps/web/db/neon/0212_routing_decision_traces.sql` | Data for the evaluation views. |
| service | rollout evaluation | `apps/web/lib/services/model-rollout/rollout-evaluation-service.ts` | Benchmarks per stage and cohort; retention deletes. |
| job | evaluate-model-rollout cron | `apps/web/app/api/cron/evaluate-model-rollout/route.ts` | Scheduled by vercel.json:182. |
| endpoint | GET /api/admin/model-rollout | `apps/web/app/api/admin/model-rollout/route.ts` | Operator data for the rollout tab; requirePlatformAdmin. |
| component | ModelRolloutPanel | `apps/web/features/admin/components/ModelRolloutPanel.tsx` | Operator tab 'Model rollout'. |
| screen | OperatorDashboardPage | `apps/web/features/admin/pages/OperatorDashboardPage.tsx` | Hosts the rollout tab. |
| config | observability dashboards | `apps/web/lib/observability/dashboards.ts` | 'Model routing' panels (847). |
| config | SLO catalogue | `apps/web/lib/server/slo/catalogue.ts` | Objectives measured from routing_decision_traces. |
| other | semantic decisions spec | `docs/specs/semantic-decisions/system-design.md` | Describes bounded semantic decisions and limits. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The heuristic classifier runs locally and returns a task type; no model is called. | device and our servers | packages/ai/routing/src/classify.ts:1-12 (runs wherever the routing package runs: server for Cloud, local for CLI) |
| On Cloud, the server may run response assessment and shadow turn signals through a configured external decision service. | outside service | typesafe-decisions.ts:1-60; semantic-decisions/config.ts:24-60 |
| Trace rows are written for each Cloud decision and a cron computes rollout benchmarks. | our servers | routing-decision-trace-service.ts:167; rollout-evaluation-service.ts |
| A platform admin opens the rollout tab and the page reads the admin endpoint. | our servers | app/api/admin/model-rollout/route.ts:50-66 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Trace rows and rollout benchmarks | tables routing_decision_traces and model_rollout_benchmarks | Server only | Traces deleted after the retention window; benchmarks: unknown |
| Semantic decision traces | unknown table (trace-service.ts not opened in full) | Server only | unknown |

**Models and providers.** The decision transport uses an external service named by settings; the model name and price come from settings, not code (config.ts:11-34). Routing models come from the Auto policy.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Admin views need a platform admin (requirePlatformAdmin, route.ts:53). |
| Permissions | Rate limited under 'admin-operator' (route.ts:51). |
| Subscription | none found in the code |
| Limits and metering | Decision calls are costed from a configured price and recorded as cents (config.ts:62-72). |
| Feature flags | AGI_ROUTING_OBSERVED_HEALTH, AGI_ROUTING_CANARY, AGI_ROUTING_SHADOW are shown on the operator tab (auto.ts:766-784). |
| Model compatibility | not applicable |
| Provider restrictions | Decision host must be in an allowed host list (config.ts:36-47). |
| Local mode | These server pieces never run for Local turns (traces are Cloud only, request-processor.ts:4876). The CLI classifier runs on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Decision transport unset | Reads as unconfigured; nothing throws. | config.ts:24-40 |
| Invalid base URL or price | Logged and treated as unconfigured. | config.ts:41-55 |
| Classifier ambiguous | Returns advisory confidence; callers use type only. | classify.ts:11-13 |
| Non-admin opens the admin endpoint | Refused by requirePlatformAdmin. | route.ts:53 |
| Trace table missing (draft migration) | Write fails, logged, turn continues. | routing-decision-trace-service.ts:186-195; migration header |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/classify.test.ts`: Heuristic classifier (file name).
- `apps/web/lib/services/semantic-decisions/__tests__/turn-signals.test.ts`: Turn signals shadow (file name).
- `apps/web/lib/server/slo/__tests__/anomaly.test.ts`: Anomaly checks reading routing traces (file references the table).
- `apps/web/lib/observability/__tests__/dashboard-panels-resolve.test.ts`: Dashboard panels resolve (references routing decision metric).
- `apps/web/app/api/cron/evaluate-model-rollout/route.test.ts`: Rollout cron route.
- `apps/web/lib/services/model-rollout/__tests__/rollout-evaluation.test.ts`: Rollout benchmark evaluation.

**Test scenarios**

- **No advisor path**
  1. Search the routing and chat code for a call from a worker model to a second model for advice.
  - Expected: None found; matches the brief.
- **Unconfigured decision transport**
  1. Start the web server with the four decision settings unset.
  2. Send a Cloud turn.
  - Expected: Turn works; semantic decision code reports unconfigured.
- **Operator tab**
  1. Sign in as platform admin; open Operator dashboard, rollout tab.
  - Expected: Stage flags, slots, benchmarks shown.
- **Non-admin**
  1. Call GET /api/admin/model-rollout as a normal user.
  - Expected: Refused.

**Where to look when it fails**

- Log '[semantic-decisions] configured base URL is not an admitted decision host'.
- routing_decision_traces rows by outcome.
- Cron route logs for evaluate-model-rollout.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says no routing evaluation dashboard; code has an operator rollout tab, observability panels and SLO objectives built from traces.** Affects: Operators; knowledge base accuracy. Evidence: OperatorDashboardPage.tsx:487; dashboards.ts:847; slo/catalogue.ts:66. Work needed: Update the brief status to partial.
- **No advisor escalation, abstention or classifier adapter in routing.** Affects: All apps. Evidence: classify.ts:1-12; no matching code found. Work needed: Product decision, then design.
- **Decision transport exists but is not a classifier adapter for Auto.** Affects: Cloud (web server). Evidence: docs/specs/semantic-decisions/audit.md model routing row. Work needed: Spec says shadow first; follow its plan.
- **Trace table migration header still says not applied.** Affects: Operators. Evidence: 0212_routing_decision_traces.sql:1-5. Work needed: Confirm and correct the header.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-observability-and-operations
- SYS-inference-providers
- SYS-data-model-and-migrations
- F079-08
- table:routing_decision_traces
- api:GET /api/admin/model-rollout
- file:packages/ai/routing/src/classify.ts

## Unknown

- Whether the semantic decision transport is configured in any environment.
- Which table semantic decision traces use.
- Whether model_rollout_benchmarks has a retention rule.
- Whether the 0212 migration is applied in production.
- How the CLI and the packages classifier fall back on failure (S79.30 files not opened).
- Which provider hosts the decision transport.
