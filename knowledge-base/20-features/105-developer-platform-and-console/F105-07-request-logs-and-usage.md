---
id: "F105-07"
type: "feature"
title: "Request logs and usage"
aliases: ["Request logs", "Trace explorer (brief S105.17)", "Usage and cost dashboards (brief S105.18)", "Where your usage went", "Usage history", "agi usage / /usage"]
area: "105 Developer platform and console"
available_on: ["web", "desktop", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.17", "S105.18"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-authentication-and-identity", "table:managed_usage_requests", "table:api_keys", "api:GET /api/developers/logs", "api:GET /api/usage/history", "api:GET /api/developers/usage", "plan:pro", "F105-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-07 Request logs and usage

On the web Developer console, the Request logs card lists recent requests made with a person's API keys, newest first, with a step timeline, tokens and credits. Separately, Settings, Usage shows settled credits by day, week or month and by model. The CLI prints a usage summary. Desktop shows the hosted web app.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.17](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10517), [S105.18](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10518).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Request logs show each call made with an AGI API key: model, status, key name, time, step timeline (Received, Sent to the model, Model answered, Delivered to your client, Billed), token counts, server-side tool counts and credits (apps/web/features/developers/components/RequestLogsPanel.tsx:22-38, :57-107). The usage history shows settled credits over time and by product area, model and project, with a CSV download (apps/web/features/settings/sections/UsageSection.tsx:1070-1200).

**Why it exists.** A developer who calls the managed gateway needs to see what each call did and cost, and whether a call is still settling. The card says prompts and answers are not stored (RequestLogsPanel.tsx:119-123). [inferred] The two views let a developer tie a bill to requests.

**Who uses it.** A signed-in developer who holds API keys (web Developer console at /developers), any paid-plan account owner reading usage in Settings, and a CLI user running agi usage.

**Problems it solves**

- Finding which API request failed, was declined or was never confirmed (status labels, RequestLogsPanel.tsx:30-38).
- Seeing where credits went by model, product area and project (UsageSection.tsx:1130-1156).
- Spotting requests still settling that are not yet counted (UsageSection.tsx:1157-1170).

**Use cases**

- A developer opens Developer console, Request logs, opens a row and reads that the model answered 400 ms after it was sent.
- A developer opens Settings, Usage, picks Weeks, and reads credits by model.
- A CLI user runs agi usage and reads the last days of usage by model (apps/cli/src/usage_summary.rs:776-845).
- A developer sees a project line such as '3 of 10 this month' in the Projects card (apps/web/features/developers/components/ProjectsPanel.tsx:90-98).

## 2. User experience

**Where to find it**

- Web: /developers, card titled 'Request logs' (apps/web/features/developers/components/DeveloperConsolePage.tsx:72; apps/web/app/developers/page.tsx:13-22).
- Web: Settings, Usage, card 'Where your usage went' (UsageSection.tsx:1101). The console Reference card links to it as 'Usage' (DeveloperConsolePage.tsx:42-46).
- Desktop: the public Desktop shows the hosted web app, so the same pages (doc: AGENTS.md section 5). No desktop source file refers to these routes (grep of apps/desktop/src and apps/desktop/electron found nothing).
- CLI: command agi usage (apps/cli/src/lib.rs:7680-7686) and slash command /usage (apps/cli/src/repl/slash_commands.rs:316).
- Mobile (not in the brief): Cloud usage settings call the same history endpoint (apps/mobile/services/usage.ts:93-98; apps/mobile/src/features/settings/cloud-usage/index.tsx:641).

**Before you start**

- Sign in. The logs and usage routes read the signed-in user's database scope (apps/web/app/api/developers/logs/route.ts:33).
- Request logs only list requests made with an API key, so at least one key request must exist (apps/web/lib/services/developer-request-log-service.ts:122-123).
- The usage history card shows only for accounts that are not Free and not contract priced (UsageSection.tsx:1224-1225, :1451).
- The CLI needs a signed-in managed account and a Cloud session; Local and own-key sessions are refused before any request (apps/cli/src/usage_summary.rs:914-932).

**Screens and controls**

- Request logs card: description line, list of rows, each row a button with aria-expanded showing model, status, time and key name, total ms; 'Show older' button; 'Try again' button on errors (RequestLogsPanel.tsx:109-206).
- Opened row: 'Timeline' list with +ms per step, and facts: Requested model, Served by, Error, Input tokens, Output tokens, Reasoning tokens, Cached input tokens, Web searches, Pages fetched, Code runs, Credits (RequestLogsPanel.tsx:57-107).
- Usage card: segmented control 'Group usage history by' with Days, Weeks, Months; tables By period, By product area, By model, By project; 'Download CSV'; 'Report a billing problem' (UsageSection.tsx:120-124, :1108-1190).

**Journey**

1. Open /developers while signed in.
2. The card loads the first page of logs (50 rows) for the active workspace (apps/web/features/developers/hooks/use-developer-request-logs.ts:32-50; packages/contracts/cloud-contracts/src/developer-console.ts:4).
3. Click a row to open its timeline and facts; click again to close.
4. Click 'Show older' to load the next page.
5. For cost over time, open Settings, Usage, choose Days, Weeks or Months, read By model.

**What the person sees and gets**

- Loading: spinner and 'Loading requests…' (RequestLogsPanel.tsx:147-151).
- Empty: 'No API requests yet. Requests made with your API keys show up here.' (RequestLogsPanel.tsx:152-155).
- Failure: red alert with the message and 'Try again' (RequestLogsPanel.tsx:138-146).
- A request with no answer reads 'Outcome unknown' as its status (RequestLogsPanel.tsx:34).
- Usage empty: 'No settled usage in this period.' (UsageSection.tsx:1130-1132).
- CLI output lines such as 'Usage history, last 30 days: ...' with By product area, By model, By day lines (usage_summary.rs:776-845).

**Settings**

- None for the logs card.
- Usage card: granularity (Days, Weeks, Months) kept in component state only (UsageSection.tsx:1071).
- Rate limit for the logs and usage console routes: bucket developer-console, 60 per minute, not fail-closed (apps/web/lib/rate-limit.ts:701-705).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Request logs card is mounted and wired to GET /api/developers/logs with keyset paging (DeveloperConsolePage.tsx:72; apps/web/app/api/developers/logs/route.ts:26-40; apps/web/lib/services/developer-request-log-service.ts:90-139).
- Steps shown are only those with a timestamp; Billed appears only for completed requests (developer-request-log-service.ts:53-64).
- Web: usage history by day, week, month with by-workload, by-model and by-project breakdowns, served by GET /api/usage/history under the usage:read key scope (apps/web/app/api/usage/history/route.ts:29-61; apps/web/lib/services/account-usage-history-service.ts:197-260).
- Web: per key and per project usage for this month at GET /api/developers/usage (apps/web/app/api/developers/usage/route.ts:10-20).
- CLI: agi usage and /usage print account usage and history; history shows up to 8 models and 7 periods (apps/cli/src/usage_summary.rs:20-30, :776-845).
- Mobile app reads the same history endpoint (apps/mobile/services/usage.ts:93-98).

**Incomplete**

- The brief marks S105.17 as missing on web and desktop, but the card exists, so the brief is stale for web (doc: knowledge-base/data/area-briefs/105-developer-platform-and-console.md:74-76; code: DeveloperConsolePage.tsx:72).
- Logs hold no tool-call arguments or streamed events: the row type has token counts and server-side tool counts only (packages/contracts/cloud-contracts/src/developer-console.ts:12-30).
- The console has no per-model usage chart; per-model usage is in Settings, Usage, not in the console (DeveloperConsolePage.tsx:42-46).

**Present but disconnected or switched off**

- Usage history is hidden for Free accounts and for contract-priced plans (UsageSection.tsx:1451).

**Not available**

- Request logs: no filter, search, export or date range on web; only 'Show older' (RequestLogsPanel.tsx:191-204).
- Request logs on CLI, mobile, VS Code and Chrome: no match found for the log endpoint in those apps (grep of apps/mobile, apps/extension, apps/extension-vscode found no api/developers).
- Desktop-specific code: none; desktop is the hosted web app (doc: AGENTS.md section 5).

## 4. Required behaviour

**Established requirements**

- Developers can browse traces/logs of their API requests with timing and steps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.17)
- Developers can see usage and cost over time, broken down by model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.18)
- A request with no answer shows 'Outcome unknown' rather than a guess. (source: apps/web/features/developers/components/RequestLogsPanel.tsx:34)
- Prompts and answers are not stored in the logs. (source: apps/web/features/developers/components/RequestLogsPanel.tsx:119-123)
- Usage counts only settled requests and says how many are still settling. (source: apps/web/features/settings/sections/UsageSection.tsx:1103-1106, :1157-1170)

