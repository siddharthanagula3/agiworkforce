---
id: "F082-07"
type: "feature"
title: "Usage history, export and discrepancy report"
aliases: ["Where your usage went", "Usage history", "Download CSV", "Report a billing problem", "Billing discrepancy report", "S82.18", "S82.32", "S82.33", "usage export"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S82.18", "S82.32", "S82.33"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:managed_usage_requests", "table:user_projects", "api:GET /api/usage/history", "api:GET /api/usage/export", "api:POST /api/usage/discrepancy", "F082-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-07 Usage history, export and discrepancy report

A paid Cloud account can see its settled usage grouped by UTC day, week or month, download the same window as a CSV file, and file a billing-problem report that opens a support ticket with a usage record attached. Web and the hosted desktop app have all three. Mobile has history only. The CLI prints a default history.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.18](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8218), [S82.32](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8232), [S82.33](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8233).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows settled managed (Cloud) usage by period, product area, model and project. Exports one row per settled request as CSV. Lets the user file a billing or usage discrepancy as a support ticket that carries a server-built usage record.

**Why it exists.** Users need to check what they were charged credits for and to dispute a charge. The brief asks for day, week and month history (S82.18), a downloadable report (S82.32) and a tracked discrepancy report (S82.33). A product decision keeps the discrepancy form off mobile and sends web-billed users to the web (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-27).

**Who uses it.** A signed-in person on a paid, self-serve Cloud plan. The section is hidden for Free and contract-priced plans (apps/web/features/settings/sections/UsageSection.tsx:1451).

**Problems it solves**

- Cannot see where credits went
- Cannot reconcile a charge with requests
- No tracked path to report a wrong charge

**Use cases**

- A user opens Settings > Usage, switches to Weeks, and sees spend per week and per model.
- A finance-minded user downloads the CSV to check a request ID.
- A user sees a credit total that looks wrong, picks one day, quotes an invoice reference and files a report.
- A mobile user checks last month's usage by model on the phone.

## 2. User experience

**Where to find it**

- Web: Settings > Usage, card titled 'Where your usage went' (apps/web/features/settings/sections/UsageSection.tsx:1101). Mounted by apps/web/features/settings/components/WebSettingsModal.tsx:291.
- Desktop (public Electron app): the same hosted web page, because the Electron window shows the hosted web app (doc: AGENTS.md section 5). The Tauri build's own usage section (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:447) has no history, export or report code (grep for history/export/discrepan in that file found none).
- Mobile: Settings, cloud usage screen, card 'Where your usage went' (apps/mobile/src/features/settings/cloud-usage/index.tsx:638).
- CLI: the account usage output lists 'Usage history' lines (apps/cli/src/usage_summary.rs:776).

**Before you start**

- Signed in with a Cloud account on a paid plan that is not contract-priced (UsageSection.tsx:1451).
- Mobile: Cloud mode active, signed in, not Free (apps/mobile/src/features/settings/cloud-usage/index.tsx:909-911).
- Discrepancy report: a confirmed reply email on the account (apps/web/app/api/usage/discrepancy/route.ts:13, 158).

**Screens and controls**

- Segmented control 'Group usage history by' with Days, Weeks, Months (UsageSection.tsx:120-124, 1110).
- Totals line, then lists: By day/week/month, By product area, By model, By project (UsageSection.tsx:1131-1150).
- Notice '{n} request(s) still settling and not counted above' (UsageSection.tsx:1152-1166).
- 'Download CSV' link and 'Report a billing problem' button (UsageSection.tsx:1176-1189).
- Report form fields: Period, 'Request ID (optional)', 'Invoice or charge reference (optional)', 'What looks wrong', buttons 'File report' and 'Cancel' (UsageSection.tsx:902+).
- Mobile: Days, Weeks, Months buttons; lists capped at 8 rows (apps/mobile/src/features/settings/cloud-usage/index.tsx:180-198). No project list, no download, no report.

**Journey**

