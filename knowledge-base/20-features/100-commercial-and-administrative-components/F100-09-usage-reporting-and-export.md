---
id: "F100-09"
type: "feature"
title: "Usage reporting and export"
aliases: ["Usage reporting and export", "Usage history", "Usage analytics", "Usage report", "Download CSV", "Export daily CSV", "S100.24 Usage reporting"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.24"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-api-and-contracts", "SYS-authorization-and-workspaces", "surface:web", "surface:cli", "surface:vscode", "mode:cloud", "table:managed_usage_requests", "F100-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-09 Usage reporting and export

Shows a person how many credits they used over time, by product area and by model, and lets them download the records as CSV. Workspace admins see the same for the whole workspace, by day, member, model, provider, workload or project, and can export it. All of it reads the managed usage ledger, so it covers Cloud usage only.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.24](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10024).

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

**What it does.** Personal history: GET /api/usage/history groups settled managed usage by day, week or month and breaks it down by product area and model, with an optional workload filter (apps/web/app/api/usage/history/route.ts:36-61; apps/web/lib/services/account-usage-history-service.ts:197-250). Personal export: GET /api/usage/export returns CSV of up to 10,000 records (apps/web/app/api/usage/export/route.ts; apps/web/lib/services/account-usage-history-service.ts:30). Workspace: GET usage-analytics and its export route return totals and breakdowns for admins (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:55-120).

**Why it exists.** People need to see what their credits paid for and finance teams need to reconcile it. The brief asks that usage reporting aggregates the ledger by time, model and feature for accounts and workspaces, with export (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.24).

**Who uses it.** Any signed-in Cloud user for personal usage; workspace admins with the billing.read permission on a Team or Enterprise plan for workspace usage; API callers with the usage:read scope.

**Problems it solves**

- Explains where credits went.
- Gives finance a file that matches the dashboard.
- Lets scripts and the CLI read the same history.
- Warns when part of the breakdown was cut off.

**Use cases**

- A user opens Settings, Usage, picks 'Group usage history by' week and downloads the CSV.
- An admin opens the workspace Usage page, selects 30 days and presses 'Export daily CSV'.
- The CLI prints usage history next to the account summary.
- A script with an API key that has usage:read calls /api/usage/history.

## 2. User experience

**Where to find it**

- Web: Settings, Usage section with a 'Group usage history by' select and a 'Download CSV' link (apps/web/features/settings/sections/UsageSection.tsx:1110, 1174-1178).
- Web workspace console: /workspace/usage, label 'Usage' (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:131-132), with range buttons '7 days', '30 days', '90 days' and 'Export daily CSV' (apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:24-26, 282).
- CLI: usage summary prints account usage and history, or 'Usage history unavailable: ...' (apps/cli/src/usage_summary.rs:525-533).
- VS Code: reads /api/usage and /api/usage/history (apps/extension-vscode/src/utils/api.ts:1545-1555).
- Desktop: calls /api/usage (apps/desktop/src/api/cloudApi.ts:366); history screen not established.
- Mobile: cloud usage settings screen exists (apps/mobile/src/features/settings/cloud-usage/index.tsx); whether it reads history is unknown.
- Chrome: managed usage endpoint /api/usage in the free-trial client (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:116).

**Before you start**

- A signed-in account with Cloud usage.
- For workspace usage: Team or Enterprise plan and billing.read (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:62-75).

**Screens and controls**

- Group by day, week or month select (apps/web/features/settings/sections/UsageSection.tsx:1110-1130).
- Tables captioned 'By product area' and 'By model' (apps/web/features/settings/sections/UsageSection.tsx:1140-1145).
- Workspace stats: Credits used, Active members, Avg credits / active member, Turns, Tokens in (apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:299-307).
- 'Download CSV' and 'Export daily CSV' links.

**Journey**

1. Person opens Usage; the page requests /api/usage/history?granularity=day (apps/web/features/settings/sections/UsageSection.tsx:1079).
2. Server resolves the window (default 30 days, 12 weeks or 12 months), reads the ledger and returns periods, product-area and model breakdowns and freshness.
3. Person changes the grouping; the page refetches.
4. Person presses 'Download CSV'; the browser downloads usage-<from>-to-<to>.csv.
5. Admin does the same on /workspace/usage with a range and exports the daily CSV.