**Acceptance criteria**

1. After a call with an API key, the Request logs card lists it with the requested model, status and time.
2. Opening a row shows the steps that have a timestamp, in order, with +ms from Received.
3. A request that is declined shows 'Declined'; one without a final answer shows 'Outcome unknown'.
4. With more than 50 requests, 'Show older' loads the next page without repeating rows.
5. A failed load shows an alert and 'Try again'; a successful retry replaces it.
6. Settings, Usage shows credits By model for the chosen period and excludes requests still settling.
7. A Free account does not see the usage history card.
8. agi usage in a Local or own-key session says it needs a managed account and sends no request.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Logs are per user, not per workspace: the SQL filters on user_id only (developer-request-log-service.ts:122) even though the request sends a workspace header (use-developer-request-logs.ts:40-43).
- [inferred] Playground requests are sent with the session credential, so they have no api_key_id and do not appear in the logs (RequestPlayground.tsx:181-193; developer-request-log-service.ts:123).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add filters by key, model, status and time range, and a CSV export for logs, as the usage card already has.
- [proposed] Add a per-model cost view inside the console so a developer need not leave for Settings.
- [proposed] Show the request id so a log row can be matched to /api/usage/turns/{requestId}.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RequestLogsPanel | `apps/web/features/developers/components/RequestLogsPanel.tsx` | Card, rows, timeline, status labels, paging button |
| hook | useDeveloperRequestLogs | `apps/web/features/developers/hooks/use-developer-request-logs.ts` | Fetches pages, guards against workspace changes and stale callbacks, retry and load more |
| screen | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Mounts the card and links to Usage |
| screen | /developers route | `apps/web/app/developers/page.tsx` | Page shell, noindex, passes rate limits |
| endpoint | GET /api/developers/logs | `apps/web/app/api/developers/logs/route.ts` | Rate limit, cursor validation, returns a page with Cache-Control private no-store |
| service | listDeveloperRequestLogs | `apps/web/lib/services/developer-request-log-service.ts` | SQL over managed_usage_requests joined to api_keys, builds steps |
| schema | DeveloperRequestLog schemas | `packages/contracts/cloud-contracts/src/developer-console.ts` | Path constant, page size 50, step names, row shape |
| table | managed_usage_requests | `apps/web/lib/services/developer-request-log-service.ts` | Source rows (status, model, timestamps, usage json, cost) |
| table | api_keys | `apps/web/lib/services/developer-request-log-service.ts` | Joined for key name and prefix |
| endpoint | GET /api/usage/history | `apps/web/app/api/usage/history/route.ts` | Usage history under usage:read scope; granularity, from, to, workload |
| service | readAccountUsageHistory | `apps/web/lib/services/account-usage-history-service.ts` | Totals, periods, by workload, model, project, freshness; 30 days, 12 weeks, 12 months default |
| service | usage-aggregation | `apps/web/lib/services/usage-aggregation.ts` | SETTLED = completed; UNSETTLED statuses (lines 28, 34) |
| component | UsageHistorySection | `apps/web/features/settings/sections/UsageSection.tsx` | Settings, Usage history card, CSV link, billing problem report |
| endpoint | GET /api/developers/usage | `apps/web/app/api/developers/usage/route.ts` | This month per key and per project figures |
| service | readDeveloperUsage | `apps/web/lib/services/developer-usage-service.ts` | Monthly window and per key and project sums |
| hook | useDeveloperUsage | `apps/web/features/developers/hooks/use-developer-usage.ts` | Reads /api/developers/usage for the Projects card |
| component | ProjectsPanel usage line | `apps/web/features/developers/components/ProjectsPanel.tsx` | Prints '3 of 10 this month' style text (lines 90-98) |
| service | usage_summary | `apps/cli/src/usage_summary.rs` | CLI fetch and render of usage and history |
| command | agi usage | `apps/cli/src/lib.rs` | Command::Usage at lines 7680-7686 |
| command | /usage slash | `apps/cli/src/repl/slash_commands.rs` | Prints account lines plus session estimate (line 316) |
| config | developer-console rate limit | `apps/web/lib/rate-limit.ts` | 60 per minute, fail-open (lines 701-705) |
| other | OpenAPI /usage/history | `apps/web/public/openapi.json` | Public description of the history endpoint (line 3162) |
| service | mobile usage client | `apps/mobile/services/usage.ts` | Mobile call to /api/usage/history (lines 93-98) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser calls GET /api/developers/logs with the workspace header; the hook checks the signed-in owner and workspace are admitted first. | device | apps/web/features/developers/hooks/use-developer-request-logs.ts:32-50, :152-171 |
| The route applies the developer-console rate limit, validates the optional before cursor, and opens a user-scoped database connection. | our servers | apps/web/app/api/developers/logs/route.ts:26-37 |
| The service reads up to 51 rows of managed_usage_requests that have an api_key_id for the user, joined to the key name, and maps timestamps to steps. | our servers | apps/web/lib/services/developer-request-log-service.ts:112-139, :53-64 |
| The page is validated against the contract schema and returned with no-store caching; the card renders it. | our servers | apps/web/app/api/developers/logs/route.ts:34-37; RequestLogsPanel.tsx:109-206 |
| Usage history: the Settings card calls GET /api/usage/history; the server sums settled rows by period, workload, model and project. | our servers | apps/web/app/api/usage/history/route.ts:29-61; apps/web/lib/services/account-usage-history-service.ts:197-260 |
| CLI: agi usage checks the privacy mode, reads the stored sign-in token, and calls /api/usage and /api/usage/history with a 5 second timeout. | device and our servers | apps/cli/src/usage_summary.rs:14-16, :343-357, :505-538 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Request log rows (status, model, timestamps, token counts, cost) | Table managed_usage_requests; logs are read-only here | Read on demand; nothing is stored on the device | unknown: no retention rule for these rows was found in the files read |
| Expanded row and loaded pages | React component state in the browser | no | Cleared when the workspace or source changes (RequestLogsPanel.tsx:112-113; apps/web/features/developers/__tests__/RequestLogsPanel.test.tsx:127) |

