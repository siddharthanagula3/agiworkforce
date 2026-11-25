---
id: "F100-02"
type: "feature"
title: "Limits, rate and spend controls"
aliases: ["Limit/quota resolver (S100.04)", "Rate-limiting service (S100.11)", "Concurrency-limiting service (S100.12)", "Budget manager (S100.13)", "rolling 5-hour and weekly limit", "concurrent_turn_limit_reached", "organization spend limit", "personal spend limit", "Monthly spend limit"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.04", "S100.11", "S100.12", "S100.13"]
depends_on: ["F100-01", "F100-03", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "table:organization_spend_limits", "table:personal_spend_limits", "file:apps/web/lib/rate-limit.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-02 Limits, rate and spend controls

Stops usage that the plan or budget does not allow. Managed requests are checked against rolling 5-hour, weekly and monthly windows, request rate, concurrent responses and spend caps before a model runs. A refused request says which limit was hit and, where known, when it resets.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.04](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10004), [S100.11](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10011), [S100.12](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10012), [S100.13](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10013).

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

**What it does.** Refuses or admits each managed Cloud request using plan windows (rolling session, weekly, flagship weekly, billing period), request rate limits shared across server instances, a per-plan count of concurrent responses, daily and monthly unit quotas, and three kinds of spend cap (workspace block, workspace policy cap, personal cap on extra credits).

**Why it exists.** Managed usage costs real money per call, so each account must be held to what its plan pays for, and a workspace owner must be able to cap spend (S100.04, S100.11, S100.12, S100.13 in the area brief).

**Who uses it.** Every signed-in person using Cloud mode on any app; workspace owners and admins who set budgets; engineers who tune plan limits.

**Problems it solves**

- One person exhausting shared capacity or running unlimited parallel responses.
- Surprise spend on a workspace or on personal extra credits.
- Unclear refusals: each refusal has a code, text and reset context (managed-usage-request-service.ts:402-467, 560-598).

**Use cases**

- A Premium user sends many long chats and hits the rolling 5-hour limit; the reply names it and offers the reset time.
- A Free user with one concurrent response sends a second message while the first still streams and is told to stop or wait (turn-slot.ts:34-48).
- A workspace admin sets a monthly limit with mode Block; members' managed turns are refused with over_cap until the month resets or the cap is raised.
- A person turns on usage credits and sets a personal Monthly spend limit for extra usage.

## 2. User experience

**Where to find it**

- Web: Settings > Usage with cards 'Plan usage limits', 'Credit balances', 'Resets', 'Monthly spend limit' and meters 'Current session', 'This week', 'Most capable models', 'This billing period' (apps/web/features/settings/sections/UsageSection.tsx:414, 491, 710, 1312-1396; packages/contracts/types/src/usage-vocabulary.ts:37-59).
- Web workspace console: a spend limit card with an enforcement select that offers Notify and Block (apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:189, 264-270).
- Desktop: the same web screens in the hosted app.
- Mobile: refusal is shown in the chat screen as a paywall presentation (apps/mobile/app/(app)/chat/[id].tsx:511; apps/mobile/services/failureCopy.ts:60).
- CLI: refusal text with the limit name and reset (apps/cli/src/usage_summary.rs:217; apps/cli/src/models/streaming.rs:217).
- VS Code: a usage-limit error with a reason and recovery (apps/extension-vscode/src/utils/api.ts:875-882).
- Chrome: side panel maps limit codes to a session or weekly window (apps/extension/src/features/side-panel/usageWindows.ts:42-53).

**Before you start**

- A signed-in account using Managed Cloud. Local and own-key use are not metered by this server path [inferred, see access_and_usage].
- To set a workspace limit: a team admin with the policy.manage permission (apps/web/app/api/settings/organization/spend-limit/route.ts:68-79).

**Screens and controls**

- Usage meters per window with urgency levels at 90 and 95 percent (usage-vocabulary.ts:14-17).
- Workspace spend limit: monthly cap in credits, enforcement Notify or Block, alert threshold percent (spend-limit route PutSchema; WorkspaceSpendLimit.tsx:264-270).
- Personal Monthly spend limit: a whole number of credits (apps/web/app/api/settings/spend-limit/route.ts:25-29).
- Free accounts see 'Upgrade for higher capacity' instead of plan meters (UsageSection.tsx:1313).

**Journey**

1. Send a message in any app.
2. The server checks rate, then resolves the plan, then the workspace budget, then takes a turn slot, then reserves usage against the windows.
3. If any check refuses, the app shows the refusal text and, for plan windows, the reset time and a suggested alternative model.
4. Otherwise the turn runs (see F100-03).

**What the person sees and gets**

- Refusal texts for the 5-hour, weekly, flagship weekly and monthly windows (managed-usage-request-service.ts:431-467).
- Refusal text names the limit (for example 'Your 5-hour usage limit') and mentions usage credits where relevant (managed-usage-request-service.ts:513-558).
- limitContext with resetsAt and an alternative model is attached when readable (managed-usage-request-service.ts:573-596).
- Concurrent limit: HTTP 429 code concurrent_turn_limit_reached with headers X-AGI-Concurrent-Turn-Limit and X-AGI-Concurrent-Turns-Active (turn-slot.ts:14-47). Limiter down: HTTP 503 with Retry-After 30 (turn-slot.ts:20-32).
- Request rate: HTTP 429 RATE_LIMIT_EXCEEDED with reset time and Retry-After (rate-limit.ts:1234-1296).

**Settings**

- Workspace spend limit (cap, enforcement, alert threshold).
- Personal Monthly spend limit.
- Usage credits on or off (usageCreditsEnabled, managed-usage-request-service.ts:715).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Plan window refusals map decision codes to HTTP 429 or 402 and error codes rolling_five_hour_limit_reached, rolling_weekly_limit_reached, flagship_weekly_limit_reached, insufficient_credits (managed-usage-request-service.ts:402-467).
- Rolling windows are 5 hours and 7 days (apps/web/lib/server/capability-limit-resets.ts:7-8). Session, weekly and flagship caps come from the plan and catalog version (apps/web/lib/server/managed-usage-policy.ts:168-182; packages/contracts/types/src/managed-usage-limits.ts:31).
- Clients classify limit codes into kinds with upgrade and reset hints (packages/contracts/types/src/billing-catalog.ts:864-1022).
- Rate limits use a shared Redis store with a per-instance fallback, and production refuses to start without Redis credentials (apps/web/lib/rate-limit.ts:20-32, 1150-1226).
- Tier scaling of rate limits exists for chat, image, video, voice and transcription keys by the plan's concurrent turn count (rate-limit.ts:934-966).
- Concurrent responses use a Redis sorted-set slot per turn with a 360 second age-out; a plan with limit 0 is refused; no limit means no slot (rate-limit.ts:1306-1420; turn-slot.ts:109-163).
- Every agent-turn entry point takes the slot through withManagedTurnSlot, including approve and resume routes (turn-slot.ts:96-108; apps/web/app/api/llm/v1/chat/completions/route.ts:1486).
- Free daily caps and monthly metered units (video seconds, voice minutes, computer use) are resolved from the tier policy and enforced by assertTierUnitAllowance (apps/web/lib/services/tier-unit-quota-service.ts:51-75, 298).
- Workspace budget gate: mode Block with spend at or over the cap refuses with code over_cap, HTTP 402; Off and Notify admit (spend-limit-service.ts:161-200; apps/web/lib/managed-compute-gate.ts:511-545).
- Workspace policy cap: a monthlySpendCapCents in the organization policy refuses at reservation with organization_spend_cap_reached, HTTP 402, and fails closed when the policy or spend cannot be read (managed-usage-request-service.ts:338-399).
- Personal limit: a ceiling on credits used past the plan, enforced in the database at admission, and a failure to read it fails the reservation (apps/web/db/neon/0378_personal_spend_limit.sql:11-25).
- Artifact (published app) calls are capped per app per 5 hours (managed-usage-request-service.ts:473-478 refusal artifact_runtime_limit_reached; reservationError at 440-444).

**Incomplete**

- The workspace block gate decides from a 60 second cached sum, so a workspace can overshoot by about one window of spend (apps/web/lib/services/spend-limit-service.ts:51-58).
- The workspace block gate fails open when its state cannot be read (spend-limit-service.ts:171-180; managed-compute-gate.ts:517-523), while the policy cap fails closed; the two behave differently by design or by accident, which is unknown.
- The rate limit for the main chat route does not pass the plan tier, so tier scaling does not apply there [inferred: auth-gate.ts:274 calls withRateLimit without a plan argument].

**Present but disconnected or switched off**

- AGI_RATE_LIMIT_SCALE widens limits and is ignored in production runtimes (rate-limit.ts:46-62).

**Not available**

- Whether the CLI, VS Code and Chrome apps send every refusal code to the person with the reset time is not established; they classify limit codes but per-app wording was not compared.

## 4. Required behaviour

**Established requirements**

- Per-plan limits and quotas (rolling windows, unit quotas) are resolved from the plan and applied when a request is admitted. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.04)
- A shared rate-limiting service limits requests per user, route and plan across instances. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.11)
- A concurrency limiter caps simultaneous managed turns per account according to plan. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.12)
- A budget manager holds spending limits and stops managed usage when a budget is reached. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.13)
- Managed Free is open in public alpha and the credit controls must keep pace with Free usage. (source: doc: docs/product/commercial.md (Managed Credit Requirements))
- The max_15x plan has no rolling 5-hour cap; a zero ceiling means zero permitted usage. (source: doc: docs/product/commercial.md (Plan Presentation And Usage Windows))
- Rate limits are configuration, not constants. (source: AGENTS.md section 8)

