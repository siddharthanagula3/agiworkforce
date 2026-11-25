---
id: "F082-03"
type: "feature"
title: "Usage by model, feature, work and project"
aliases: ["Where your usage went", "Usage history", "By product area", "By model", "By project", "Usage breakdown", "S82.04", "S82.05", "S82.10", "S82.19", "S82.09", "S82.18 (history)", "workload"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S82.04", "S82.05", "S82.10", "S82.19"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "api:GET /api/usage/history", "table:managed_usage_requests", "table:user_projects", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-03 Usage by model, feature, work and project

Breaks settled usage down by day, week or month, by product area (chat, work, research, code, browser), by model, and by project. Web shows all of it. Mobile shows period, area and model but no project. The CLI and VS Code show area and model for the default window. Chrome shows none.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.04](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8204), [S82.05](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8205), [S82.10](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8210), [S82.19](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8219).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Reads GET /api/usage/history and renders totals, periods, a product-area list, a model list and a project list in credits (apps/web/lib/services/account-usage-history-service.ts:197-250; apps/web/features/settings/sections/UsageSection.tsx:1139-1153).

**Why it exists.** The meters say how much is left. This says where it went, so a person can change habits or check a bill. The brief requires per-model, per-feature, coding and work, and per-project breakdowns (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.04, S82.05, S82.10, S82.19).

**Who uses it.** Paid subscribers who want to know which models, areas or projects used their credits.

**Problems it solves**

- No way to tell whether research, code or chat used the credits.
- No way to link spend to a project.
- Totals that include requests still in flight. The page counts only settled requests and says how many are still settling (apps/web/features/settings/sections/UsageSection.tsx:1154-1167).

**Use cases**

- A user switches to Weeks and sees which week was heaviest.
- A user reads 'By product area' to see how much Deep Research cost against chat.
- A team member reads 'By project' to see which project used the most credits.
- A CLI user reads 'By model' lines to compare models (apps/cli/src/usage_summary.rs:805-822).

## 2. User experience

**Where to find it**

- Web and hosted Desktop: Settings, Usage, card 'Where your usage went' (apps/web/features/settings/sections/UsageSection.tsx:1100-1102).
- Mobile: Settings, Usage, card 'Where your usage went' (apps/mobile/src/features/settings/cloud-usage/index.tsx:660-662).
- CLI: usage command prints 'Usage history, last <n> days' with 'By product area:' and 'By model:' (apps/cli/src/usage_summary.rs:776-860).
- VS Code: account quick pick 'Usage history, <range>' with 'By product area' and 'By model' (apps/extension-vscode/src/core/commandSetup.ts:2338-2360).
- Chrome: not shown (no history read found in apps/extension).

**Before you start**

- Paid non-contract plan, Cloud mode, signed in. Web fetches history only for these accounts (apps/web/features/settings/sections/UsageSection.tsx:1451).
- Mobile needs the same, and a non-Free account key (apps/mobile/src/features/settings/cloud-usage/index.tsx:909-911, 1319 area).

**Screens and controls**

- Web: segmented control 'Group usage history by' with Days, Weeks, Months; lists 'By day/week/month', 'By product area', 'By model', 'By project'; 'Download CSV'; 'Report a billing problem' (apps/web/features/settings/sections/UsageSection.tsx:1109-1117, 1133-1153, 1173-1188).
- Mobile: three buttons labelled Days, Weeks, Months with the accessibility label 'Group usage by <days|weeks|months>' (apps/mobile/src/features/settings/cloud-usage/index.tsx:664-695).

**Journey**

1. Open Usage and scroll to 'Where your usage went'.
2. The page asks /api/usage/history for the chosen grouping (default days).
3. Read the total requests and credits, then each list. Each list shows up to 8 rows, periods show all.
4. Switch to Weeks or Months to regroup; a new read starts.
5. If a message says requests are still settling, read again later.

**What the person sees and gets**

- Row text: '<n> requests · <credits>' (apps/web/features/settings/sections/UsageSection.tsx:894).
- Empty: 'No settled usage in this period.' (apps/web/features/settings/sections/UsageSection.tsx:1124-1126).
- Error: 'Could not load your usage history.' with 'Try again' (apps/web/features/settings/sections/UsageSection.tsx:1081, 1122, 276-285).
- Project with no name in this workspace: 'Project not in this workspace' (apps/web/features/settings/sections/UsageSection.tsx:1152).

**Settings**