**Models and providers.** Logs name the requested model and, when it differs, the model that served it (RequestLogsPanel.tsx:59-62). Provider names are not shown in the logs card. Which provider answered is recorded by the gateway, not by this feature. The usage history groups by model key and uses the catalog display name when no label exists (UsageSection.tsx:1147).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required (getUserScopedDb, apps/web/app/api/developers/logs/route.ts:33). Usage history also accepts an API key with the usage:read scope (apps/web/app/api/usage/history/route.ts:32). Whether an API key can call /api/developers/logs is unknown. |
| Permissions | Per user: queries filter on the caller's user_id (developer-request-log-service.ts:122). No workspace role check was found for the logs route. |
| Subscription | Logs: none found in the code for the route. Keys that create logged requests need a plan with the managed_api capability: plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (packages/contracts/types/src/billing-catalog.ts:341, :358). The usage history card is hidden for plan:free and contract-priced plans (UsageSection.tsx:1451). |
| Limits and metering | Logs page size 50 (packages/contracts/cloud-contracts/src/developer-console.ts:4). Usage history default windows: 30 days by day, 12 weeks, 12 months (account-usage-history-service.ts:31-35). The history route uses the credits-balance rate bucket (apps/web/app/api/usage/history/route.ts:64). Credits come from micro-dollar cost through creditsFromMicrousd (developer-request-log-service.ts:75-78). |
| Feature flags | none found in the code |
| Model compatibility | Any model that the gateway served is listed; unknown model names are shown as stored (RequestLogsPanel.tsx:171-173). |
| Provider restrictions | none found in the code |
| Local mode | Not applicable on the logs: they list Cloud gateway requests only. The CLI refuses agi usage in Local and own-key sessions before any request (apps/cli/src/usage_summary.rs:914-932, :343-357). Local inference on device writes no row to managed_usage_requests [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner and 'Loading requests…'. | RequestLogsPanel.tsx:147-151 |
| Empty | 'No API requests yet...' message. | RequestLogsPanel.tsx:152-155 |
| Error | Alert text plus 'Try again'; paging button hidden after an error. | RequestLogsPanel.tsx:138-146; use-developer-request-logs.ts:177 |
| Workspace not ready | Message 'Request logs are unavailable until your account and workspace are ready.' with Try again, or 'Reload this page to confirm your workspace...' when a reload is required. | RequestLogsPanel.tsx:125-137 |
| Workspace switches mid-load | The hook retires the old request and drops its page. | use-developer-request-logs.ts:152-171; apps/web/features/developers/__tests__/DeveloperRequestLogOwnership.test.tsx |
| Request still in flight or unsettled | Status shows 'In progress' for reserving, reserved, provider_started; the usage history excludes it and counts it as 'still settling'. | RequestLogsPanel.tsx:35-37; UsageSection.tsx:1157-1170 |
| Unknown status string | Shown raw. | RequestLogsPanel.tsx:175 |
| Offline or timeout | not handled separately; any fetch failure takes the error path. The CLI times out after 5 seconds and prints 'Unavailable'. | use-developer-request-logs.ts:136-143; usage_summary.rs:14, :557-562 |
| Accessibility | Rows are buttons with aria-expanded, errors use role alert, coarse pointers get 44 px rows. | RequestLogsPanel.tsx:163-169 |
| Cancel | not handled in the code: no control cancels a load. | RequestLogsPanel.tsx (no cancel control) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/developers/__tests__/RequestLogsPanel.test.tsx`: Listing and opening a row, paging older, state reset when the source changes, empty state and retry on failure (it titles at lines 88-151)
- `apps/web/features/developers/__tests__/DeveloperRequestLogOwnership.test.tsx`: No read before the workspace is admitted, scope change blocking, serialized paging, StrictMode replay, HTTP error retry
- `apps/web/app/api/developers/logs/__tests__/route.test.ts`: 401 when signed out, rate limit first, first page never cached, cursor pass-through, rejects a non-timestamp cursor
- `apps/web/lib/services/__tests__/developer-request-log-service.test.ts`: Maps usage and only the steps that happened, Billed only for completed, API-key rows only, keyset paging with ties
- `apps/web/app/api/usage/history/__tests__/route.test.ts`: History by day and workload, granularity fallback, scope usage:read, window clamp, unknown workload refused, no DB message leaked
- `apps/web/lib/services/__tests__/account-usage-history-service.test.ts`: name only; file not opened
- `apps/web/app/api/developers/usage/__tests__/route.test.ts`: 401, rate limit, reads this month for the caller, no cache
- `apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx`: name only; file not opened
- `apps/cli/src/usage_summary.rs`: Inline tests from line 909: Local and own-key sessions never read usage, contract fields parse, meters render, malformed summary is an error

**Test scenarios**

- **Log a gateway call**
  1. Create an API key with inference:write.
  2. Send one chat completion with the key.
  3. Open /developers, Request logs.
  4. Open the new row.
  - Expected: Row shows the model, a status, key name; the timeline lists Received through Billed with +ms; Credits is shown after settlement.
- **Session request is not logged**
  1. Send a request with 'Try a request' on /developers.
  2. Reload Request logs.
  - Expected: The playground request does not appear (inferred from api_key_id filter); confirm by observation.
- **Paging**
  1. Make more than 50 key requests.
  2. Open Request logs and press 'Show older'.
  - Expected: Next older rows append; no row repeats.
- **Failed load**
  1. Block the /api/developers/logs request in the browser.
  2. Open the card.
  - Expected: An alert with message and Try again; after unblocking, Try again loads rows.
- **Usage by model**
  1. On a paid plan, open Settings, Usage.
  2. Choose Weeks.
  - Expected: By model lists credits for settled requests; unsettled count is stated separately.
- **CLI refusal in Local**
  1. Start the CLI in Local privacy mode.
  2. Run /usage.
  - Expected: The report contains the Local-mode refusal text and no account request is made.

**Where to look when it fails**

- Server log 'Failed to fetch usage history' with user id (apps/web/app/api/usage/history/route.ts:58).
- Status values in managed_usage_requests.status: completed, released, declined, outcome_unknown, reserving, reserved, provider_started.
- Browser network tab: /api/developers/logs and /api/usage/history response codes.
- CLI: 'usage API returned HTTP N' (apps/cli/src/usage_summary.rs:480).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)
- CLI: [70-qa/test-plans/cli/105-developer-platform-and-console.md](../../70-qa/test-plans/cli/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **No tool-call or streaming event detail in request logs.** Affects: Web developers. Evidence: developer-console.ts:12-30 has no such field; brief S105.08 and S105.07. Work needed: Decide what the gateway may record without storing prompts, add fields and render them.
- **Logs have no filter, search, export, per-key view or time range.** Affects: Web developers with many requests. Evidence: RequestLogsPanel.tsx:109-206. Work needed: Add query parameters to the route and controls to the card.
- **Brief status for S105.17 is stale and desktop status is unverifiable.** Affects: Planning and testers. Evidence: Brief line 74-76 says missing; code mounts the card; desktop shows hosted web (doc: AGENTS.md section 5). Work needed: Update the brief and run the card in the Electron desktop to confirm.
- **No usage-by-model view inside the console.** Affects: Web developers. Evidence: DeveloperConsolePage.tsx:42-46 only links to Usage. Work needed: Embed or link the By model table.
- **No log retention or deletion rule found.** Affects: Privacy review. Evidence: Not found in files read. Work needed: Establish retention for managed_usage_requests and state it on the card.
- **CLI, VS Code and Chrome have no request-log view.** Affects: Developers on those apps. Evidence: No match in apps/extension, apps/extension-vscode for api/developers. Work needed: Decide whether they need one; the CLI has usage totals only.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-authentication-and-identity
- table:managed_usage_requests
- table:api_keys
- api:GET /api/developers/logs
- api:GET /api/usage/history
- api:GET /api/developers/usage
- plan:pro
- F105-08

## Unknown

- Whether an API key (not a session) may call /api/developers/logs or /api/developers/usage.
- Retention period for managed_usage_requests rows.
- Whether desktop renders the console and usage pages without change; no run recorded.
- docs/product files that mention developer terms were not opened for console requirements.
- Whether tests for account-usage-history-service and UsageSection.history cover by-model output (files not opened).
- Why the hook sends a workspace header while the SQL filters only on user_id.