**Acceptance criteria**

1. A managed request that would exceed the rolling 5-hour cap is refused with HTTP 429 and code rolling_five_hour_limit_reached, and the response context carries a reset time when readable.
2. The weekly, flagship weekly and monthly windows each refuse with their own code and text.
3. With a plan concurrency of N, the (N+1)th simultaneous turn gets HTTP 429 concurrent_turn_limit_reached and a plan with no concurrency is refused with the upgrade message.
4. When the slot store is down and policy is fail-closed, the turn gets HTTP 503 with Retry-After 30.
5. A workspace in Block mode over its cap gets code over_cap; switching to Notify or raising the cap frees it at once because the cache is dropped on save.
6. A personal cap stops credit use past the plan ceiling at admission.
7. Exceeding a route's request rate gives HTTP 429 with a retry time.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The 5-hour and 7-day window lengths should be configuration, not literals, per AGENTS.md section 8 [inferred; they are constants at capability-limit-resets.ts:7-8].
- A turn slot must be released on every end path including client abort [inferred from turn-slot.ts:55-69].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the workspace Block gate fail closed or document why it fails open.
- [proposed] Pass the plan tier into the chat route rate limit so tier scaling applies there.
- [proposed] Compare the refusal wording on all six apps in one table test.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | managed-usage-request-service (refusals and windows) | `apps/web/lib/services/managed-usage-request-service.ts` | reservationError, PLAN_LIMIT_WINDOWS, planLimitRefusal, assertOrganizationSpendCap (lines 402, 473, 560, 338). |
| service | managed-usage-policy | `apps/web/lib/server/managed-usage-policy.ts` | Plan session, weekly and flagship caps (lines 168-182). |
| config | MANAGED_USAGE_LIMITS | `packages/contracts/types/src/managed-usage-limits.ts` | Per-plan allowances by catalog version (line 31, 89). |
| config | window lengths | `apps/web/lib/server/capability-limit-resets.ts` | ROLLING_SESSION_WINDOW_HOURS and ROLLING_WEEKLY_WINDOW_HOURS (lines 7-8). |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | Free daily caps, monthly voice, video and computer-use quotas, downloads (lines 51, 298, 485). |
| service | rate-limit | `apps/web/lib/rate-limit.ts` | withRateLimit, resolveTierRateLimit, acquireManagedTurnSlot (lines 1234, 961, 1366). |
| service | turn-slot | `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts` | withManagedTurnSlot and the 429 and 503 responses (lines 14, 109). |
| service | spend-limit-service | `apps/web/lib/services/spend-limit-service.ts` | evaluateSpendLimit, workspace and personal limits (lines 161, 245, 305). |
| service | managed-compute-gate | `apps/web/lib/managed-compute-gate.ts` | buildSpendLimitGateResponse returns 402 over_cap (line 511). |
| service | managed-compute-access | `apps/web/lib/services/managed-compute-access.ts` | withSpendLimit applies the workspace budget per organization (line 128). |
| endpoint | GET/PUT /api/settings/organization/spend-limit | `apps/web/app/api/settings/organization/spend-limit/route.ts` | Workspace spend limit read and write for admins with policy.manage. |
| endpoint | GET/PUT /api/settings/spend-limit | `apps/web/app/api/settings/spend-limit/route.ts` | Personal monthly spend limit. |
| table | organization_spend_limits | `apps/web/db/neon/0142_organization_spend_limits.sql` | Workspace cap, enforcement mode and alert threshold. |
| table | personal_spend_limits | `apps/web/db/neon/0378_personal_spend_limit.sql` | One optional personal ceiling per account, enforced in the reservation functions. |
| screen | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Web Settings > Usage meters, resets and Monthly spend limit. |
| component | WorkspaceSpendLimit | `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx` | Workspace admin spend limit card. |
| config | usage-vocabulary | `packages/contracts/types/src/usage-vocabulary.ts` | Meter labels Current session, This week, Most capable models, This billing period. |
| service | classifyManagedQuotaErrorCode | `packages/contracts/types/src/billing-catalog.ts` | Shared client mapping of limit codes to upgrade and reset hints (lines 864-1022). |
| service | chat route gates | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Order: auth gate (1477), turn slot (1486), spend gate (447). |
| command | CLI limit handling | `apps/cli/src/usage_summary.rs` | Maps limit codes to window names and reset context (line 217). |
| service | VS Code API error mapping | `apps/extension-vscode/src/utils/api.ts` | Classifies limit codes into AgiWorkforceUsageLimitError (lines 875-882). |
| service | Chrome usage windows | `apps/extension/src/features/side-panel/usageWindows.ts` | Maps limit codes to session or weekly (lines 42-53). |
| service | Mobile failure copy | `apps/mobile/services/failureCopy.ts` | Turns refusal codes into mobile wording (line 60). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends a chat request with a bearer token to the managed chat endpoint. | device | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:172-186 |
| Server applies the per-IP and per-user request rate limits against the shared Redis store. | our servers | auth-gate.ts:253-275; apps/web/lib/rate-limit.ts:1234-1296 |
| Server resolves the plan (see F100-01), serving a lapsed plan as Free. | our servers | auth-gate.ts:264-352 |
| Server takes a concurrent-turn slot for the plan or refuses with 429 or 503. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:1486; turn-slot.ts:109-130 |
| Server checks the workspace budget gate and, on reservation, the workspace policy cap. | our servers | route.ts:447; managed-usage-request-service.ts:773-780 |
| Server reserves estimated cost through a database function that holds the session, weekly and flagship caps under a per-user lock and returns a decision such as acquired, session_limit or weekly_limit. | our servers | managed-usage-request-service.ts:780-880 |
| On refusal the server reads the reset time and a standard-model alternative and returns the refusal. | our servers | managed-usage-request-service.ts:560-598 |
| Redis holds the rate counters and turn slots. | outside service | rate-limit.ts:20-32, 1366-1420 (Upstash or Vercel KV credentials) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rate limit counters and turn slots | Redis keys prefixed agi-rl and agi-turns | Shared across server instances; not synced to devices | Slots age out after 360 seconds (rate-limit.ts:1306); counters expire with their window |
| Workspace spend limit | table organization_spend_limits | Server only | Deleted by deleteSpendLimit (spend-limit-service.ts:272-283) |
| Personal spend limit | table personal_spend_limits (cascade on profile delete) | Server only | Deleted with the account or by deletePersonalSpendLimit (spend-limit-service.ts:350-360) |
| Spend decision cache | in-memory per server instance, 60 seconds | No | Dropped on limit save (spend-limit-service.ts:262-263) |
| Audit events admin_policy_changed and spend_cap_exceeded | audit store via recordAuditEvent | Server only | unknown |

