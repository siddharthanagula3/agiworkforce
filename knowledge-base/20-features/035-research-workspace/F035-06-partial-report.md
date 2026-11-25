---
id: "F035-06"
type: "feature"
title: "Partial report"
aliases: ["Partial report", "Interrupted report", "Paused report", "research_reports", "Research library", "S35.19"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.19"]
depends_on: ["F035-01", "F035-04", "F035-05", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:research_reports", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-observability-and-operations", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-06 Partial report

When a run is stopped, paused, or cut off it is saved once as an interrupted report with the sources and steps gathered. Stopping or pausing stores no written text; only a cut-short writing turn keeps partial text. The reader shows a banner. Budget limits still produce a completed report that names what was not searched.

Area: [35. Research workspace](README.md). Requirement items: [S35.19](../../10-requirements/capabilities/035-research-workspace.md#s3519).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Saves the run's state in table research_reports exactly once with a status (completed, interrupted, failed), so the person can reopen it or resume [research-loop.ts:1984-2032].

**Why it exists.** A stopped or failed run has cost money and gathered real sources; they should not vanish (migration comment 0094).

**Who uses it.** People who stop, pause or lose a run, and anyone who reopens a report from the Library tab.

**Problems it solves**

- Lost work after a stop or crash.
- Not knowing why a report is incomplete.

**Use cases**

- Stop a run, then resume it from the saved sources.
- Open an interrupted report to see why it ended.
- Reopen a finished report in the library.

## 2. User experience

**Where to find it**

- Web and Desktop: side panel Report and Library tabs, and the reader dialog [ResearchPanel.tsx:403-440; ResearchReportsGallery.tsx:105].
- Mobile: Reports screen [apps/mobile/src/features/research/ReportsScreen.tsx].

**Before you start**

- A run that passed plan approval (a run that only stopped for approval stores no report) [research-loop.ts:3594].

**Screens and controls**

- Web banner: 'This report is interrupted: <reason>' or 'This research is paused. Resume it from its card in the chat to continue from where it stopped.' [ResearchReportView.tsx:503-509].
- Mobile list shows the status text (for example interrupted) and the reader shows the error text in a box; no paused-specific wording [ReportsScreen.tsx:214,391-405].

**Journey**

1. Stop or pause a run, or let it fail or hit its limits.
2. The run saves the report once.
3. Open the report from the Library tab or reports list.
4. Read the banner and sources; resume if wanted.

**What the person sees and gets**

- Final status text 'Research complete, but the report could not be saved' when the write failed [research-loop.ts:3550-3560].
- In-app notice only for completed or failed reports, none for interrupted [agent-notification-service.ts:209-214].

**Settings**

- None found for partial reports.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- persistRun writes once, retries 3 times with growing waits, and never throws into the stream [research-loop.ts:1984-2032; 188-189].
- Cancel stores interrupted with empty content and 'Research was cancelled.' [research-loop.ts:2044].
- Pause stores interrupted with the paused reason [research-loop.ts:2094; packages/contracts/types/src/research.ts:373-381].
- Abrupt teardown stores interrupted with 'Research stopped before the report was written.' [research-loop.ts:3595].
- A writing turn that ends early stores the partial text as interrupted [research-loop.ts:3516-3536].
- Failed empty runs store the gathered sources [research-loop.ts:3309,3574].
- Budget cut-offs (searches, time, no new sources) still run the writing turn; the report is completed and the prompt names unsearched steps [research-loop.ts:3377-3391,3405-3420,3452].
- GET /api/research/reports returns one report by request id or a page; library list hides temporary and deleted chats [research/reports/route.ts:48-60; research-report-service.ts:320-384].
- Mobile Reports screen reads the same endpoint [apps/mobile/src/features/research/service.ts:121-145].

**Incomplete**

- Stop and pause store an empty body; the 'partial report from gathered material' is the sources and steps only, since gathering rounds forward no prose [research-loop.ts:2044,2094; runTurn forwardContent false at 3033-3040]. The brief's 'done' for S35.19 overstates this.
- The banner treats every status except completed as incomplete, including failed [ResearchReportView.tsx:326].
- Mobile has no paused-specific banner.
- A resume is a new request id, so it creates a second report row; whether the library shows both is not established [0094_research_reports.sql unique (user_id, request_id); WebChatPage.tsx:5992].
- Migrations 0191 (settled cost) and 0224 (research retention window) carry the header 'NOT YET APPLIED' in the repo; apply status is not established.

**Present but disconnected or switched off**

- Settled cost column and retention domain depend on migrations 0191 and 0224 [0191_research_report_settled_cost.sql:3; 0224_research_retention_domain.sql:3].

**Not available**

- CLI, VS Code, Chrome: no report reader (surface-feature-matrix lists CLI absent) [doc: docs/product/surface-feature-matrix.md:277].

## 4. Required behaviour

**Established requirements**

- If a run is stopped or cut short, a partial report from gathered material is produced and labelled as partial. (source: brief S35.19)
- Resume an interrupted report without rerunning completed actions unnecessarily; export and reopen with sources intact. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. After Stop, a research_reports row exists with status interrupted and error 'Research was cancelled.'.
2. After Pause, the row error equals the paused reason and the reader shows the paused banner.
3. A run waiting for approval has no row.
4. If the first write fails twice and succeeds the third time, one row exists.
5. If all writes fail the run still shows its answer and the final label says it was not saved.
6. A run that hits the search budget ends completed and the report says which planned searches were not run.
7. The report API returns the row only to its owner.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The person expects readable partial text after Stop; the code provides none unless the writing turn started.

**Proposed improvements** (suggestions, not requirements)

- [proposed] On stop, run a short writing turn from the gathered sources.
- [proposed] Show a paused banner on mobile.
- [proposed] Notify on interrupted reports or document why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | persistRun | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Single write with retries and statuses |
| service | saveResearchReport | `apps/web/lib/services/research-report-service.ts` | Upsert on user and request id |
| service | listResearchReports | `apps/web/lib/services/research-report-service.ts` | Library list and by-request read |
| service | recordResearchRunSettledCost | `apps/web/lib/services/research-report-settlement.ts` | Copies settled cost onto the report, retries by job |
| job | research.settle-report-cost | `apps/web/lib/services/research-report-settlement.ts` | Queued retry when the cost write fails |
| service | notifyResearchReportSettled | `apps/web/lib/services/agent-notification-service.ts` | Notice for completed or failed reports |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Read one or list reports |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Report storage with row-level security |
| schema | settled cost column | `apps/web/db/neon/0191_research_report_settled_cost.sql` | Adds settled_cost_microusd |
| schema | research retention domain | `apps/web/db/neon/0224_research_retention_domain.sql` | Adds research as a retention domain |
| other | isPausedResearchReport | `packages/contracts/types/src/research.ts` | Recognises the paused reason |
| service | buildPersistedTurnResearch | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.ts` | Maps report status to the turn's phase |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Reader and banner |
| component | ResearchReportsGallery | `apps/web/features/chat/components/research/ResearchReportsGallery.tsx` | Library list |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile list and reader |
| service | mobile research service | `apps/mobile/src/features/research/service.ts` | Fetches and maps reports |
| test | research-report-service tests | `apps/web/lib/services/research-report-service.test.ts` | Report service |
| test | reports route tests | `apps/web/app/api/research/reports/__tests__/route.test.ts` | Endpoint |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The loop ends in one of several paths and calls persistRun with a status and optional error. | our servers | research-loop.ts:2044,2094,3309,3536,3544,3574,3595 |
| The sink upserts the row by user and request id and notifies on completed or failed. | our servers | research-run-options.ts:75-95 |
| After usage settles, the cost is copied onto the row, or a retry job is queued. | our servers | research-report-settlement.ts:11-35 |
| The client fetches the report when the panel or the Reports screen opens. | device and our servers | ResearchPanel.tsx:250-270; mobile service.ts:121 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report: query, title, summary, content, citations, steps, key findings, gaps, status, source count, duration, error, model, provider, settled cost | table research_reports | server side; clients read through the API | deleted with the conversation (cascade); 0224 would add a workspace retention window (not established as applied) |

**Models and providers.** Model and provider names of the serving route are stored on the row [research-run-options.ts:68-78]. No extra model call is made to build a partial report.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; rows are owner-only by row-level security [0094_research_reports.sql]. |
| Permissions | Owner read, insert, update, delete policies. |
| Subscription | No separate gate on reading; creation needs the research capability. |
| Limits and metering | List page 1 to 100 rows; rate limit class chat-conversation [research/reports/route.ts:19-26]. |
| Feature flags | none found in the code. |
| Model compatibility | None. |
| Provider restrictions | None. |
| Local mode | Cloud only. Mobile reports screen needs a signed-in cloud account [ReportsScreen.tsx:600]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Storage outage | 3 attempts then log; run continues; label says not saved. | research-loop.ts:2017-2030,3550 |
| Cancelled | Empty content, error 'Research was cancelled.'. | research-loop.ts:2044 |
| Paused | Empty content, paused reason. | research-loop.ts:2094 |
| Writing turn cut short | Partial text stored interrupted; bar shows 'Report cut short'. | research-loop.ts:3536-3539 |
| Empty writing turn | Failed row with gathered sources. | research-loop.ts:3500-3512 |
| Loading, error, empty in mobile list | loading, loaded, error states with 'Could not load reports.' | ReportsScreen.tsx:523-631 |
| Report not found | 404. | research/reports/route.ts:53 |
| Accessibility | Reader is a dialog with aria-modal; banner has an icon and text. | ResearchReportView.tsx:700-708,503 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/research-report-service.test.ts`: Saving, listing and validation of report rows
- `apps/web/app/api/research/reports/__tests__/route.test.ts`: Report endpoint
- `apps/web/db/neon/research-reports-migration.test.ts`: Report table migration
- `apps/web/db/neon/research-retention-domain-migration.test.ts`: Retention domain migration
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.test.ts`: Phase from report status
- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Report reader (banner cases not confirmed)
- `apps/web/features/chat/components/research/ResearchReportsGallery.test.tsx`: Library list
- `packages/contracts/types/src/__tests__/research.test.ts`: Contract helpers

**Test scenarios**

- **Stop**
  1. Start and approve a run
  2. Stop during searching
  3. Open Library, then the report
  - Expected: Banner 'This report is interrupted: Research was cancelled.' with gathered sources
- **Pause**
  1. Pause a run
  2. Open the report
  - Expected: Paused banner text pointing to Resume
- **Budget cut**
  1. Set a tiny AGI_RESEARCH_MAX_SEARCHES in a test environment
  2. Run
  - Expected: Completed report naming planned searches that were not run
- **Plan only**
  1. Send a question and cancel at the plan
  - Expected: No research_reports row
- **Mobile list**
  1. Open Reports on mobile after a stopped run
  - Expected: Row shows status interrupted; reader shows the reason in the error box

**Where to look when it fails**

- Table research_reports (status, error, sources_consulted).
- Log '[research-loop] research report could not be persisted'.
- Log 'Settled research cost could not be recorded on the report; queued for retry'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Stop and pause give no written partial text** Affects: All apps. Evidence: research-loop.ts:2044,2094. Work needed: Write a short report from gathered sources or label the result as sources only
- **Mobile lacks paused banner** Affects: Mobile. Evidence: ReportsScreen.tsx:214,391. Work needed: Use isPausedResearchReport
- **Interrupted reports send no notification** Affects: All apps. Evidence: agent-notification-service.ts:214. Work needed: Decide and document
- **Resume creates a second row** Affects: Library users. Evidence: unique (user_id, request_id) and new request id. Work needed: Link or merge resumed reports
- **Migrations 0191 and 0224 marked not applied** Affects: Cost on report and retention. Evidence: migration headers. Work needed: Confirm apply status
- **No report reader on CLI, VS Code, Chrome** Affects: Those apps. Evidence: docs/product/surface-feature-matrix.md:277. Work needed: Decide scope
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F035-01
- F035-04
- F035-05
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:research_reports
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-observability-and-operations
- SYS-files-artifacts-and-storage

## Unknown

- Whether migrations 0191 and 0224 are applied in any environment.
- Whether the library lists both the interrupted and the resumed report of one run.
- How the Library tab marks interrupted reports (list view not read in full).
- Exact banner cases in ResearchReportView.test.tsx.
