---
id: "F035-08"
type: "feature"
title: "History, run again and compare"
aliases: ["Research history", "Library tab", "Reports gallery", "ResearchReportsGallery", "Reports screen", "Run again", "Refresh or rerun research (S35.26)", "Research-history list (S35.25)", "Compare revisions (S35.27)"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S35.25", "S35.26", "S35.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:research_reports", "table:web_conversations", "api:GET /api/research/reports", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "F035-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-08 History, run again and compare

Lists past Deep Research reports, newest first, loads older pages on demand, and opens one in the reader. In the web Report tab, Run again starts a new run of the report's question. Mobile has a Reports screen, and a Run again button on the chat research card. Comparing revisions is not built.

Area: [35. Research workspace](README.md). Requirement items: [S35.25](../../10-requirements/capabilities/035-research-workspace.md#s3525), [S35.26](../../10-requirements/capabilities/035-research-workspace.md#s3526), [S35.27](../../10-requirements/capabilities/035-research-workspace.md#s3527).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Fetches saved reports from GET /api/research/reports, shows them with date, source count and model, and opens one. Run again sends the saved question as a new research turn; it never edits the old report.

**Why it exists.** Reports are durable work. People need to find an old report from any chat and refresh it when sources change.

**Who uses it.** People on a plan with Deep Research, on web, public Desktop and mobile.

**Problems it solves**

- Reports from older chats were unreachable before the gallery existed (ResearchReportsGallery.tsx header comment).
- Stale research needs a refresh without retyping the question.

**Use cases**

- Open Library tab, scroll, press 'Load older reports'.
- Open a month-old report, press Run again to get fresh sources.
- On mobile, drawer Reports, pull to refresh.
- Fetch one report by request id (API).

## 2. User experience

**Where to find it**

- Web and public Desktop: Research panel, tab 'Library' (ResearchPanel.tsx:432-445,473-478). Run again is on the 'Report' tab header only.
- Mobile: drawer 'Reports' item opens the 'Reports' screen (DrawerContent.tsx:160; ReportsScreen.tsx:517). Run again is on the research card in a chat (ResearchRunCard.tsx:677-684).
- CLI and VS Code: none. Chrome: unverified; no research list code found in apps/extension (grep).

**Before you start**

- Signed in. Mobile: Cloud mode and sign in (ReportsScreen.tsx:532).
- Web Run again needs the page able to start a turn: the panel gets onRunAgain only when not streaming (apps/web/features/chat/pages/WebChatPage.tsx:7873-7876).
- Running again needs a plan with Deep Research (request-processor.ts:1508).

**Screens and controls**

- Web list row: title (or question, or 'Untitled report'), date, '{n} sources', model, status chip for unfinished (ResearchReportsGallery.tsx:58-97).
- 'Load older reports' button; 'All reports' back button (ResearchReportsGallery.tsx:167-174,221-231).
- Report header 'Run again' button, aria-label 'Run this research again for current sources' (ResearchReportView.tsx:353-365).
- Mobile: pull to refresh, 'Try again', infinite scroll, row with status chip (ReportsScreen.tsx).

**Journey**

1. Open the Library tab (web) or Reports (mobile).
2. See 'Loading reports…' then the newest reports.
3. Open a report.
4. Press 'Run again' in the Report tab (web) or on the chat research card (mobile).
5. A new run starts with the same question; the panel closes on web; the old report stays.

**What the person sees and gets**

- 'Loading reports…', error alert, 'No reports yet. Deep Research runs are saved here across all of your chats'.
- 'Could not load older reports' inline with the list kept.
- Status chip: paused, or the report status.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Endpoint validates requestId, conversationId (uuid), limit 1-100, cursor; returns report by requestId or a page with nextCursor (apps/web/app/api/research/reports/route.ts:18-63).
- Server sorts newest first with a keyset cursor, default 20 per page when no limit is sent (apps/web/lib/services/research-report-service.ts:331-384).
- Web gallery asks for 50, appends older pages without duplicates, keeps the list when a later page fails (ResearchReportsGallery.tsx:31,114-136).
- Web Run again calls handleSend(query, ..., {researchEnabled:true}) (apps/web/features/chat/pages/WebChatPage.tsx:6208-6212).
- Mobile list with pull-to-refresh, load-more, separate older-page error (ReportsScreen.tsx:517-690).

**Incomplete**

- The gallery detail view passes no Run again, so a report opened from Library cannot be re-run from there (ResearchReportsGallery.tsx:176 passes only onAskFollowUp). Run again exists only in the Report tab.
- Mobile ReportsScreen detail has no Run again; mobile re-run is on the chat card (ResearchRunCard.tsx:459,677).
- Web Report tab shows only the newest report of the open conversation (limit=1) (ResearchPanel.tsx:261).

**Present but disconnected or switched off**

- Mobile list hidden when FEATURES.research is off (ReportsScreen.tsx:593).
- Tauri history (apps/desktop/src/features/research/ResearchHistory.tsx) uses a local store; retained internal code.

**Not available**

- Compare two revisions: not built anywhere (brief S35.27).
- No research list on CLI or VS Code (brief S35.25; docs/product/surface-feature-matrix.md).
- Search or filter inside the history list: not found.

## 4. Required behaviour

**Established requirements**

- The user can browse past reports and reopen one. (source: brief S35.25)
- The user can refresh or rerun a finished report. (source: brief S35.26)
- The user can compare two revisions and see what changed. Missing everywhere. (source: brief S35.27)
- List from GET /api/research/reports, 1 to 100 per page, newest first, cursor for older pages, filter by conversation or fetch by request id. (source: apps/web/app/api/research/reports/route.ts:18-23)
- Run again sends the original question as a new run and does not edit the old report. (source: apps/web/features/chat/pages/WebChatPage.tsx:6208-6212)

**Acceptance criteria**

1. First load asks for limit 50 and shows the newest first.
2. When the server returns a cursor, 'Load older reports' appends without duplicates.
3. A failed older-page load shows an error and keeps the list.
4. limit=0 or 101 returns 400.
5. Fetching by requestId of another user returns 404.
6. Run again starts a new run; the old report is unchanged.
7. Run again is absent while a turn is streaming.
8. Empty history shows 'No reports yet'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reports from temporary or deleted chats do not appear in the full list because of the join conditions [inferred from research-report-service.ts:354-360].
- A Run again request goes through plan approval, since a run without resume data requires plan approval [inferred from research-run-options.ts: requirePlanApproval].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Run again in the Library detail and the mobile Reports detail.
- [proposed] Build compare: store run lineage between a report and its reruns and show a diff of findings and sources.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportsGallery | `apps/web/features/chat/components/research/ResearchReportsGallery.tsx` | Web history list, load more, open report |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Hosts Library and Report tabs; wraps Run again to close the panel |
| component | ResearchReportView Run again | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Run again button |
| screen | WebChatPage handleResearchRunAgain | `apps/web/features/chat/pages/WebChatPage.tsx` | Starts a research turn with the saved query |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | List, filter, fetch by request id |
| service | listResearchReports | `apps/web/lib/services/research-report-service.ts` | Keyset paging and ownership filter |
| service | decodeKeysetCursor | `apps/web/lib/identity/pagination.ts` | Cursor decode and validation |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Rows and user/created index |
| table | web_conversations | `apps/web/lib/services/research-report-service.ts` | Joined to hide reports of temporary or deleted chats |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile list, refresh, paging |
| service | fetchResearchReports | `apps/mobile/src/features/research/service.ts` | Mobile fetch and mapping |
| component | DrawerContent reports item | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Entry point, hidden if flag off |
| component | ResearchRunCard | `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx` | Mobile Run again button |
| screen | mobile chat screen retry wiring | `apps/mobile/app/(app)/chat/[id].tsx` | Supplies onRetry to the card (brief S35.26 cites line 738) |
| endpoint | POST chat completions research flag | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Runs the new research turn |
| config | FEATURES.research | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile flag |
| component | Tauri ResearchHistory | `apps/desktop/src/features/research/ResearchHistory.tsx` | Separate internal local history |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Gallery requests /api/research/reports?limit=50 with the session cookie. | device | ResearchReportsGallery.tsx:142-145 |
| Server validates the query, scopes the database to the user and organisation, reads a page plus one row to compute nextCursor. | our servers | route.ts:29-63; research-report-service.ts:331-384 |
| Client lists rows and opens a chosen one with no second request because the list carries the full body. | device | ResearchReportsGallery.tsx:14-19 |
| Run again sends the saved query as a new chat turn with research enabled; the server runs the research loop with web search through the chosen provider. | our servers | WebChatPage.tsx:6208-6212; route.ts:517-570 |
| Search and fetch calls go to search and web sources. | outside service | research-loop.ts (url_fetch tool and provider search, lines 1190-1240) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New report row per run, keyed by request id | public.research_reports | Via API to all apps | Old reports are kept when re-run; deletion rules unknown |

**Models and providers.** Listing uses no model. Run again uses the model and provider selected for the chat turn; the list shows the stored model name per report (ResearchReportsGallery.tsx:83).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; mobile also Cloud mode. |
| Permissions | Per user and organisation scope (research-report-service.ts:354-358). |
| Subscription | Listing has no plan check. Run again is a research request and is refused on plans without deep_research (request-processor.ts:1508-1518). |
| Limits and metering | List route rate limit bucket 'chat-conversation' (route.ts:26). Run again is metered as a research run; settled cost is stored per report (research-report-service.ts:196-208). |
| Feature flags | Mobile FEATURES.research. |
| Model compatibility | Run again needs a model that supports research (request-processor.ts:2477). |
| Provider restrictions | Run again follows the managed route; own-key use of Deep Research is not established in these files: unknown. |
| Local mode | No history in Local mode: mobile shows the sign-in message; reports live on our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading reports…' / skeletons | ResearchReportsGallery.tsx:182-184 |
| Error | role=alert with message; mobile 'Try again' | ResearchReportsGallery.tsx:185-191 |
| Empty | 'No reports yet' | ResearchReportsGallery.tsx:192-206 |
| Older page failed | Own error, list kept, retry from same cursor | ResearchReportsGallery.tsx:131-133,216-220; ReportsScreen.tsx:670 |
| Cancel | Initial load is aborted when the gallery unmounts; load-more has no abort (not handled in the code) | ResearchReportsGallery.tsx:158-162 |
| Streaming | Run again hidden while a turn streams | WebChatPage.tsx:7873-7876 |
| Race on mobile | A generation counter discards stale older pages after a refresh | ReportsScreen.tsx (listGenerationRef) |
| Offline | Shows load error; no cached list found | not handled in the code beyond the error |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportsGallery.test.tsx`: Fetch all reports, open, cursor paging, older-page failure and retry, empty and error states
- `apps/web/app/api/research/reports/__tests__/route.test.ts`: Paging with equal timestamps, cursor contents, last page, conversation listing
- `apps/mobile/src/features/research/__tests__/ReportsScreen.test.tsx`: Mobile list
- `apps/mobile/src/features/research/__tests__/ReportsScreenModelName.test.tsx`: Model name in row

**Test scenarios**

- **Page through history**
  1. Account with over 50 reports
  2. Open Library
  3. Press Load older reports until gone
  - Expected: No duplicates; button disappears when no cursor.
- **Older page failure**
  1. Block the network after the first page
  2. Press Load older reports
  - Expected: Inline error, list stays, retry works.
- **Run again**
  1. Open Report tab of a chat with a report
  2. Press Run again
  - Expected: A new research run starts; old report unchanged; panel closes.
- **Run again from Library**
  1. Open a report from Library
  - Expected: No Run again button (documented gap).
- **Bad query**
  1. GET /api/research/reports?limit=500
  - Expected: 400 Invalid research report query.
- **Mobile Local**
  1. Local mode, open Reports
  - Expected: Sign-in message.

**Where to look when it fails**

- 400/404 messages from route.ts.
- Rate limit responses from withRateLimit.
- Table research_reports and web_conversations (deleted_at, is_temporary).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Compare revisions is not built** Affects: All apps. Evidence: brief S35.27. Work needed: Link reruns to the original and add a diff view.
- **Run again missing in Library detail and mobile Reports detail** Affects: Web, mobile. Evidence: ResearchReportsGallery.tsx:176; ReportsScreen.tsx ReportDetail. Work needed: Pass onRunAgain in the gallery; add a button on mobile.
- **Chrome status unverified; no CLI or VS Code list** Affects: Chrome, CLI, VS Code. Evidence: brief; grep of apps/extension found no reports API use. Work needed: Decide scope; verify Chrome.
- **No search or filter in the list** Affects: Web, mobile. Evidence: No code found. Work needed: Add search once volume warrants.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:research_reports
- table:web_conversations
- api:GET /api/research/reports
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- F035-07

## Unknown

- Whether Chrome extension has any research list (brief says unverified; none found).
- Whether re-run reports link to the original: no lineage field found.
- Retention or deletion of reports.
- Whether Deep Research works with own-key mode.
