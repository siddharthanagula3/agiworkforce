---
id: "F105-08"
type: "feature"
title: "Rate limits and budget caps"
aliases: ["Rate limits card", "Rate-limit inspection (S105.19)", "Budget controls (S105.20)", "Monthly spend limit", "Project monthly credit limit", "--max-budget-usd"]
area: "105 Developer platform and console"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.19", "S105.20"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-api-and-contracts", "SYS-observability-and-operations", "table:organization_spend_limits", "table:personal_spend_limits", "table:developer_projects", "api:PUT /api/settings/organization/spend-limit", "api:DELETE /api/settings/organization/spend-limit", "api:POST /api/llm/v1/chat/completions", "plan:team", "plan:enterprise", "F105-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-08 Rate limits and budget caps

The Developer console lists rate limits per endpoint, and responses carry X-RateLimit headers. A workspace owner sets a monthly credit cap that the gateway checks before each turn. A project cap refuses that project's API keys. The CLI has a per-session spend stop. Desktop shows the hosted web app.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.19](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10519), [S105.20](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10520).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows limits per gateway endpoint (apps/web/features/developers/components/RateLimitsPanel.tsx:27-58), returns X-RateLimit-Limit, -Remaining and -Reset headers (apps/web/lib/rate-limit.ts:1091-1093), lets a workspace admin set a monthly cap with Off, Notify or Block (apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:262-271), lets a project carry a monthly credit limit (apps/web/lib/developer-api/project-spend.ts:30-45), and lets a CLI run stop at a USD budget (apps/cli/src/lib.rs:489-492).

**Why it exists.** Developers need to pace clients before being refused, and owners need to bound spend that automated callers can run up. The migration says an owner asked to approve an AI budget wants a stop, not only a report (apps/web/db/neon/0142_organization_spend_limits.sql:3-6).

**Who uses it.** API developers (limits and project cap), workspace owners and admins on Team or Enterprise (workspace cap), CLI users running unattended jobs (budget flag).

**Problems it solves**

- Clients hitting 429 without warning (headers and the limits card).
- Runaway spend by a key or a workspace (project cap, workspace Block mode).
- Unattended CLI loops that cost more than intended (--max-budget-usd).

**Use cases**

- A developer reads that POST /chat/completions allows 30 requests per minute and reads the remaining count in the 'Try a request' result.
- An admin sets a cap of N credits with Block; members' Cloud turns are refused at the cap.
- A developer sets a monthly limit on a project; its keys then answer 429 project_spend_limit_reached.
- A CI user runs the CLI with --max-budget-usd so the agent stops at the cap.

## 2. User experience

**Where to find it**

- Web: /developers, card 'Rate limits' (apps/web/features/developers/components/DeveloperConsolePage.tsx:74; RateLimitsPanel.tsx:31).
- Web: /developers, card 'Try a request' shows 'N of M chat completion requests left in this window' (apps/web/features/developers/components/RequestPlayground.tsx:430-440).
- Web: /workspace/usage, card 'Monthly spend limit' (apps/web/app/workspace/usage/page.tsx:17; WorkspaceSpendLimit.tsx:190).
- Web: Settings, Usage, card 'Monthly spend limit' for the personal limit (UsageSection.tsx:694-711).
- Web: /developers, Projects card holds the project monthly limit (ProjectsPanel.tsx:90-98; label text not opened).
- CLI: flag --max-budget-usd (apps/cli/src/lib.rs:489-492).
- Desktop: hosted web app (doc: AGENTS.md section 5); no desktop source refers to spend-limit (grep found nothing).

**Before you start**

- Sign in.
- Workspace cap: a Team or Enterprise workspace and a role holding the policy.manage permission to change it (apps/web/app/api/settings/organization/spend-limit/route.ts:77-90; packages/contracts/types/src/billing-catalog.ts:362 team_admin tiers; packages/contracts/types/src/enterprise/permissions.ts:274-286).
- Project cap: an API key assigned to a project (apps/web/lib/developer-api/project-spend.ts:33-45).

**Screens and controls**