1. Open Settings > Usage on web or desktop (or the cloud usage screen on mobile).
2. Scroll to 'Where your usage went'. History for Days loads first.
3. Pick Days, Weeks or Months. The list reloads for the new grouping and any open report form closes (UsageSection.tsx:1112-1115).
4. Optional: click 'Download CSV' to save the current grouping's window.
5. Optional: click 'Report a billing problem', choose the period, add a request ID and invoice reference, describe the problem, click 'File report'.
6. Read the confirmation 'Report filed as ...' and follow replies under Help.

**What the person sees and gets**

- Loading notice 'Loading usage history'; empty text 'No settled usage in this period.'; error text 'Could not load your usage history.' with a Retry button (UsageSection.tsx:1081, 1122, 1125; RetryNotice at line 276).
- CSV file named usage-<from date>-to-<to date>.csv (apps/web/app/api/usage/export/route.ts:85).
- After filing: 'Report filed as ...' plus 'Support has been notified. Replies and status updates appear under Help.' or a line saying the notification did not send (UsageSection.tsx, filed branch of DiscrepancyReportForm).
- Validation text 'Describe what looks wrong so support knows what to check.' (UsageSection.tsx:923).

**Settings**

- None specific to this feature. The export row cap is a constant of 10,000 rows (apps/web/lib/services/account-usage-history-service.ts:37).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- History API returns totals, periods, by product area, by model, by project and a count of requests still settling, grouped in UTC via date_trunc (apps/web/lib/services/account-usage-history-service.ts:211, apps/web/app/api/usage/history/route.ts:50).
- Default windows are 30 days, 12 weeks, 12 months, with weeks starting on Monday (account-usage-history-service.ts:29-56).
- CSV export: leading comment rows (window_from, window_to, rows, truncated), a header, then one row per request with created_at, request_id, product_area, operation, model, project, input_tokens, output_tokens, credits; served as an attachment with Cache-Control no-store (apps/web/app/api/usage/export/route.ts:62-90).
- Discrepancy route validates the body, requires CSRF and a confirmed email, shares the support-ticket write rate limit, looks up a disputed request across all retained history, opens a ticket and returns 201 (apps/web/app/api/usage/discrepancy/route.ts:41-48, 150-193).
- Web history card with all controls (UsageSection.tsx:1070-1195). Mobile history card (cloud-usage/index.tsx:638-730).
- CLI fetches and renders history (apps/cli/src/usage_summary.rs:444, 776) in the default grouping only: the request path has no granularity parameter (usage_summary.rs:16).

**Incomplete**

- The 'Download CSV' control is a plain download link. If the export request fails, the page shows no message or retry (UsageSection.tsx:1173-1180). Only history load failures have a Retry button. The brief's 'export returns an error with retry' is therefore true for history only.
- Mobile has no project breakdown (the card renders By day, product area and model only, cloud-usage/index.tsx:707-721), no CSV and no report form. The report form is intentionally not on mobile (doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-27).
- The CLI shows history only in the default day grouping, with no week/month choice (usage_summary.rs:16, 444).

**Present but disconnected or switched off**

- The Tauri desktop settings usage section has no history, export or report (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:447). It is retained internal code (doc: AGENTS.md section 5).

**Not available**

- VS Code and Chrome: no history, export or report found for this feature (brief status n/a).
- Mobile: CSV download and discrepancy form (decision above).
- Hidden for Free and contract-priced plans on web (UsageSection.tsx:1451).

## 4. Required behaviour

**Established requirements**

- Users can review usage history by day, week and month. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.18)
- Users can download a usage report, for example CSV. (source: S82.32 (brief))
- Users can report a billing or usage discrepancy and have it tracked. (source: S82.33 (brief))
- The history reads settled requests only. Requests still settling are shown as a count, not summed. (source: apps/web/lib/services/account-usage-history-service.ts:121 (SETTLED filter) and UsageSection.tsx:1152)
- Mobile has no in-app form for billing discrepancy reports. Web-billed plans are managed on web. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-27))

**Acceptance criteria**