- Granularity (day, week, month) only. The API also accepts workload, from and to, but the web and mobile screens do not offer them (apps/web/app/api/usage/history/route.ts:40-46; apps/web/features/settings/sections/UsageSection.tsx:1079).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server returns totals, periods, byWorkload, byModel, byProject and freshness from settled rows of managed_usage_requests for the user (apps/web/lib/services/account-usage-history-service.ts:104-250).
- Granularity defaults to day, with 30 days, 12 weeks, 12 months of periods (apps/web/lib/services/account-usage-history-service.ts:31-59).
- Window is clamped to the retained range (366 days max, 30 default) (apps/web/lib/services/usage-aggregation.ts:176-205).
- Workload parameter accepts chat, work, research, code, browser and rejects others with a validation error (apps/web/app/api/usage/history/route.ts:23-27; apps/web/lib/billing/usage-attribution.ts:1).
- Chat usage is tagged work, research or browser by mode; other chat is chat; code sessions are tagged code (apps/web/lib/billing/usage-attribution.ts:30-37; apps/web/lib/services/cloud-code-agent-service.ts:687).
- Breakdowns are capped at 50 rows by the server (apps/web/lib/services/usage-aggregation.ts:49) and 8 rows on screen on web and mobile (apps/web/features/settings/sections/UsageSection.tsx:60; apps/mobile/src/features/settings/cloud-usage/index.tsx:198).
- Web shows by product area, by model, by project (apps/web/features/settings/sections/UsageSection.tsx:1139-1153). Mobile shows product area and model (apps/mobile/src/features/settings/cloud-usage/index.tsx:712-721).
- CLI renders product area, model and day list; VS Code renders the same via summarizeUsageHistory (apps/cli/src/usage_summary.rs:776-860; apps/extension-vscode/src/data/usagePresentation.ts:115-139).

**Incomplete**

- Mobile has no project breakdown (apps/mobile/src/features/settings/cloud-usage/index.tsx:712-721).
- CLI type has no by_project field, so projects are not shown (apps/cli/src/usage_summary.rs:136-146).
- VS Code parses byProject in its tests but summarizeUsageHistory does not render it (apps/extension-vscode/src/data/usagePresentation.ts:115-139; apps/extension-vscode/src/__tests__/usagePresentation.test.ts:29).
- No UI control for the workload filter on any app. The web screen requests only granularity (apps/web/features/settings/sections/UsageSection.tsx:1079).
- CLI and VS Code request the history with no granularity, so only the default day grouping is shown (apps/cli/src/usage_summary.rs:9, 437-440; apps/extension-vscode/src/utils/api.ts:1555).

**Present but disconnected or switched off**

- The brief's code reference for research (request-processor.ts:4303) points at a context error branch, not at research attribution. The research tag comes from resolveChatWorkload (apps/web/lib/billing/usage-attribution.ts:30-37; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6163).

**Not available**

- Chrome has no usage history view (no history read found under apps/extension).
- Free plan on web and mobile shows no history (apps/web/features/settings/sections/UsageSection.tsx:1451).

## 4. Required behaviour

**Established requirements**

- Users can see usage broken down by model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.04)
- Users can see usage by feature or product area (chat, work, research, code, browser). (source: S82.05 (same brief))
- Users can see how much usage went to coding and agentic work. (source: S82.10 (same brief))
- Users can see usage broken down by project. (source: S82.19 (same brief))
- Users can review history by day, week and month. (source: S82.18 (same brief))
- An unknown workload name is refused before any read. (source: apps/web/app/api/usage/history/__tests__/route.test.ts:151)
- Totals count settled requests only and say how many are still settling. (source: apps/web/features/settings/sections/UsageSection.tsx:1104-1106, 1154-1167)

**Acceptance criteria**