- Rate limits card: one row per endpoint with 'N requests per window, counted per account' or 'per account, or per IP address for an API key' (RateLimitsPanel.tsx:39-53).
- Workspace card: 'Cap (credits)' number, 'Alert at' percent, enforcement select Off, Notify, Block, 'Set limit' or 'Update limit', 'Remove limit' (WorkspaceSpendLimit.tsx:228-322).
- Block warning: 'Saving this starts refusing members' Cloud turns once the cap is reached...' (WorkspaceSpendLimit.tsx:278-288).
- Remove confirmation titled 'Remove the workspace spend limit?' with confirm label 'Remove limit' (WorkspaceSpendLimit.tsx:311-315).

**Journey**

1. Developer opens /developers and reads the Rate limits card.
2. Developer sends a request in 'Try a request' and reads remaining and reset time.
3. Admin opens /workspace/usage, enters a cap, an alert percent and a mode, then presses 'Set limit'.
4. Gateway turns are checked against the cap before credits are reserved (apps/web/app/api/llm/v1/chat/completions/route.ts:446-455).
5. At the cap in Block mode the gateway refuses with HTTP 402 and the message 'This workspace has reached its monthly spend limit...' (apps/web/lib/managed-compute-gate.ts:535-541; apps/web/lib/services/spend-limit-service.ts:181-188).

**What the person sees and gets**

- Headers X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset; Retry-After when refused (apps/web/lib/rate-limit.ts:1170-1177).
- Project cap refusal body: type insufficient_quota, code project_spend_limit_reached, project_id, reset_at, status 429 (project-spend.ts:73-85).
- Card copy per mode: 'Recorded only...', 'Crossing the cap is reported...', 'Managed turns stop at the cap, up to about a minute of spend late.' (WorkspaceSpendLimit.tsx:76-80).
- CLI: 'Budget cap reached: X used of Y. Stopping agent loop.' (apps/cli/src/agent/chat.rs:3691-3697).

**Settings**

- Workspace: monthly cap credits, alert threshold percent, enforcement mode (spend-limit/route.ts:40-46).
- Rate limits come from configuration with a scale factor (apps/web/lib/rate-limit.ts:77, :961-966).
- Project: monthly credit limit column (apps/web/db/neon/0321_developer_projects.sql:28).
- Personal: monthly limit in credits in Settings, Usage (UsageSection.tsx:641-646).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Rate limits card is built from configuration at the server and passed to the page (apps/web/app/developers/page.tsx:15-21; apps/web/lib/developer-api/rate-limit-summary.ts:6-25).
- Headers are attached to six gateway routes through withAdmittedRateLimitHeaders (chat completions route.ts:1527; models route.ts:327; embeddings route.ts:283; route/preview route.ts:201; credits/balance route.ts:144; audio/transcriptions route.ts:853).
- Workspace cap: GET, PUT, DELETE route with CSRF, rate limit, permission check and audit event (spend-limit/route.ts:56-175).
- Gateway checks the workspace cap before processRequest (chat/completions/route.ts:446-455).
- Project cap is checked for API-key requests in the chat gate and the transcription route (chat/completions/lib/auth-gate.ts:290-293; audio/transcriptions/route.ts:302).
- A crossing queues the webhook project.spend_limit_reached once per month (project-spend.ts:51-71).
- CLI: budget stops the turn loop and drops further tool calls (crates/agiworkforce-agent-core/src/engine.rs:80-91).

**Incomplete**

- The card shows static limits only; remaining calls appear only in response headers and in the playground line (RateLimitsPanel.tsx:39-53; RequestPlayground.tsx:430-440).
- The workspace cap is eventual, not exact: decisions are cached for 60 seconds (spend-limit-service.ts:58, :168-169), and the card says so (WorkspaceSpendLimit.tsx:79).
- The card's limits are computed without a plan tier, so they equal the base value times the scale (rate-limit-summary.ts:21; rate-limit.ts:961-966); the gateway's own user check also passes no tier (auth-gate.ts:273-275). Other routes may scale by plan; not checked.

**Present but disconnected or switched off**