**Models and providers.** The rolling limits count cost, and the flagship weekly cap applies when the chosen model is flagged flagship, so model choice affects which window is charged (managed-usage-request-service.ts:792-799). The refusal can suggest a standard model (PLAN_LIMIT_WINDOWS alternative, lines 473-501). Which models are flagship is owned by SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account with a bearer token or API key (auth-gate.ts:172-186). |
| Permissions | Setting a workspace limit needs team admin access and the policy.manage permission (apps/web/app/api/settings/organization/spend-limit/route.ts:68-79). The personal limit needs only the account holder (settings/spend-limit/route.ts:43-60). |
| Subscription | Limits come from the plan the resolver returns. Free accounts hold the Free window and caps; lapsed paid plans are served as Free (auth-gate.ts:343-352). Concurrent responses by plan: product limits table (billing-catalog.ts:580-731). |
| Limits and metering | Windows: 5 hours, 7 days, billing period (capability-limit-resets.ts:7-8; usage-vocabulary.ts:37-59). Free daily caps and monthly units are in FREE_DAILY_CAPS and the tier policy (billing-catalog.ts:484-490; tier-unit-quota-service.ts:51-75). The numbers live in configuration, not in this feature. |
| Feature flags | AGI_RATE_LIMIT_SCALE (non-production only), AGI_RATE_LIMIT_CLIENT_IP_SOURCE, Redis credentials (rate-limit.ts:20-62, 1066-1080). Feature flags for limits: none found in this read. |
| Model compatibility | Flagship models draw on a separate weekly share (FLAGSHIP_OF_WEEKLY_BUDGET_RATIO, managed-usage-limits.ts:27). Free users are limited to free models in the plan line 'A usage allowance, free models only' (apps/mobile/src/features/settings/plans/index.tsx:57-60). |
| Provider restrictions | none found in the code for plan limits; provider cost is tracked separately (see F100-03). |
| Local mode | none found in the code: these checks run only on the server's managed Cloud path. The local-only and byok plans have unlimited concurrent turns in the limits table (billing-catalog.ts:583-615). Whether local or own-key turns reach any of these checks is unknown; see SYS-local-inference and SYS-execution-boundaries. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Rate limiter store down | Security-sensitive keys fail closed (block 60 seconds); others fail open with a warning. A quota-exhausted store falls back to per-instance counting. | apps/web/lib/rate-limit.ts:1195-1226 |
| Slot store down | Follows the Redis outage policy: fail-open admits with no recorded slot, fail-closed returns 503 Retry-After 30. | rate-limit.ts:1327-1346; turn-slot.ts:20-32 |
| Streaming turn outlives the handler | The slot is released only when the stream ends, errors or is cancelled. | turn-slot.ts:55-94 |
| Window reset time unreadable | Refusal is sent without context. | managed-usage-request-service.ts:588-596 |
| Workspace spend state unreadable | Block gate treats the request as ungoverned; the policy cap returns 503 billing_unavailable. | spend-limit-service.ts:171-180; managed-usage-request-service.ts:343-368 |
| Same idempotency key sent twice | 409 idempotency_in_progress, idempotency_replay or idempotency_conflict. | managed-usage-request-service.ts:403-425 |
| Usage credits on or off | Refusal text changes to offer turning credits on or buying more where the account can. | managed-usage-request-service.ts:513-558 |
| Offline or timeout on the app | not handled in this feature's code; limiter calls race an 800 ms timeout and treat a slow limiter as unavailable. | rate-limit.ts:971-975 |
| Accessibility | Usage meters carry an aria-label such as '<label> usage' or 'usage unavailable'. | UsageSection.tsx:326 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-usage-request-service.test.ts`: By file name: reservation and refusal behaviour. Contents not read.
- `apps/web/lib/services/tier-unit-quota-service.test.ts`: By file name: unit quotas. Contents not read.
- `apps/web/lib/services/__tests__/spend-limit-service.test.ts`: By file name: workspace and personal spend limit. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-request-service.spend-cap.test.ts`: By file name: the policy spend cap at reservation. Contents not read.
- `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.test.ts`: Includes a check of the Retry-After value 30 (line 55); the rest not read.
- `apps/web/lib/__tests__/rate-limit.test.ts`: By file name: rate limit behaviour. Contents not read.
- `apps/web/db/neon/personal-spend-limit-migration.test.ts`: By file name: the personal limit migration. Contents not read.
- `apps/web/__tests__/billing/managed-usage-rolling-cap-migration.test.ts`: By file name: rolling cap database functions. Contents not read.
- `apps/web/lib/services/__tests__/managed-usage-request-service.artifact-cap.test.ts`: By file name: per-app artifact cap. Contents not read.
- `apps/web/lib/server/managed-usage-policy.test.ts`: By file name: plan caps. Contents not read.

