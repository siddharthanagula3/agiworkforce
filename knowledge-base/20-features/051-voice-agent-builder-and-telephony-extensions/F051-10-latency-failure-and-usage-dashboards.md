---
id: "F051-10"
type: "feature"
title: "Latency, failure and usage dashboards"
aliases: ["Latency, failure and usage dashboards", "S51.20 Latency and failure dashboards", "S51.21 Usage and billing", "call analytics", "call minutes billing"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.20", "S51.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "F051-08", "F051-09", "table:managed_usage_requests", "table:usage_events", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-voice-and-media", "SYS-model-catalog-and-routing", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-10 Latency, failure and usage dashboards

A planned feature that would show latency and failure rates for a voice agent and meter call minutes and costs for billing. Not built on web, desktop, mobile or the API. A minute-based billing pattern exists only for in-app live voice, not for phone calls.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.20](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5120), [S51.21](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5121).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would give an owner a dashboard of how fast and how reliably an agent's calls run, and show metered call minutes and cost so they match the bill. Today neither exists for calls (audit/ledger/ecosystem-capability-ledger.jsonl:1680-1681).

**Why it exists.** Phone callers notice delay and dropped calls, and owners pay by usage. The brief asks for a dashboard and for metering (S51.20, S51.21 in data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md).

**Who uses it.** Owners, admins and finance contacts of voice agents. Not CLI, VS Code, Chrome (ledger n/a).

**Problems it solves**

- Slow or failing calls go unseen [inferred].
- Owners cannot predict call cost [inferred].
- Billing for minutes would be unexplained [inferred].

**Use cases**

- An owner sees that answer delay rose after a change and rolls back (F051-11) [proposed].
- A manager checks this month's call minutes against the plan [proposed].
- An admin compares failure rates across agents [proposed].

## 2. User experience

**Where to find it**

- Web: not present (audit/ledger/ecosystem-capability-ledger.jsonl:1680-1681).
- Desktop: not present; it shows the hosted web app.
- Mobile: not present.
- CLI, VS Code, Chrome: not applicable.
- Nearest existing screen: account Billing and Usage for chat usage, described in docs/product/definition.md:287.

**Before you start**

- None can be met today.
- Intended [proposed]: a voice agent with call history (F051-09).

**Screens and controls**

- No call dashboard or call usage control exists.
- Intended [proposed]: charts for latency and failure rate, a minutes and cost table, a time-range picker.

**Journey**

1. Today: not possible.
2. Intended [proposed]: 1 open an agent; 2 open Analytics; 3 pick a time range; 4 read latency and failure charts; 5 open Usage to see minutes and cost.

**What the person sees and gets**

- Nothing today.
- Intended: latency and failure numbers, minutes and cost lines.

**Settings**

- none found in the code. The time window and billing unit are unspecified in the brief.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- In-app live voice (not phone) reserves usage one minute at a time and settles at the real use (apps/web/lib/voice/live-voice-billing.ts:21-27).
- Live voice session cost comes from a per-minute figure in the model catalog (apps/web/lib/voice/live-voice-billing.ts:42-48 and packages/contracts/types/src/model-catalog.ts:679).
- Live voice checks the plan and resolves an entitlement bundle before a session (apps/web/app/api/voice/live/sessions/route.ts:289-311).
- Free plans have a voice allowance in seconds (apps/web/lib/voice/free-voice-allowance.ts:47).

**Incomplete**

- The live voice metering is not wired to phone calls because no phone calls exist.

**Present but disconnected or switched off**

- The endpoint POST /api/usage/deduct is retired and answers 410 ENDPOINT_RETIRED, saying usage is recorded by managed operations (apps/web/app/api/usage/deduct/route.ts:23-30).

**Not available**

- Latency and failure dashboard (S51.20) missing on web, desktop, mobile; brief lists no API status for it, and the ledger marks the API n/a because no call data exists (audit/ledger/ecosystem-capability-ledger.jsonl:1680).
- Call usage and billing (S51.21) missing on web, desktop, mobile and the API (audit/ledger/ecosystem-capability-ledger.jsonl:1681).