**What the person sees and gets**

- CSV starts with comment lines window_from, window_to, rows and truncated, then a header created_at, request_id, product_area, operation, model, project, input_tokens, output_tokens, credits (apps/web/app/api/usage/export/route.ts:51-75).
- Workspace CSV has a day_utc header or a dimension header and comment lines for breakdown_row_limit and omitted figures (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:62-100).
- Cells starting with = + - @ are prefixed to stay inert in spreadsheets (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:37-48).
- Caption 'Settled usage by <unit>' (apps/web/features/settings/sections/UsageSection.tsx:1104).

**Settings**

- Granularity, range and dimension query parameters (apps/web/app/api/usage/history/route.ts:38-45; apps/web/app/api/settings/organization/usage-analytics/export/route.ts:32-34).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Personal history with workload filter and API-key scope usage:read (apps/web/app/api/usage/history/route.ts:30-45).
- Personal CSV export capped at 10,000 rows with a truncated marker (apps/web/lib/services/account-usage-history-service.ts:30; apps/web/app/api/usage/export/route.ts:55-60).
- Workspace usage analytics and CSV export by six dimensions, admin only (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:55-120).
- Admin export is logged through logAdminDataAccess (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:105-115).
- A separate usage-report route accepts workspace API keys (apps/web/lib/server/service-principals/route-access.ts:96-100).
- CLI and VS Code read history (apps/cli/src/usage_summary.rs:444; apps/extension-vscode/src/utils/api.ts:1555).

**Incomplete**

- Breakdowns are capped at BREAKDOWN_LIMIT rows; the cut-off is reported in the workspace CSV but not in the personal CSV (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:79-90).

**Present but disconnected or switched off**

- none found

**Not available**

- Usage history screen on Desktop and Chrome: not established.
- Local-inference usage: the ledger table is managed_usage_requests, so Local usage is not recorded there [inferred] (apps/web/lib/services/account-usage-history-service.ts:99-105).

## 4. Required behaviour

**Established requirements**

- Usage reporting aggregates the ledger by time, model and feature for accounts and workspaces, with export. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.24)
- API callers need the usage:read scope for usage history. (source: apps/web/app/api/usage/history/route.ts:29)
- Local inference on mobile and desktop is free of any paid subscription. (source: task product context)
- Free usage screens show only Upgrade, never meters. (source: owner memory entry free-usage-upgrade-only (not a project file))

**Acceptance criteria**