- Notify and Off modes never refuse a turn (spend-limit-service.ts:150-155).
- The CLI budget event is written only when JSON events or JSON-line output is on (apps/cli/src/lib.rs:9244-9251, :9277).

**Not available**

- Workspace cap on Free, Basic, Pro, Max (team_admin tiers are team, team_premium, enterprise, billing-catalog.ts:362).
- Per-key rate limit settings: no match found.
- Mobile, VS Code, Chrome: n/a per brief; no code found for spend-limit in apps/mobile, apps/extension, apps/extension-vscode.

## 4. Required behaviour

**Established requirements**

- Developers can see their rate limits and how close they are to them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.19)
- An owner can set a spend cap that the API enforces. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.20)
- Block is the only mode that refuses; Notify and Off never do; a newly created limit defaults to Notify so saving a number never starts refusing work. (source: apps/web/db/neon/0142_organization_spend_limits.sql:7-14)
- Enforcement is eventual and the console says so. (source: apps/web/lib/managed-compute-gate.ts:494-499; WorkspaceSpendLimit.tsx:79)
- If the spend state cannot be read the request runs ungoverned. (source: apps/web/lib/managed-compute-gate.ts:517-524; apps/web/lib/services/spend-limit-service.ts:171-181)
- The budget is resolved against the funding organization, never the workspace the request picked. (source: apps/web/lib/managed-compute-gate.ts:505-509)
- Only a holder of policy.manage may change the cap; any change is audited, Block at critical severity. (source: apps/web/app/api/settings/organization/spend-limit/route.ts:77-130)

**Acceptance criteria**