## 4. Required behaviour

**Established requirements**

- A dashboard shows voice-agent call latency and failure rates. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.20)
- Voice-agent call minutes and costs are metered and shown for billing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.21)
- Every subscription capability on every app connects to one AGI Subscription system (entitlements, usage accounting, quotas, limits). (source: task requirements for the product; accounting code in apps/web/db/neon/0056_managed_usage_request_lifecycle.sql)
- Rate limits are configuration, not constants. (source: AGENTS.md section 8)

**Acceptance criteria**

1. A dashboard shows latency and failure rate for a chosen agent and time range.
2. Minutes shown on the dashboard equal the minutes billed for the same range.
3. Call minutes draw from the same usage system as chat and live voice, not a private copy.
4. A failed call is counted as a failure and its minutes billed or waived by a stated rule.
5. An account without voice entitlement sees no call dashboard.
6. The Free plan view shows only Upgrade, never meters, if the product rule for Free usage screens applies (owner memory note: free-usage-upgrade-only).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The minute-block reserve-and-settle pattern in live voice is the likely model for call minutes [inferred].
- Latency metrics need timestamps captured on the server per turn [inferred].

**Proposed improvements** (suggestions, not requirements)

- Define the time window (for example 7 and 30 days) and the billing unit (per started minute or per second) before building [proposed].
- Reuse managed_usage_requests for reserve and settle rather than a new ledger [proposed].
- Show percentiles, not only averages, for latency [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | S51.20 and S51.21 with status missing. |
| other | Capability ledger rows | `audit/ledger/ecosystem-capability-ledger.jsonl` | Lines 1680-1681. |
| service | Live voice billing | `apps/web/lib/voice/live-voice-billing.ts` | Minute-block reserve and settle for in-app live voice; adjacent pattern. |
| service | Free voice allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free plan voice seconds; shows how plan limits for voice are held. |
| service | Live voice backend cost | `apps/web/lib/voice/live-voice-backend-cost.ts` | Cost sizing for the model behind a live voice session. |
| endpoint | Live voice sessions route | `apps/web/app/api/voice/live/sessions/route.ts` | Entitlement and budget checks before a voice session. |
| endpoint | Live voice close route | `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` | Settles a session on close. |
| endpoint | Live voice extend route | `apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.ts` | Reserves the next minute block. |
| table | managed_usage_requests | `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql` | Reserve, start, complete, release lifecycle for metered requests (line 13). |
| table | usage_events | `apps/web/db/neon/0016_misc.sql` | Generic usage event log (line 48). |
| endpoint | Usage routes | `apps/web/app/api/usage/route.ts` | Existing usage read endpoint family (limits, history, export folders beside it). |
| endpoint | Retired usage deduct route | `apps/web/app/api/usage/deduct/route.ts` | Returns 410 ENDPOINT_RETIRED. |
| config | Per-minute cost field | `packages/contracts/types/src/model-catalog.ts` | Line 679: sessionPerMinuteCost in model metadata. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No call latency or call minutes are measured or shown today. | our servers | audit/ledger/ecosystem-capability-ledger.jsonl:1680-1681 |
| For in-app live voice, the server resolves the plan entitlement, checks that the plan allows voice, and reserves a block of minutes before the session starts. | our servers | apps/web/app/api/voice/live/sessions/route.ts:289-311 |
| The session settles at actual seconds used; an idle session is closed after a lease window and settled. | our servers | apps/web/lib/voice/live-voice-billing.ts:29-34 |
| Intended [proposed]: the same reserve and settle runs per phone call, and per-turn timings are stored for the dashboard. | our servers | none; proposed, no code |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Managed usage request rows (reservation, cost, status) for metered work | table public.managed_usage_requests | unknown | unknown; erasure touches managed usage per apps/web/lib/server/account-erasure.ts |
| Call latency samples and call minutes | none found in the code | not applicable | not applicable |

**Models and providers.** A live voice session uses a backend model chosen by plan from the catalog and a per-minute session cost from catalog metadata (apps/web/app/api/voice/live/sessions/route.ts:319; packages/contracts/types/src/model-catalog.ts:679). Phone calls have no model route yet.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for call dashboards. Live voice requires an authenticated user (apps/web/app/api/voice/live/sessions/route.ts:10 imports getClerkAuthUser). |
| Permissions | none found in the code for call dashboards. |
| Subscription | For live voice, plan must allow voice via getTierPolicy(planTier).allowVoice (apps/web/app/api/voice/live/sessions/route.ts:311). Nothing for phone calls. |
| Limits and metering | Live voice meters in one-minute blocks with a 10-minute idle lease (apps/web/lib/voice/live-voice-billing.ts:21-34). Free plans have a seconds allowance (apps/web/lib/voice/free-voice-allowance.ts:47). Nothing for phone calls. |
| Feature flags | none found in the code. |
| Model compatibility | Live voice needs a backend marked as a live model; otherwise it throws (apps/web/app/api/voice/live/sessions/route.ts:319-321). |
| Provider restrictions | unknown for phone calls. |
| Local mode | Not available. Call metering needs our servers. Local inference stays free of paid subscription as a product rule; no phone call runs locally [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No loading, empty, error, retry or offline states exist for call dashboards. | audit/ledger/ecosystem-capability-ledger.jsonl:1680-1681 |
| Live voice idle session | Closed after the lease and settled where the tab last renewed it. | apps/web/lib/voice/live-voice-billing.ts:29-34 |
| Free voice allowance used up | A typed error with a reset time is raised for live voice. | apps/web/lib/voice/free-voice-allowance.ts:271 |
| Dashboard empty state, time zone, partial data | not handled in the code; no dashboard exists. | searched, no call dashboard files |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/voice/__tests__/live-voice-billing.test.ts`: Minute-based cost and charge math for live voice sessions.
- `apps/web/lib/voice/__tests__/free-voice-allowance.test.ts`: Free plan voice allowance.
- `apps/web/lib/voice/__tests__/live-voice-backend-cost.test.ts`: Backend cost sizing for live voice.
- `apps/web/app/api/usage/limits/route.test.ts`: The usage limits route for chat usage; not calls.

**Test scenarios**

- **Confirm absence**
  1. Search the web app for an Analytics or Usage view on a voice agent.
  - Expected: None found.
- **Reference behaviour: live voice minutes**
  1. Start in-app live voice on a plan that allows it.
  2. Talk for over a minute.
  3. Close and open usage.
  - Expected: Usage reflects settled seconds, not a full block.
- **When built: minutes match bill**
  1. Place three test calls.
  2. Compare dashboard minutes with the usage statement.
  - Expected: Equal.
- **When built: failure rate**
  1. Force a failed call.
  2. Open the dashboard.
  - Expected: Failure count rises by one.
- **When built: Free plan**
  1. Open the dashboard on Free.
  - Expected: Upgrade prompt only, if the Free rule applies.

**Where to look when it fails**

- Live voice errors come from the sessions routes under apps/web/app/api/voice/live/sessions.
- Check managed_usage_requests status values (reserving, reserved, provider_started, completed, released, outcome_unknown, declined) in apps/web/db/neon/0056_managed_usage_request_lifecycle.sql.
- Nothing was run for this page; no result is claimed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No latency or failure dashboard.** Affects: Owners on web, desktop, mobile. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1680. Work needed: Capture per-turn timings and outcomes, add an API and a dashboard.
- **No call minute or cost metering or billing view.** Affects: Owners, billing, all apps. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1681. Work needed: Connect calls to the managed usage lifecycle and show the result.
- **Time window and billing unit unspecified.** Affects: Product and billing. Evidence: S51.20 and S51.21 give none. Work needed: Decide and document.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- F051-08
- F051-09
- table:managed_usage_requests
- table:usage_events
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-voice-and-media
- SYS-model-catalog-and-routing
- mode:cloud

## Unknown

- Time window and billing unit.
- Whether call minutes will be priced per plan or by credits.
- Where latency would be measured (carrier edge or server).
- Whether a dashboard would use the dashboard artifact type or a native page.
- Whether phone calls will reuse the live voice backend model route.