1. History with granularity week returns 12 weekly periods by default and unknown granularity falls back to day.
2. An API key without usage:read is refused on /api/usage/history.
3. The personal CSV has the documented header and marks truncated=true when it hits 10,000 rows.
4. A plain workspace member or viewer is refused on workspace usage analytics and its export.
5. Workspace CSV cells beginning with = are quoted so they do not run as formulas.
6. Unsettled requests are not counted as settled usage and freshness reports them.
7. An unknown workload value returns a validation error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Usage shown is credits, not money, because credits come from creditsFromMicrousd (apps/web/lib/services/account-usage-history-service.ts:6).
- [inferred] A range change should not lose the previous view while loading, because the page keeps 'current' only when granularity matches (apps/web/features/settings/sections/UsageSection.tsx:1085).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Include a truncated marker for personal breakdowns.
- [proposed] Show Local inference activity on-device if a user wants it, kept separate from the billed ledger.
- [proposed] Offer a JSON export for API keys.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/usage/history | `apps/web/app/api/usage/history/route.ts` | Personal usage history. |
| service | account-usage-history-service | `apps/web/lib/services/account-usage-history-service.ts` | Aggregates the ledger, reads records, freshness. |
| service | usage-aggregation | `apps/web/lib/services/usage-aggregation.ts` | Window, settled filters, breakdown limit. |
| endpoint | GET /api/usage/export | `apps/web/app/api/usage/export/route.ts` | Personal CSV. |
| endpoint | GET /api/usage | `apps/web/app/api/usage/route.ts` | Account usage summary. |
| endpoint | GET /api/settings/organization/usage-analytics | `apps/web/app/api/settings/organization/usage-analytics/route.ts` | Workspace usage data. |
| endpoint | GET /api/settings/organization/usage-analytics/export | `apps/web/app/api/settings/organization/usage-analytics/export/route.ts` | Workspace CSV. |
| endpoint | GET /api/settings/organization/usage-report | `apps/web/app/api/settings/organization/usage-report/route.ts` | Usage report reachable with workspace keys. |
| service | organization-usage-service | `apps/web/lib/services/organization-usage-service.ts` | Workspace aggregates. |
| screen | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Personal usage page. |
| component | WorkspaceUsageAnalytics | `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx` | Workspace usage page. |
| hook | use-workspace-usage | `apps/web/features/workspace-console/hooks/use-workspace-usage.ts` | Loads workspace usage. |
| service | logAdminDataAccess | `apps/web/lib/server/admin-data-access.ts` | Records admin reads and exports. |
| table | managed_usage_requests | `apps/web/lib/services/account-usage-history-service.ts` | The ledger table read by history and export. |
| config | USAGE_WORKLOADS | `apps/web/lib/billing/usage-attribution.ts` | Allowed workload values. |
| command | CLI usage summary | `apps/cli/src/usage_summary.rs` | Fetches usage and history and prints them. |
| service | VS Code api client | `apps/extension-vscode/src/utils/api.ts` | Reads /api/usage and /api/usage/history. |
| service | Desktop cloud api | `apps/desktop/src/api/cloudApi.ts` | Calls /api/usage. |
| screen | Mobile cloud usage | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile usage settings. |
| service | Chrome free trial client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Managed usage endpoint. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page or client requests history with granularity and optional dates. | device and our servers | apps/web/features/settings/sections/UsageSection.tsx:1079; apps/cli/src/usage_summary.rs:444 |
| Server authenticates, enforces the usage:read scope for keys, resolves the window. | our servers | apps/web/app/api/usage/history/route.ts:30-47 |
| Server aggregates managed_usage_requests for the user and returns periods, breakdowns and freshness. | our servers | apps/web/lib/services/account-usage-history-service.ts:197-250 |
| CSV export reads up to 10,000 records and streams a file with no-store caching. | our servers | apps/web/app/api/usage/export/route.ts:55-90 |
| Workspace export checks admin plan and billing.read, aggregates the organization and logs the data access. | our servers | apps/web/app/api/settings/organization/usage-analytics/export/route.ts:55-120 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage ledger rows (request id, model, workload, tokens, credits, project) | table public.managed_usage_requests | Server only; read through the API | Retention unknown |
| Exported CSV | Downloaded to the person's device; not stored by the server | No | Cache-Control no-store (apps/web/app/api/usage/export/route.ts:85) |
| Admin data access record for workspace export | audit tables via logAdminDataAccess | Server only | See F100-12 |