1. The Rate limits card lists POST /chat/completions, GET /models, POST /embeddings, POST /audio/transcriptions and GET /credits/balance with limit and window.
2. A gateway response carries X-RateLimit-Limit, -Remaining and -Reset; a refused one also carries Retry-After.
3. A member without policy.manage sees the card read-only or not at all and PUT returns a refusal.
4. With enforcement Block and spend at or above the cap, a Cloud turn is refused with HTTP 402 before any credit is reserved.
5. With Notify, the same turn runs.
6. Raising the cap frees the workspace at once (cache is cleared on save).
7. A project with a monthly limit refuses its keys with 429 project_spend_limit_reached once spend reaches it; another project's keys still work.
8. The CLI stops with 'Budget cap reached' once --max-budget-usd is exceeded.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The Rate limits card and the gateway agree for chat completions because both read the base bucket without a plan tier.
- [inferred] --max-budget-usd uses the CLI's locally priced cost ledger, so it works in every privacy mode (apps/cli/src/usage_summary.rs:874-880 labels it 'priced locally').

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show live remaining and reset on the Rate limits card, using the headers already returned.
- [proposed] Make a failed cap lookup visible to the admin instead of silently running ungoverned.
- [proposed] Offer the project cap and the workspace cap on one page.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RateLimitsPanel | `apps/web/features/developers/components/RateLimitsPanel.tsx` | Renders limit rows and window text |
| service | developerRateLimits | `apps/web/lib/developer-api/rate-limit-summary.ts` | Maps five endpoints to rate-limit buckets |
| config | rateLimitConfigs and resolveTierRateLimit | `apps/web/lib/rate-limit.ts` | Limits, windows, fail-open or closed, plan scaling (lines 340-366, 701-710, 934-966) |
| service | checkRateLimit headers | `apps/web/lib/rate-limit.ts` | Builds X-RateLimit and Retry-After headers (lines 1091-1093, 1170-1177) |
| service | withAdmittedRateLimitHeaders | `apps/web/lib/rate-limit-headers.ts` | Copies admitted headers onto the final response |
| component | RequestPlayground remaining line | `apps/web/features/developers/components/RequestPlayground.tsx` | Reads the headers and shows 'N of M ... requests left' (lines 205-211, 430-440) |
| component | WorkspaceSpendLimit | `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx` | Cap form, modes, remove with confirmation |
| component | WorkspaceUsageAnalytics | `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx` | Hosts the card at /workspace/usage (line 377) |
| endpoint | GET/PUT/DELETE /api/settings/organization/spend-limit | `apps/web/app/api/settings/organization/spend-limit/route.ts` | Read and change the workspace cap |
| service | spend-limit-service | `apps/web/lib/services/spend-limit-service.ts` | readSpendState, evaluateSpendLimit with 60 s cache, upsert, delete, personal state |
| service | buildSpendLimitGateResponse | `apps/web/lib/managed-compute-gate.ts` | Returns 402 when Block and over cap; fail-open on errors (lines 511-541) |
| config | spend-limit bounds | `apps/web/lib/spend-limit-bounds.ts` | Min and max cap and alert percent |
| table | organization_spend_limits | `apps/web/db/neon/0142_organization_spend_limits.sql` | Stores cap, mode, threshold per workspace |
| table | personal_spend_limits | `apps/web/db/neon/0378_personal_spend_limit.sql` | Personal monthly limit |
| service | developerProjectSpendRefusal | `apps/web/lib/developer-api/project-spend.ts` | Project cap check, 429 body, webhook queue |
| table | developer_projects | `apps/web/db/neon/0321_developer_projects.sql` | monthly_credit_limit column (line 28) |
| service | developerProjectSpendMicrousd | `apps/web/lib/services/developer-usage-service.ts` | Month spend: actual cost for settled, estimate for unsettled (lines 82-107) |
| service | chat gate order | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Runs policy, spend and workspace controls before processRequest (lines 446-455) |
| service | API key auth gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | user rate limit and project cap for key calls (lines 273-293) |
| service | spend alert | `apps/web/lib/services/spend-alert-service.ts` | dispatchSpendAlertIfDue on crossing (line 40) |
| command | --max-budget-usd | `apps/cli/src/lib.rs` | Flag definition (489-492), sets session cap (6323, 9194) |
| service | turn loop budget | `crates/agiworkforce-agent-core/src/engine.rs` | Emits BudgetExceeded and stops tool calls (80-91, 284) |
| service | CLI budget message | `apps/cli/src/agent/chat.rs` | Prints cap reached and fires the JSON status event (3687-3704) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page server renders rate limits from configuration and passes them to the card. | our servers | apps/web/app/developers/page.tsx:15-21 |
| Each gateway call is counted in the bucket for its route; the response carries the headers. | our servers | apps/web/lib/rate-limit.ts:1270-1290, :1091-1093; chat/completions/route.ts:1527 |
| A key call is checked for the project cap, then the subscription lookup runs. | our servers | auth-gate.ts:290-297 |
| Before processRequest the gateway evaluates the workspace cap and returns 402 on Block and over cap. | our servers | chat/completions/route.ts:446-455; managed-compute-gate.ts:511-541 |
| An admin PUT stores the cap, clears the cached decision and writes an audit event. | our servers | spend-limit/route.ts:92-139; spend-limit-service.ts:272-275 |
| CLI: after each model response the engine compares cumulative cost to the cap and stops further tool calls. | device | crates/agiworkforce-agent-core/src/engine.rs:80-91 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Workspace cap, mode, alert threshold | Table organization_spend_limits | Read by the gateway; cached in server memory for 60 seconds | DELETE removes the row (spend-limit-service.ts:277-288) |
| Project monthly credit limit | developer_projects.monthly_credit_limit | Server only | Project archive behaviour not opened |
| Rate limit counters | Shared key-value limiter, or in memory when it is unavailable | Shared across servers when the limiter is configured | Window length from configuration |
| CLI session budget | Process memory and the local cost ledger | no | Per session |