**Test scenarios**

- **Hit the rolling 5-hour limit**
  1. Use an account on a paid plan in a test environment.
  2. Send managed turns until the 5-hour cap is reached.
  3. Read the next response in web, CLI and mobile.
  - Expected: HTTP 429 code rolling_five_hour_limit_reached; text names the 5-hour limit; reset time shown when available.
- **Concurrent response ceiling**
  1. On a plan with concurrency 1, start a long streaming reply.
  2. Send a second message before it ends.
  3. Stop the first reply and retry.
  - Expected: Second send gets 429 concurrent_turn_limit_reached with the active and limit headers; after stopping the first it succeeds.
- **Workspace Block cap**
  1. As admin with policy.manage, set a small monthly cap with enforcement Block.
  2. Have a member send managed turns until spend passes the cap.
  3. Raise the cap.
  - Expected: Member turns are refused with 402 over_cap, then admitted at once after the cap is raised.
- **Limiter outage**
  1. Make the turn slot store unreachable in a non-production environment with fail-closed policy.
  2. Send a managed turn.
  - Expected: HTTP 503 with Retry-After 30 and code concurrency_limiter_unavailable.
- **Personal cap on extra credits**
  1. Turn on usage credits and set a personal Monthly spend limit.
  2. Use credits past the plan until the limit is reached.
  - Expected: Admission refuses further credit use; the plan windows still apply.

