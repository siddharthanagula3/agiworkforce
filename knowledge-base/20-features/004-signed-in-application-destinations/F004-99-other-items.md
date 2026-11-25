---
id: "F004-99"
type: "feature"
title: "Other items in Signed-in application destinations"
aliases: ["Other items in Signed-in application destinations", "Video studio (S4.29)", "Research report reader (S4.32)", "Deep Research reports gallery", "Reports screen", "Research panel Library tab"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S4.29", "S4.32"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-voice-and-media", "SYS-sync-and-continuity", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/research/reports", "api:GET /api/media/jobs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-99 Other items in Signed-in application destinations

Two leftover items of the signed-in destinations area. S4.29, a dedicated video studio, was decided against: video is made in chat and kept in the Library. S4.32, the research report reader, lists a person's Deep Research reports and opens one with sections and sources, on web (and Electron) and on mobile.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.29](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s429), [S4.32](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s432).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Report reader: web side panel tab 'Library' lists every report the person owns, newest first, and opens one in the report view; mobile 'Reports' screen does the same. Video studio: no separate screen; video jobs appear in the Library with cancel.

**Why it exists.** Brief S4.32: list research reports and open one with sections and cited sources. Brief S4.29 asked for a video studio, but the founder decision says ChatGPT's studio is the separate Sora app and Claude has none (doc: docs/decisions/2026-09-27-founder-decisions.md:132).

**Who uses it.** Signed-in people who ran Deep Research (reader); people generating video (via chat and Library).

**Problems it solves**

- A person could not reach a report from an older chat; the gallery lists across all chats (ResearchReportsGallery.tsx header comment).
- Video jobs need a place to see status and cancel (apps/web/features/library/components/LibraryView.tsx:42,246).

**Use cases**

- Open the research panel, choose the Library tab, pick an older report and ask a follow-up from it.
- On the phone open the drawer entry for Reports, open a report, jump to a section.
- Cancel a running video job from the Library (LibraryView.tsx:246-250).

## 2. User experience

**Where to find it**

- Web and Electron: research side panel with tabs 'Sources', 'Report' and 'Library'; Library holds the gallery (apps/web/features/chat/components/research/ResearchPanel.tsx:395-475).
- Mobile: drawer row with label key drawer.reports and a telescope icon, route /(app)/reports, hidden when FEATURES.research is false (apps/mobile/src/features/drawer/components/DrawerContent.tsx:159-165,565).
- Video: Library view on web (apps/web/features/library/components/LibraryView.tsx) and mobile (apps/mobile/src/features/library/index.tsx); no separate studio page found.

**Before you start**

- Signed in. Web list is user-scoped through getUserScopedDb (apps/web/app/api/research/reports/route.ts:45). Mobile shows 'Sign in to read your reports' with 'Research reports are saved to your Managed Cloud account.' otherwise (ReportsScreen.tsx:604-612).
- At least one saved report, else empty state.

**Screens and controls**

- Web gallery: list rows, 'Load older reports' button, 'All reports' back button, detail view with ask-follow-up (ResearchReportsGallery.tsx:158-232).
- Mobile Reports: header 'Reports', skeleton rows, 'Try again' button, 'More report actions', 'Ask a follow-up about this report', section links 'Go to <section>' (ReportsScreen.tsx:115-259,454,632).

**Journey**

1. Web: open the research panel and choose Library; gallery calls GET /api/research/reports?limit=50.
2. Click a row; the same report view as the Report tab opens with no second request because the list carries the body.
3. Press 'All reports' to return; press 'Load older reports' to page by cursor.
4. Mobile: open the drawer, choose Reports, tap a report, scroll sections or tap a section link, optionally ask a follow-up.

**What the person sees and gets**

- Loading text 'Loading reports…'; error alert text 'Could not load reports'; empty 'No reports yet' with 'Deep Research runs are saved here across all of your chats' (ResearchReportsGallery.tsx:153,198-210).
- Mobile alert 'Could not save to Library' when saving fails (ReportsScreen.tsx:334).

**Settings**

- Web read limit 50 per page, endpoint caps at 100 (gallery GALLERY_LIMIT; route.ts:21).
- Mobile page size constant RESEARCH_REPORTS_LIMIT (apps/mobile/src/features/research/service.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/research/reports with limit, cursor and optional conversationId, rate limited and RLS scoped (apps/web/app/api/research/reports/route.ts:20-60).
- Web gallery with list, detail, pagination, error and empty states (ResearchReportsGallery.tsx).
- Research panel tabs Sources, Report, Library (ResearchPanel.tsx:395-475).
- Mobile ReportsScreen with sign-in state, loading skeleton, retry, empty state, detail with sections and citations, gated by FEATURES.research (ReportsScreen.tsx:590-650).
- Library handles video jobs with a cancel call to /api/media/video/cancel (LibraryView.tsx:42,246).

**Incomplete**

- The area status for this feature is 'built' on web, desktop and mobile while brief S4.29 says 'not applicable anywhere'; the two do not describe the same item, so the feature status mixes them [inferred].

**Present but disconnected or switched off**

- Mobile FEATURES.videoGen = false, so video generation is off in the v1 phone app (apps/mobile/lib/v1FeatureFlags.ts).

**Not available**

- A dedicated video studio screen on every app, by founder decision (docs/decisions/2026-09-27-founder-decisions.md:132).
- Report reader on CLI, VS Code and Chrome (brief S4.32 status missing).

## 4. Required behaviour

**Established requirements**

- A research report reader lists the user's reports and opens one with its sections and cited sources. (source: brief S4.32)
- Video is generated in chat and kept in the Library; no separate video studio destination. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:132)
- A media job history lists jobs with status and links to results (S4.30, related). (source: brief S4.30)

**Acceptance criteria**

1. The gallery lists only the signed-in person's reports, newest first.
2. Opening a report in the gallery makes no extra network request for its body.
3. 'Load older reports' appends the next page using the returned cursor and a failure shows an error without losing the list.
4. With zero reports the empty state 'No reports yet' shows.
5. Mobile signed out shows 'Sign in to read your reports'.
6. With FEATURES.research false the mobile drawer hides Reports and the screen shows an unavailable notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The reader should work in Electron because it shows the hosted app [inferred] from doc: AGENTS.md section 5.
- The Library tab name may confuse people who expect media; [inferred] from the code where it holds reports.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Rename the tab to 'Reports'.
- [proposed] Update the area page so S4.29 is recorded as not applicable by decision, apart from S4.32.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportsGallery | `apps/web/features/chat/components/research/ResearchReportsGallery.tsx` | Gallery list, detail, pagination. |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Panel with Sources, Report, Library tabs. |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Renders one report with sections and sources. |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Lists reports by user with keyset cursor. |
| screen | WebChatPage panel mount | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts ResearchPanel (lines 7873, 7884). |
| store | research-panel-store | `apps/web/features/chat/stores/research-panel-store.ts` | Panel open state. |
| screen | Mobile ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Reports list and detail. |
| service | Mobile research service | `apps/mobile/src/features/research/service.ts` | fetchResearchReports with cursor. |
| component | Mobile reportSections | `apps/mobile/src/features/research/reportSections.ts` | Section list for navigation. |
| component | DrawerContent | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Drawer row for Reports. |
| config | FEATURES.research and videoGen | `apps/mobile/lib/v1FeatureFlags.ts` | research true, videoGen false. |
| component | Web LibraryView | `apps/web/features/library/components/LibraryView.tsx` | Media jobs including video cancel. |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared library view. |
| endpoint | /api/media/jobs | `apps/web/app/api/media/jobs/route.ts` | Media job history. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Mobile library with jobs. |
| test | ResearchReportsGallery.test | `apps/web/features/chat/components/research/ResearchReportsGallery.test.tsx` | Gallery tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Gallery mounts and fetches the newest 50 reports for the caller. | device | ResearchReportsGallery.tsx:142 |
| Server validates query, decodes the cursor, opens a user-scoped database, and returns reports with nextCursor. | our servers | apps/web/app/api/research/reports/route.ts:20-60 |
| Opening a row renders the report from the already loaded body. | device | ResearchReportsGallery.tsx header comment |
| Mobile api.get reads the same endpoint and maps rows to MobileResearchReport. | device and our servers | apps/mobile/src/features/research/service.ts:116-135 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Research reports | Managed cloud database via the research report service (table name not opened) | yes, readable on web and mobile | unknown |

**Models and providers.** The reader does not call a model. Report rows carry query, model and provider fields written by the run (ResearchReportsGallery.tsx GalleryReport type); the run itself is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; reports are saved to the Managed Cloud account (ReportsScreen.tsx:604-612). |
| Permissions | Row-level scope by user and organization through getUserScopedDb (route.ts:45). |
| Subscription | none found in the code for reading; running Deep Research may be limited elsewhere (SYS-chat-turn-pipeline, not read). |
| Limits and metering | Rate limit group 'chat-conversation' (route.ts:26); page size 1 to 100. |
| Feature flags | Mobile FEATURES.research (v1FeatureFlags.ts; DrawerContent.tsx:565). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Reports are stored in Managed Cloud; local-only reading is not found in the code read. The Tauri desktop has its own research history (apps/desktop/src/features/research/ResearchHistory.tsx) but the public Desktop shows the hosted web app (doc: AGENTS.md section 5). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Text 'Loading reports…'; mobile skeleton rows. | ResearchReportsGallery.tsx:184; ReportsScreen.tsx:622 |
| Error | Alert; mobile 'Try again' button. | ResearchReportsGallery.tsx:188; ReportsScreen.tsx:632 |
| Empty | 'No reports yet' message. | ResearchReportsGallery.tsx:198-210 |
| Paging failure | Alert row 'Could not load older reports'; list kept. | ResearchReportsGallery.tsx:131,215 |
| Bad cursor | 400 'Invalid research report cursor'. | route.ts:41-43 |
| Paused report | isPausedResearchReport is imported by the gallery; display detail not read. | ResearchReportsGallery.tsx import |
| Feature off on mobile | FeatureUnavailable 'Deep research'. | ReportsScreen.tsx:595 |
| Offline | not handled in the code beyond load error. | ResearchReportsGallery.tsx load |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportsGallery.test.tsx`: Gallery list and detail.
- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Report view.
- `apps/web/features/chat/components/research/ResearchReportView.toc.test.tsx`: Table of contents.
- `apps/web/app/api/research/reports/__tests__/route.test.ts`: Reports route.
- `apps/mobile/src/features/research/__tests__/ReportsScreen.test.tsx`: Mobile reports list.
- `apps/mobile/src/features/research/__tests__/ReportsScreenCitations.test.tsx`: Mobile citations.
- `apps/mobile/src/features/research/__tests__/service.test.ts`: Mobile service mapping.

**Test scenarios**

- **Empty gallery**
  1. Sign in with an account with no reports
  2. Open research panel > Library
  - Expected: 'No reports yet' message.
- **Older reports**
  1. Use an account with more than 50 reports
  2. Press 'Load older reports'
  - Expected: Older rows are appended and the button disappears at the end.
- **Cross-chat access**
  1. Run Deep Research in chat A
  2. Open chat B and the Library tab
  - Expected: Chat A's report is listed.
- **Mobile signed out**
  1. Open Reports while signed out
  - Expected: 'Sign in to read your reports'.
- **No video studio**
  1. Search the web app and phone for a video studio page
  - Expected: None; video jobs appear in the Library.

**Where to look when it fails**

- Network response of GET /api/research/reports.
- 400 'Invalid research report cursor' for a bad cursor.
- Rate limit group 'chat-conversation'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **S4.29 statuses in this feature (built) contradict the brief item (not applicable anywhere).** Affects: Area status accuracy. Evidence: brief S4.29; docs/decisions/2026-09-27-founder-decisions.md:132. Work needed: Correct the status data.
- **Mobile video generation is off in v1.** Affects: Mobile. Evidence: apps/mobile/lib/v1FeatureFlags.ts videoGen false. Work needed: Owner decision.
- **Report reader absent on CLI, VS Code and Chrome.** Affects: Those apps. Evidence: brief S4.32. Work needed: Decide whether parity is required.
- **Library tab name hides that it holds reports.** Affects: Web users. Evidence: ResearchPanel.tsx:395-475. Work needed: Rename or explain.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-voice-and-media
- SYS-sync-and-continuity
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/research/reports
- api:GET /api/media/jobs

## Unknown

- Table that stores research reports.
- Retention and deletion of reports.
- Whether Deep Research is plan-limited.
- Electron-specific differences.
- Display of paused reports.
- Whether the Tauri desktop research history is reachable by any user.