**Models and providers.** The caps count credits regardless of model or provider. Credits come from provider cost converted by the managed ledger. Own-key (BYOK) and Local sessions never reach this gateway, so the workspace and project caps do not apply to them (doc: docs/product/definition.md not opened; code: AGENTS.md section 6 states the three modes are separate boundaries).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. Workspace cap routes require membership of an organization (spend-limit/route.ts:60-64). |
| Permissions | Change: policy.manage permission, held by the admin role set (permissions.ts:274-286) and, by name, the primary owner (all permissions, permissions.ts around 296-306). Read: requireTeamAdminAccess plus membership (route.ts:56-75). The comment says any member may read, but the code also requires team admin access. Writes need CSRF. |
| Subscription | Workspace cap needs the team_admin capability: plan:team, plan:team_premium, plan:enterprise (packages/contracts/types/src/billing-catalog.ts:362; apps/web/app/api/settings/team/team-admin-access.ts:31-45). Gateway API keys need managed_api: plan:pro and above (billing-catalog.ts:358; apps/web/app/api/llm/v1/chat/completions/lib/request-surface.ts:59-63). The Rate limits card has no plan check found. |
| Limits and metering | Chat completions: 30 per minute per user, fail-closed (rate-limit.ts:359-363). Developer console reads 60 per minute, writes 20 per minute (rate-limit.ts:701-710). Cap bounds in spend-limit-bounds.ts. Cache 60 s. |
| Feature flags | Rate limit scale from configuration (rate-limit.ts:77). Shared limiter outage policy from configuration (resolveRedisOutagePolicy, rate-limit.ts:1132). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Workspace and project caps do not apply: Local turns do not use the managed gateway. The CLI --max-budget-usd applies to the session in any mode [inferred] and is checked on the device (engine.rs:80-91). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cap lookup fails | Gateway logs an error and runs the turn ungoverned (fail-open). | managed-compute-gate.ts:517-524; spend-limit-service.ts:171-181 |
| Overshoot | A workspace can exceed the cap by about one cache window of spend. | spend-limit-service.ts:58; WorkspaceSpendLimit.tsx:79 |
| Rate limiter unavailable | Fail-closed routes (chat completions) refuse with Retry-After 60; the developer-console bucket is not fail-closed. | rate-limit.ts:1132-1148, :359-363, :701-705 |
| Shared store quota exhausted | Falls back to per-instance limiting and adds a degraded header. | rate-limit.ts:1197-1204 |
| Card load failure | Retryable error without raw HTTP status. | apps/web/features/workspace-console/components/__tests__/WorkspaceSpendLimit.test.tsx:57 |
| Caller cannot administer | Card renders nothing. | WorkspaceSpendLimit.test.tsx:133 |
| Project cap reached | 429 once; webhook queued once per month. | project-spend.ts:51-85 |
| Save in Block mode | Warning that new turns are declined; running work is unaffected. | WorkspaceSpendLimit.tsx:278-288 |
| Remove | Confirmation names the consequence. | WorkspaceSpendLimit.tsx:311-315 |
| CLI budget with no JSON output | Message printed in text; no machine event. | lib.rs:9244-9251; chat.rs:3700-3704 |
| Offline / timeout / cancel | not handled in the code beyond the generic error states above. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/spend-limit/route.test.ts`: Read-only permission report, malformed JSON rejected before storage, DELETE does not audit a missing cap (it titles at 286, 328, 350; others not printed)
- `apps/web/lib/services/__tests__/spend-limit-service.test.ts`: Reads cap and month spend, settled turns only, unconfigured state, credits not money, percent, threshold
- `apps/web/lib/services/__tests__/spend-limit-coverage.test.ts`: name only; file not opened
- `apps/web/lib/services/__tests__/spend-alert-service.test.ts`: name only; file not opened
- `apps/web/features/workspace-console/components/__tests__/WorkspaceSpendLimit.test.tsx`: Load error, save error, credits shown, invalid values disable save, hidden for non-admin
- `apps/web/lib/__tests__/rate-limit.test.ts`: Per-endpoint limits and bucket isolation (91 cases; two it titles read)
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.test.ts`: Mocks developerProjectSpendRefusal; file not read for assertions
- `apps/web/lib/services/__tests__/managed-usage-request-service.spend-cap.test.ts`: name only; file not opened
- `crates/agiworkforce-agent-core/tests/turn_loop.rs`: BudgetExceeded events (lines 692, 718); contents not read
- `apps/cli/src/lib.rs`: max_budget_usd_flag_parses at line 10791 and a flag combination test near 10915