1. Switching Days, Weeks, Months on web reloads history and labels the unit 'UTC day', 'UTC week, Monday to Sunday' or 'UTC calendar month'.
2. A paid account with usage sees totals, periods, product areas, models and projects whose credit totals match the CSV for the same window.
3. The CSV opens with the four comment rows and the header, has one row per settled request, and is served as an attachment with no caching.
4. A window with more than 10,000 settled requests produces '# truncated,true'.
5. Filing a report with an empty message shows the validation text and creates no ticket.
6. A valid report returns 201 and the page shows 'Report filed as ...'. The ticket text includes the usage window, balances and, if given, the disputed request and reference.
7. A failed history read shows 'Could not load your usage history.' with Retry.
8. A Free account does not see the history card (no credit figures).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CSV window equals the history window for the chosen grouping because both use the same default start and the same query parameters [inferred from apps/web/app/api/usage/export/route.ts:46-49 and history/route.ts:44-47; a test also checks this, UsageSection.history.test.tsx:161].
- The failed-export silence is a defect against the brief's retry line [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make 'Download CSV' fetch first and show an error with Retry on failure.
- [proposed] Add week and month choice to the CLI history output.
- [proposed] Show the project breakdown on mobile if the owner wants parity.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | UsageSection (history card, report form) | `apps/web/features/settings/sections/UsageSection.tsx` | Web and hosted-desktop UI: granularity picker, lists, Download CSV, report form |
| endpoint | GET /api/usage/history | `apps/web/app/api/usage/history/route.ts` | Returns grouped history; accepts granularity, from, to, workload; API key scope usage:read |
| endpoint | GET /api/usage/export | `apps/web/app/api/usage/export/route.ts` | CSV attachment, rate limit credits-balance, session auth (API key refused per test) |
| endpoint | POST /api/usage/discrepancy | `apps/web/app/api/usage/discrepancy/route.ts` | Validates report, builds usage record text, opens support ticket, returns 201 |
| service | account-usage-history-service | `apps/web/lib/services/account-usage-history-service.ts` | SQL for history, records and window start; export row cap |
| service | usage-aggregation helpers | `apps/web/lib/services/usage-aggregation.ts` | SETTLED/UNSETTLED filters, resolveUsageWindow, freshness |
| service | openTicket | `apps/web/lib/support/tickets/service.ts` | Creates the support ticket and notifies staff |
| service | managed usage summary | `apps/web/lib/services/managed-usage-summary-service.ts` | Balances attached to the report |
| service | csv writer | `apps/web/lib/csv.ts` | toCsv used by the export (formula-defusing checked by a test) |
| schema | AccountUsageHistoryResponse parser | `packages/contracts/types/src` | parseAccountUsageHistoryResponse shared by web and mobile (imported in UsageSection.tsx and mobile services/usage.ts:9) |
| table | managed_usage_requests | `apps/web/lib/services/account-usage-history-service.ts:119` | Source rows: status, actual_cost_microusd, usage json, model, created_at |
| table | user_projects | `apps/web/lib/services/account-usage-history-service.ts:168` | Project names joined to usage rows |
| screen | Mobile cloud usage UsageHistoryCard | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Mobile history card (Days/Weeks/Months) |
| service | fetchUsageHistory (mobile) | `apps/mobile/services/usage.ts` | GET /api/usage/history?granularity=... |
| command | usage history in CLI | `apps/cli/src/usage_summary.rs` | fetch_usage_history, render_usage_history |
| test | UsageSection.history.test.tsx | `apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx` | UI tests for history, regroup, export link, report |
| test | export route test | `apps/web/app/api/usage/export/route.test.ts` | CSV content, truncation, auth, errors |
| test | discrepancy route test | `apps/web/app/api/usage/discrepancy/route.test.ts` | Ticket creation, validation, CSRF, rate limit, email |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Settings > Usage; the page fetches GET /api/usage/history?granularity=<day/week/month> with the session. | device and our servers | apps/web/features/settings/sections/UsageSection.tsx:1079 |
| Server resolves the window start (30 days / 12 weeks / 12 months), runs six parallel SQL reads over the user's settled managed_usage_requests, returns totals and breakdowns. | our servers | apps/web/lib/services/account-usage-history-service.ts:200-249; history/route.ts:44-57 |
| Download CSV: the browser requests GET /api/usage/export?granularity=...; the server reads up to 10,000 settled rows and streams a text/csv attachment. | our servers | apps/web/app/api/usage/export/route.ts:46-90 |
| File report: the browser POSTs /api/usage/discrepancy with CSRF header; server checks rate limit, validates, loads history, balances and the disputed request, then opens a ticket and notifies staff. | our servers | apps/web/app/api/usage/discrepancy/route.ts:145-193 |
| Mobile fetches the same history endpoint through its API client. | device and our servers | apps/mobile/services/usage.ts:93-100 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Settled usage rows (request id, model, workload, tokens, cost) | table:managed_usage_requests | Server-side only; clients read through the API | unknown (retention window of this table not established in this review) |
| Support ticket with the usage record text | Support tickets store behind openTicket (table name not established) | Visible to the user under Help and to staff | unknown |
| CSV file | User's device downloads folder | No | User controlled; server keeps nothing (Cache-Control no-store, export/route.ts:86) |