**Where to look when it fails**

- Log lines 'Concurrent-turn ceiling reached; rejecting turn', 'GOV-3: concurrent-turn ceiling unenforceable', 'Rate limit exceeded' and '[spend-limit] request refused by workspace budget'.
- Audit events spend_cap_exceeded and admin_policy_changed.
- Tables managed_usage_requests, organization_spend_limits, personal_spend_limits; response headers X-RateLimit-* and Retry-After.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Three different budget mechanisms exist with different failure behaviour (workspace block fails open and is cached; workspace policy cap fails closed; personal cap is exact in the database).** Affects: Workspace admins and testers. Evidence: spend-limit-service.ts:51-58, 161-200; managed-usage-request-service.ts:338-399; 0378_personal_spend_limit.sql:11-25. Work needed: Document which one the console controls and decide whether to merge or align them.
- **The brief points the budget manager at managed-usage-request-service.ts:471, which is only refusal text; the block gate is in spend-limit-service and managed-compute-gate.** Affects: Engineers following the brief. Evidence: managed-usage-request-service.ts:431-444; managed-compute-gate.ts:511. Work needed: Update the brief's code pointers.
- **Chat route rate limit is not plan scaled.** Affects: Paid users on high-concurrency plans. Evidence: auth-gate.ts:274; rate-limit.ts:961-966. Work needed: Confirm intent; pass plan tier if scaling is wanted.
- **Window lengths are constants in code.** Affects: Plan changes that alter windows. Evidence: capability-limit-resets.ts:7-8. Work needed: Move to the plan configuration if windows ever differ by plan.
- **No evidence in this read that CLI, VS Code, Chrome and mobile show identical refusal wording and reset times.** Affects: surface:cli, surface:vscode, surface:chrome, surface:mobile. Evidence: Per-app handlers listed in the implementation map; wording not compared. Work needed: Run the same refusal through each app and compare.

**Depends on**

- F100-01
- F100-03
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- table:organization_spend_limits
- table:personal_spend_limits
- file:apps/web/lib/rate-limit.ts

## Unknown

- Whether Notify mode and the alert threshold send a notification to every admin (spend-alert-service was not read).
- Whether the workspace console offers an Off option in the enforcement select (only Notify and Block were seen).
- The actual limit numbers per plan (kept in configuration; not copied here).
- Whether Free requests use the same reservation function or the free-trial path (apps/web/lib/services/free-trial-service.ts:606) for window checks.
- Whether local or own-key turns reach any of these checks.
- Retention of audit events.