**Models and providers.** The ledger holds a model label per request; the CSV shows the rate-card label when one exists (apps/web/app/api/usage/export/route.ts:68). Providers are not named in the personal export; the workspace export can group by provider. Which model or provider served the turn is decided elsewhere (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in; unauthenticated callers get 'Authentication required' (apps/web/app/api/usage/history/route.ts:44-52). |
| Permissions | usage:read for API keys on history (apps/web/app/api/usage/history/route.ts:29); billing.read for workspace analytics and export (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:62-70). |
| Subscription | Personal usage: no plan check found in the route. Workspace usage: team admin access (Team, Team Premium, Enterprise) (apps/web/app/api/settings/organization/usage-analytics/export/route.ts:62). |
| Limits and metering | Rate limit credits-balance for personal routes, settings-org for workspace; 10,000 record export cap; breakdown row limit BREAKDOWN_LIMIT. |
| Feature flags | none found in the code |
| Model compatibility | Shows any model that appears in the ledger; none excluded in the code read. |
| Provider restrictions | none found in the code |
| Local mode | Local inference is not read from this ledger [inferred]; the routes need a signed-in Cloud account, and no Local-mode branch was found in them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | History page uses the previous result only when its granularity matches, so a stale grouping is not shown. | apps/web/features/settings/sections/UsageSection.tsx:1085 |
| Error | Server logs and returns a generic 500 'Failed to fetch usage history'. | apps/web/app/api/usage/history/route.ts:57-60 |
| Open-ended window | Window is clamped rather than scanning everything. | apps/web/app/api/settings/organization/usage-analytics/__tests__/route.test.ts:203 |
| Unsettled requests | Counted separately as unsettled_requests with latest activity. | apps/web/lib/services/account-usage-history-service.ts:223-235 |
| Truncated export | Personal CSV states truncated true; workspace CSV states omitted rows. | apps/web/app/api/usage/export/route.ts:57; apps/web/app/api/settings/organization/usage-analytics/export/route.ts:79-90 |
| CLI cannot reach history | Prints 'Usage history unavailable: <error>'. | apps/cli/src/usage_summary.rs:531-534 |
| Offline | not handled in the code for the web page beyond error display (not read in detail) | apps/web/features/settings/sections/UsageSection.tsx |
| Accessibility | Group select has an aria-label; daily chart has an aria-label. | apps/web/features/settings/sections/UsageSection.tsx:1110; apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:75 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/usage/history/__tests__/route.test.ts`: History route.
- `apps/web/lib/services/__tests__/account-usage-history-service.test.ts`: History service aggregates.
- `apps/web/app/api/usage/export/route.test.ts`: Personal CSV export.
- `apps/web/lib/services/__tests__/organization-usage-service.test.ts`: Workspace aggregates.
- `apps/web/app/api/settings/organization/usage-analytics/__tests__/route.test.ts`: Refuses member and viewer, serves admin, clamps open window.
- `apps/web/app/api/settings/organization/usage-report/__tests__/route.test.ts`: Usage report route.
- `apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx`: History UI.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceUsageAnalytics.test.tsx`: Workspace usage UI.

**Test scenarios**

- **Personal history grouping**
  1. Open Settings, Usage.
  2. Switch 'Group usage history by' between day, week and month.
  - Expected: Periods and totals change; product-area and model tables reload.
- **CSV reconciles**
  1. Download the CSV for a window.
  2. Add up the credits column.
  - Expected: Sum equals the period total on the page for settled usage.
- **Scope refusal**
  1. Call /api/usage/history with an API key lacking usage:read.
  - Expected: Refused with a scope error.
- **Member refused**
  1. Sign in as a plain workspace member and open the usage-analytics export URL.
  - Expected: 403 'does not allow exporting workspace usage and spend'.
- **Formula guard**
  1. Use a project id beginning with = and export the project dimension.
  - Expected: Cell begins with a quote.

**Where to look when it fails**

- Log 'Failed to fetch usage history' and 'Failed to export usage' (apps/web/app/api/usage/history/route.ts:58; apps/web/app/api/usage/export/route.ts).
- Table managed_usage_requests, including unsettled rows.
- Admin data access records for resourceType organization_usage_export.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Desktop, mobile and Chrome history screens are not established.** Affects: Desktop, mobile, Chrome.. Evidence: apps/desktop/src/api/cloudApi.ts:366 uses /api/usage only.. Work needed: Confirm or build history views.
- **Personal export does not mark cut-off breakdowns.** Affects: Web users with many models.. Evidence: apps/web/app/api/usage/export/route.ts has no omitted lines.. Work needed: Add omitted markers.
- **Local inference usage is not reported anywhere in this feature.** Affects: Desktop and mobile Local users.. Evidence: History reads only managed_usage_requests.. Work needed: Decide whether on-device usage should be shown, separately and unmetered.
- **Workspace usage analytics is not reachable with workspace keys.** Affects: Admin automation.. Evidence: apps/web/lib/server/service-principals/route-access.ts:96-100.. Work needed: Add an access entry or document usage-report as the route.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-api-and-contracts
- SYS-authorization-and-workspaces
- surface:web
- surface:cli
- surface:vscode
- mode:cloud
- table:managed_usage_requests
- F100-12

## Unknown

- Retention of managed_usage_requests rows.
- Whether desktop, mobile and Chrome show history.
- Whether on-device Local usage is counted anywhere.
- Whether the personal export route accepts API keys with any scope.