**Test scenarios**

- **Read headers**
  1. Send a chat completion with an API key.
  2. Read the response headers.
  - Expected: X-RateLimit-Limit, -Remaining and -Reset are present.
- **Hit the limit**
  1. Send more than 30 chat completions in a minute for one user.
  - Expected: HTTP 429 with Retry-After and the headers.
- **Block mode**
  1. As an admin on a Team workspace, set a small cap with Block.
  2. Spend past it.
  3. Send a Cloud turn as a member.
  - Expected: HTTP 402 with the workspace limit message; no credits reserved; after raising the cap the next turn runs.
- **Notify mode**
  1. Switch the same cap to Notify and send a turn over the cap.
  - Expected: The turn runs; a crossing is reported.
- **Project cap**
  1. Create a project with a small monthly limit and a key.
  2. Use the key until spend reaches the limit.
  - Expected: 429 code project_spend_limit_reached; a webhook event is queued once; a key of another project still works.
- **CLI stop**
  1. Run the CLI with --max-budget-usd 0.01 --json-events and a task that calls the model twice.
  - Expected: The loop stops, 'Budget cap reached' is printed and a status_update budget_exhausted event is emitted.

**Where to look when it fails**

- Log '[spend-limit] unavailable; request treated as ungoverned' and '[spend-limit] request refused by workspace budget' (managed-compute-gate.ts:521, :532).
- Log 'Rate limit exceeded' with key and limit (rate-limit.ts:1242-1251).
- Audit event admin_policy_changed with resourceType organization_spend_limit (spend-limit/route.ts:114-130).
- Table developer_webhook_deliveries rows with event_type project.spend_limit_reached.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)
- CLI: [70-qa/test-plans/cli/105-developer-platform-and-console.md](../../70-qa/test-plans/cli/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **The workspace cap fails open and is eventual, so it is not a hard ceiling.** Affects: Workspace owners on Team and Enterprise. Evidence: managed-compute-gate.ts:494-499, :517-524. Work needed: Decide whether a fail-closed or tighter mode is wanted and say it in the card (it already states the lag).
- **The Rate limits card shows no live remaining count.** Affects: Web developers. Evidence: RateLimitsPanel.tsx:39-53. Work needed: Show the last seen headers or poll a lightweight endpoint.
- **Limits shown are base values; plan scaling on other routes was not checked against the card.** Affects: Developers on higher plans. Evidence: rate-limit-summary.ts:21; rate-limit.ts:961-966. Work needed: Verify each listed endpoint's real bucket and tier.
- **Workspace cap is limited to Team and Enterprise; a single owner on Pro or Max has only the personal limit.** Affects: Individual API developers. Evidence: billing-catalog.ts:362; UsageSection.tsx:694-711. Work needed: Confirm that is intended.
- **Where the personal monthly limit is enforced was not established.** Affects: Personal API spend. Evidence: Only reads found in apps/web/lib/services/spend-limit-service.ts:305-366; DB function in 0378 migration not read. Work needed: Read migration 0378 and the gateway path and document it.
- **The CLI budget has no account-wide meaning and is per session only.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:489-492. Work needed: none required; state it in the CLI help.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-api-and-contracts
- SYS-observability-and-operations
- table:organization_spend_limits
- table:personal_spend_limits
- table:developer_projects
- api:PUT /api/settings/organization/spend-limit
- api:DELETE /api/settings/organization/spend-limit
- api:POST /api/llm/v1/chat/completions
- plan:team
- plan:enterprise
- F105-09

## Unknown

- Whether a Team-plan workspace resolves a funding organization for the gateway gate (function resolveEnterpriseFundingOrganizationId was not opened).
- Where the personal monthly limit is enforced.
- Which roles beyond admin and primary owner hold policy.manage.
- Whether the audio transcription and credits routes use the buckets the card lists (only embeddings and models routes were checked).
- What the project limit input is labelled in the Projects card.
- Whether project cap lookup errors fail open or closed (no handler in project-spend.ts).
- Results of any test run: none recorded.