1. Switching Days, Weeks, Months changes the period list and the captions.
2. A request with workload=research returns only research usage; workload=foo returns a validation error.
3. By project lists projects the user's workspace knows by name, and 'Project not in this workspace' otherwise.
4. An account with no settled usage sees 'No settled usage in this period.' and not an error.
5. A failed read shows 'Could not load your usage history.' and a retry that works.
6. Mobile shows product area and model lists and no project list.
7. Unsettled requests show a 'still settling' notice and are not in the totals.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Row labels should be the same across apps, since all use the shared workload labels [inferred from usageWorkloadLabel imports in web, mobile and VS Code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the project list to mobile, CLI and VS Code.
- [proposed] Add a product-area filter control that calls the existing workload parameter.
- [proposed] Let CLI and VS Code request week and month groupings.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/usage/history | `apps/web/app/api/usage/history/route.ts` | Validates granularity, workload and window, returns the history. |
| service | readAccountUsageHistory | `apps/web/lib/services/account-usage-history-service.ts` | Aggregates totals, periods, byWorkload, byModel, byProject, freshness. |
| service | usage-aggregation | `apps/web/lib/services/usage-aggregation.ts` | Settled and unsettled filters, window clamp, BREAKDOWN_LIMIT. |
| other | usage-attribution | `apps/web/lib/billing/usage-attribution.ts` | USAGE_WORKLOADS and resolveChatWorkload. |
| service | cloud-code-agent-service | `apps/web/lib/services/cloud-code-agent-service.ts` | Tags code usage with workload code (line 687). |
| table | managed_usage_requests | `apps/web/lib/services/account-usage-history-service.ts` | Source rows: user_id, created_at, usage json (workload, projectId, operation), model, actual_cost_microusd (lines 104-114). |
| table | user_projects | `apps/web/lib/services/account-usage-history-service.ts` | Joined to name projects (lines 186-188). |
| schema | AccountUsageHistoryResponse and parser | `packages/contracts/types/src/account-usage-wire.ts` | Shared response type and parseAccountUsageHistoryResponse. |
| component | UsageHistorySection and HistoryRows | `apps/web/features/settings/sections/UsageSection.tsx` | Web history card. |
| component | UsageHistoryCard | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile history card. |
| service | fetchUsageHistory | `apps/mobile/services/usage.ts` | Mobile read of /api/usage/history?granularity=... |
| service | render_usage_history | `apps/cli/src/usage_summary.rs` | CLI history text. |
| other | summarizeUsageHistory | `apps/extension-vscode/src/data/usagePresentation.ts` | VS Code history rows. |
| service | fetchUsageHistory | `apps/extension-vscode/src/utils/api.ts` | VS Code history read with unavailable reasons (line 1553). |
| endpoint | GET /api/usage/export | `apps/web/app/api/usage/export/route.ts` | CSV of the same grouping (linked from the web card). |
| test | history route test | `apps/web/app/api/usage/history/__tests__/route.test.ts` | Route behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the history card or switches grouping. | device | apps/web/features/settings/sections/UsageSection.tsx:1109-1117 |
| App sends GET /api/usage/history?granularity=<day/week/month>. | device | apps/web/features/settings/sections/UsageSection.tsx:1079; apps/mobile/services/usage.ts:96-98 |
| Server checks sign-in and the usage:read scope, validates workload, computes the window. | our servers | apps/web/app/api/usage/history/route.ts:29-46 |
| Server runs six aggregate queries in parallel on settled rows for the user. | our servers | apps/web/lib/services/account-usage-history-service.ts:207-232 |
| Client parses with the shared parser, refuses a body that is not a history, and renders. | device | apps/web/features/settings/sections/UsageSection.tsx:1080; apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx:236 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage request records (model, tokens, cost, workload, project, operation) | Server table managed_usage_requests, usage json column. | Read only here. Written by the chat pipeline when a managed request settles. | Reads are limited to the last 366 days (apps/web/lib/services/usage-aggregation.ts:176). Retention of rows themselves unknown. |

**Models and providers.** The model column is the model that served the request. Labels come from the rate card or the model catalog, never typed in this feature (apps/web/lib/services/account-usage-history-service.ts:127; apps/web/features/settings/sections/UsageSection.tsx:1147).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. API key with scope usage:read also works (apps/web/app/api/usage/history/route.ts:32). |
| Permissions | Reads only the caller's own rows (user_id = $1) on a user-scoped connection (apps/web/lib/services/account-usage-history-service.ts:104-109). |
| Subscription | Shown to paid non-contract plans on web and mobile. The API itself has no plan check in the route [inferred from route.ts:29-61]. |
| Limits and metering | Rate limit key 'credits-balance'. Window max 366 days. 50 rows per breakdown (apps/web/lib/services/usage-aggregation.ts:49, 176). |
| Feature flags | none found in the code. |
| Model compatibility | Any model that served a managed request appears. Local and own-key requests are not in this table [inferred, since the table is managed usage]. |
| Provider restrictions | none found in the code. |
| Local mode | Local mode produces no managed usage rows, so it appears in no breakdown [inferred]. CLI refuses history in Local and own-key modes (apps/cli/src/usage_summary.rs:913-935). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading usage history' on web, spinner on mobile. | apps/web/features/settings/sections/UsageSection.tsx:1121; apps/mobile/src/features/settings/cloud-usage/index.tsx:696 |
| Empty | 'No settled usage in this period.' | apps/web/features/settings/sections/UsageSection.tsx:1124; apps/mobile/src/features/settings/cloud-usage/index.tsx:697-701 |
| Error and retry | Message plus 'Try again' (web) or 'Retry' (mobile). | apps/web/features/settings/sections/UsageSection.tsx:276-285; apps/mobile/src/features/settings/cloud-usage/index.tsx:341-371 |
| Unreadable body | The parser returns null and the page shows the failure message. | apps/web/features/settings/sections/UsageSection.tsx:263 |
| Stale grouping | Hides the old grouping while a new one loads. | apps/web/features/settings/sections/UsageSection.tsx:1085, 1092 |
| Unsettled requests | Notice that N requests are still settling and not counted. | apps/web/features/settings/sections/UsageSection.tsx:1154-1167 |
| Unknown workload filter | Validation error before reading. | apps/web/app/api/usage/history/route.ts:23-27 |
| Database error | 500 'Failed to fetch usage history' with no database text. | apps/web/app/api/usage/history/route.ts:57-60; apps/web/app/api/usage/history/__tests__/route.test.ts:171 |
| VS Code unavailable | Reasons: not signed in, expired session, unreadable, unreachable. | apps/extension-vscode/src/utils/api.ts:1553-1583 |
| Accessibility | Web uses a labelled segmented control. Mobile buttons carry labels and a selected state. | apps/web/features/settings/sections/UsageSection.tsx:1110; apps/mobile/src/features/settings/cloud-usage/index.tsx:671-673 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/usage/history/__tests__/route.test.ts`: Own spend by day and area, granularity fallback, scoped connection, window clamp, workload scoping, unknown workload refusal, auth refusal, no database message.
- `apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx`: Day, area, model, project lists; newest first; weekly regroup; settling notice; empty versus failed; retry; bad body refused.
- `apps/extension-vscode/src/__tests__/usagePresentation.test.ts`: History summary: workload labels, models, periods newest first, unsettled text.
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile Usage screen (history rendering covered by the file; exact cases not listed here).
- `apps/cli/src/usage_summary.rs`: Inline tests of render and parse (history cases not individually verified).

**Test scenarios**

- **Regroup history**
  1. Open web Usage with an account that has 30 days of use.
  2. Pick Weeks, then Months.
  - Expected: Period captions read 'By week' then 'By month' and totals stay consistent.
- **Workload filter via API**
  1. Call GET /api/usage/history?workload=research with a usage:read key.
  2. Call it with workload=invalid.
  - Expected: First returns only research rows. Second returns a validation error and reads nothing.
- **Project breakdown**
  1. Run requests inside a project.
  2. Open web Usage.
  - Expected: 'By project' lists the project name with requests and credits.
- **Mobile project gap**
  1. Open the same account on mobile.
  - Expected: Product area and model lists show; no project list.
- **Empty account**
  1. Use a new paid account with no requests.
  - Expected: 'No settled usage in this period.' and no error.
- **Settling requests**
  1. Start a long managed request.
  2. Open Usage before it finishes.
  - Expected: A notice says one request is still settling and is not counted.

**Where to look when it fails**

- Server log 'Failed to fetch usage history' (apps/web/app/api/usage/history/route.ts:58).
- Validation error text 'Unknown usage workload'.
- Check rows in managed_usage_requests with status not settled (see SETTLED and UNSETTLED in apps/web/lib/services/usage-aggregation.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **No project breakdown on mobile, CLI or VS Code.** Affects: Mobile, CLI, VS Code users. Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:712-721; apps/cli/src/usage_summary.rs:136-146; apps/extension-vscode/src/data/usagePresentation.ts:115-139. Work needed: Parse and render byProject, cap at 8 rows, add tests.
- **No visible workload filter control; the API supports it.** Affects: All apps. Evidence: apps/web/app/api/usage/history/route.ts:42; apps/web/features/settings/sections/UsageSection.tsx:1079. Work needed: Add a filter to the web card and pass the parameter.
- **Chrome has no history view; the brief status 'built' for Chrome is not supported by code found.** Affects: Chrome users. Evidence: no history call found under apps/extension. Work needed: Confirm and correct the brief status or build the view.
- **The brief says the CLI and VS Code show 'task'; they show product area, not tasks.** Affects: Testers reading the brief. Evidence: apps/cli/src/usage_summary.rs:787-803; apps/extension-vscode/src/data/usagePresentation.ts:125-127. Work needed: Correct the wording.
- **CLI and VS Code are fixed to day grouping.** Affects: CLI and VS Code users. Evidence: apps/cli/src/usage_summary.rs:9; apps/extension-vscode/src/utils/api.ts:1555. Work needed: Pass granularity.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- api:GET /api/usage/history
- table:managed_usage_requests
- table:user_projects
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud

## Unknown

- How long managed_usage_requests rows are kept.
- Whether code and browser attribution is complete for all paths (only chat, code session and provider-proxy paths were seen).
- Whether the Chrome extension reads history anywhere (searched by name only).
- The exact definitions of SETTLED and UNSETTLED (usage-aggregation.ts constants not opened in full).
- Whether Electron Desktop renders the same page unchanged (not run).