**Models and providers.** History and CSV show which model each request used (label from the rate card, apps/web/app/api/usage/export/route.ts:73). They are read from stored rows and call no model or provider. Only Cloud (managed) requests appear; Local and own-key use is not recorded here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. History and estimate accept an API key with scope usage:read (history/route.ts:30); export and discrepancy are tied to the signed-in user (export test refuses an API key). |
| Permissions | Reads only the caller's own rows (user-scoped DB, history/route.ts:28). Discrepancy needs CSRF and a confirmed reply email (discrepancy/route.ts:147-158). |
| Subscription | Card shown only when usage is known and the plan is paid and not contract-priced (UsageSection.tsx:1451). Free sees no history. Mobile also hides it for Free (cloud-usage/index.tsx:909-911). |
| Limits and metering | Export capped at 10,000 rows with a truncated flag. History rate limit key credits-balance (history/route.ts:68). Discrepancy shares the support-tickets-write limit per user (discrepancy/route.ts:150). Message limited to half of the ticket message cap; reference 200 characters (discrepancy/route.ts:38-39). |
| Feature flags | None found in the code for this feature. |
| Model compatibility | Not model dependent. Rows for any model that was billed appear. |
| Provider restrictions | None found in the code. |
| Local mode | Local-mode usage is not metered by the server, so it does not appear. On the CLI, a BYOK account prints that provider spend is billed by the provider (apps/cli/src/usage_summary.rs:340-343). Mobile hides the card unless Cloud mode is active (cloud-usage/index.tsx:911). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner notice 'Loading usage history' (web), 'Loading usage history' status (mobile). | UsageSection.tsx:1121; cloud-usage/index.tsx:696 |
| Empty | 'No settled usage in this period.' and no lists. Download and report still appear when a history is loaded. | UsageSection.tsx:1125, 1170 |
| History read error | Message plus Retry; server returns a generic 500 'Failed to fetch usage history'. | UsageSection.tsx:1122; history/route.ts:60-63 |
| Export error | Server answers 500 'Failed to export usage' without database text. The page shows nothing because the control is a plain link. Not handled in the code. | export/route.ts:55-57; UsageSection.tsx:1173 |
| Truncated export | Comment row '# truncated,true' when row count reaches 10,000. | export/route.ts:66 |
| Requests still settling | Not counted; a status line says how many. | UsageSection.tsx:1152-1166 |
| Unknown request ID in report | Refused with 'That request ID is not a settled request on this account.' | discrepancy/route.ts:173-175 |
| Staff notice failed | Ticket is saved; the page says the notification did not send and points to Help. | UsageSection.tsx (filed branch); discrepancy/route.ts:177-186 returns staffNotified |
| Offline or timeout | History: generic error with Retry. Report: 'That report was not filed.' Not separately handled for offline. | UsageSection.tsx:912-960 |
| Accessibility | Segmented control has an aria-label; errors use role=alert, notices role=status. Mobile buttons carry accessibilityLabel 'Group usage by days/weeks/months'. | UsageSection.tsx:1110, 941; cloud-usage/index.tsx:672 |
| Offline on mobile / reconnect | not handled in the code beyond the generic error and refresh | cloud-usage/index.tsx:696 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/UsageSection.history.test.tsx`: Breakdowns, newest-first order, regroup by week with matching export link, settling notice, empty vs failed read, retry, report filing with invoice, empty message refused, refused report reason, no credit figures for Free
- `apps/web/app/api/usage/export/route.test.ts`: CSV content in credits, project fallback, formula defusing, truncation flag, same window as history, API key refused, unauthenticated refused, 500 without database message
- `apps/web/app/api/usage/discrepancy/route.test.ts`: Ticket with usage record, reference, disputed request, unknown request refused, unreadable balance wording, contract plan wording, bad JSON, email rules, CSRF, rate limit, no ticket when usage unreadable
- `apps/web/app/api/usage/history/__tests__/route.test.ts`: History route behaviour
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile cloud usage screen (history card coverage not verified by this review)
- `apps/cli/src/usage_summary.rs`: In-file tests: parse history, by product area and model in credits, week/month labels, empty history (lines 1367-1438)

**Test scenarios**

- **Regroup and export agree**
  1. Sign in on web with a paid account that has usage.
  2. Open Settings > Usage, choose Weeks.
  3. Note the window and total.
  4. Click Download CSV.
  - Expected: Heading says UTC week, Monday to Sunday. The CSV window rows match the shown window and the sum of credits matches the total (within rounding to 4 places).
- **Export failure**
  1. Open the history card.
  2. Make /api/usage/export fail (for example block it in the browser network tools).
  3. Click Download CSV.
  - Expected: Observe whether any message appears. The code shows none; record the result against the gap.
- **File a report**
  1. Open 'Report a billing problem'.
  2. Leave the message empty and submit.
  3. Then choose one day, paste a request ID from the CSV, add an invoice reference, describe the issue and submit.
  - Expected: First submit shows the validation text. Second returns 201, shows 'Report filed as ...', and a ticket exists under Help with the usage record text.
- **Free and contract accounts**
  1. Open Settings > Usage on a Free account, then a contract-priced account.
  - Expected: No 'Where your usage went' card.
- **Mobile history**
  1. On mobile in Cloud mode with a paid account open cloud usage.
  2. Tap Months.
  - Expected: List by month, no project list, no download, no report.

**Where to look when it fails**

- Server logs 'Failed to fetch usage history', 'Failed to export usage', '[usage-discrepancy] reported' (route files above).
- Table managed_usage_requests (status, actual_cost_microusd) for mismatches.
- Rate limit keys credits-balance and support-tickets-write.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **Download CSV shows no error or retry when the export fails.** Affects: Web and hosted desktop users. Evidence: apps/web/features/settings/sections/UsageSection.tsx:1173-1180 is a plain anchor with download. Work needed: Fetch the file in code, show the server message with a retry, then save the blob.
- **Mobile lacks project breakdown, CSV and report form.** Affects: Mobile users. Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:707-721; doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-27. Work needed: Project list only if wanted. CSV and form are decided against.
- **CLI history has no week or month choice.** Affects: CLI users. Evidence: apps/cli/src/usage_summary.rs:16. Work needed: Pass a granularity argument to the history path.
- **Brief says desktop is built; the Tauri usage section has none of the three controls.** Affects: Tauri build only (internal). Evidence: apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:447. Work needed: None if Tauri stays internal; state that in the brief.
- **Brief line references for the report route are stale (brief cites 182-195; code is at 177-193).** Affects: Documentation. Evidence: apps/web/app/api/usage/discrepancy/route.ts:177-193. Work needed: Refresh the brief.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:managed_usage_requests
- table:user_projects
- api:GET /api/usage/history
- api:GET /api/usage/export
- api:POST /api/usage/discrepancy
- F082-08

## Unknown

- Retention period of managed_usage_requests rows.
- Name of the table behind openTicket and how long tickets are kept.
- Whether the mobile cloud usage test covers the history card.
- Whether Electron desktop loads the web Settings > Usage page unchanged (stated in AGENTS.md section 5; not re-checked in the Electron main process here).
- Whether week grouping starts on Monday is shown by usageHistoryWindowStart; the SQL date_trunc week rule is assumed to be Postgres Monday [inferred].
