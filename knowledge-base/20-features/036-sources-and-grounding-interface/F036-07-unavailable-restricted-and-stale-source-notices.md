---
id: "F036-07"
type: "feature"
title: "Unavailable, restricted and stale source notices"
aliases: ["Unavailable-source notice (S36.19)", "Restricted-source notice (S36.20)", "Stale-source notice (S36.21)", "Uncaptured sources notice", "research-report-uncaptured-sources", "disabled citation chip"]
area: "36 Sources and grounding interface"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.19", "S36.20", "S36.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/research/reports", "table:research_reports", "file:apps/web/features/chat/components/research/ResearchReportView.tsx", "file:apps/mobile/src/features/chat/components/CitationChip.tsx", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-07 Unavailable, restricted and stale source notices

Tells the reader when a cited source cannot be opened. Web and Desktop show a notice when a research report cites numbered sources the run never saved links for. Mobile disables a chip or card that has no openable link. No app marks a source as restricted or as stale. CLI, VS Code and Chrome have nothing.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.19](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3619), [S36.20](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3620), [S36.21](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3621).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stops the product from showing a dead link for a source it cannot open. On Web and Desktop, a research report whose text cites [1], [2] and so on but whose saved source list is empty shows a Sources heading and a sentence saying the links were not recorded (apps/web/features/chat/components/research/ResearchReportView.tsx:618-640). On Mobile, a citation chip or search-result card whose URL is missing or not http/https is rendered disabled and announced as text, not a link (apps/mobile/src/features/chat/components/CitationChip.tsx:71,86,94; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:36,41,42). Restricted-source and stale-source notices do not exist in the code (brief S36.20, S36.21: missing on all apps).

**Why it exists.** A reader cannot tell whether a report has no sources or the product lost them. The code comment says hiding the section left numbered references pointing at nothing (apps/web/features/chat/components/research/ResearchReportView.tsx:619-624). The brief also requires restricted and stale notices (doc: knowledge-base/data/area-briefs/036-sources-and-grounding-interface.md S36.20, S36.21).

**Who uses it.** Anyone reading a Deep Research report or an answer with citations on Web, Desktop (which shows the hosted web app) or Mobile.

**Problems it solves**

- A numbered reference in a report that points at nothing, with no explanation.
- A tappable chip on Mobile that does nothing when the source has no usable link.
- Not knowing whether a source is out of date or off limits: NOT solved today.

**Use cases**

- A user opens an older report on Web whose source list was never saved and sees the notice instead of an empty space.
- A user on Mobile sees a search-result card for a source with a bad URL and cannot tap it.
- A tester wants a stale or restricted notice: none exists, so this is a gap.

## 2. User experience

**Where to find it**

- Web: open a research report (ResearchReportView, used from the research panel and the reports gallery); the notice sits in the Sources section under the report body (apps/web/features/chat/components/research/ResearchReportView.tsx:618-640; callers apps/web/features/chat/components/research/ResearchPanel.tsx and ResearchReportsGallery.tsx).
- Desktop (Electron): the public desktop shows the hosted web app, so the web report view applies (doc: AGENTS.md section 5; apps/desktop/electron/dictationBar.ts:93 loads CLOUD_APP_ORIGIN pages). [inferred] The retained Tauri build has its own ResearchReport.tsx (apps/desktop/src/features/research/ResearchReport.tsx) which has no uncaptured-source notice (no match found in the file).
- Mobile: Research reports screen (ReportsScreen.tsx) Sources appendix, shown as 'Sources · N' with chips (3 or fewer) or cards (more than 3) (apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:12-40).
- CLI, VS Code, Chrome: not available (brief S36.19 missing).

**Before you start**

- A completed research report or a cited answer.
- Mobile report list needs Cloud mode and a signed-in account (apps/mobile/src/features/research/ReportsScreen.tsx:532).
- Web report API needs a signed-in user (apps/web/app/api/research/reports/route.ts uses getUserScopedDb).

**Screens and controls**

- Web: heading 'Sources' and a paragraph with test id research-report-uncaptured-sources.
- Web: each captured source is a link row (CitationRow) that opens in a new tab.
- Mobile: chip text '[n] title' and card with title, host and date; disabled when no openable URL; accessibility role 'text' instead of 'link'.

**Journey**

1. Open a research report.
2. Read the report body with its [n] markers.
3. Scroll to Sources.
4. If the saved source list is empty but the text cites numbers, read the notice that says the run recorded no links and the references cannot be opened from here.
5. On Mobile, tap a chip: with an openable URL a dialog shows the source and an 'Open page' button; without one nothing happens because the chip is disabled.

**What the person sees and gets**

- Web notice text: 'This report refers to {count} numbered source(s), but the run recorded no links for them. The references in the text above are the report's own and cannot be opened from here.' (apps/web/features/chat/components/research/ResearchReportView.tsx:636-642).
- Mobile: disabled chip or card with no message. Failure to open an openable link shows an alert 'Could not open citation' or 'Could not open source' with 'Check your connection and try again.' (apps/mobile/src/features/chat/components/CitationChip.tsx:48; apps/mobile/src/features/chat/utils/sourceDisplay.ts:30-33).
- Web also records an analytics event citation_rendered with outcome succeeded or failed when markers do or do not resolve (apps/web/features/chat/components/research/ResearchReportView.tsx:222-225).

**Settings**

- None found in the code for this feature.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: uncaptured-sources notice appears only when the citation list is empty and the prose has at least one [n] marker (apps/web/features/chat/components/research/ResearchReportView.tsx:216-219,618).
- Web: a marker naming a source that does not exist is not linked (apps/web/features/chat/lib/citation-links.ts linkifyCitations, n > citationCount returns the text unchanged).
- Web: citationRenderOutcome counts unresolved markers as 'failed' (apps/web/features/chat/lib/citation-links.ts).
- Mobile: chip and card are disabled and have role 'text' when canOpenSource is false (apps/mobile/src/features/chat/components/CitationChip.tsx:86,94; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:41,42).
- Mobile: canOpenSource accepts only http and https URLs (apps/mobile/src/features/chat/utils/externalUrls.ts:3,9-16; apps/mobile/src/features/chat/utils/sourceDisplay.ts:20-22).

**Incomplete**

- Web: CitationRow always renders an anchor with href set to the raw citation URL, even when the string is not a parseable URL; only the favicon is skipped (apps/web/features/chat/components/research/ResearchReportView.tsx:70-95). The brief's 'source with no URL is shown as text' is therefore not met for an unparseable string.
- Web: the notice covers only the all-or-nothing case (zero citations). A report with some captured and some missing sources shows no notice [inferred from the conditional at ResearchReportView.tsx:618].
- Mobile: the disabled state has no visible explanation text; the mapper drops any citation with an empty URL before the screen sees it (apps/mobile/src/features/research/service.ts:47), so Mobile never shows the uncaptured-sources notice and has no equivalent.

**Present but disconnected or switched off**

- Tauri desktop ResearchReport.tsx is retained internal code and shows only a count line, no source notice (apps/desktop/src/features/research/ResearchReport.tsx:177-182; doc: AGENTS.md section 5).

**Not available**

- Restricted-source notice on every app (brief S36.20 missing; no match for 'restricted' in ResearchReportView.tsx).
- Stale-source notice on every app (brief S36.21 missing; no freshness logic found in apps/web/features/chat/utils/research-sources.ts, citation-links.ts or the unified-chat markdown components). The closest thing is a 'Run again' button labelled 'Run this research again for current sources' (ResearchReportView.tsx:360-363), which is not a notice.
- All three notices on CLI, VS Code and Chrome (brief: missing).

## 4. Required behaviour

**Established requirements**

- A cited source that cannot be opened or was not captured is reported as such, not shown as a dead link. (source: S36.19 (brief))
- A restricted source (no access or permission) says so on the citation. (source: S36.20 (brief))
- An old or possibly changed source shows a stale-source notice. (source: S36.21 (brief))
- Omitted or unreadable sources are reported, never treated as empty. (source: doc: docs/product/experience-contract.md:778 (W05))
- Citations resolve to the material supporting the claim. (source: doc: docs/product/experience-contract.md:781 (W08))

**Acceptance criteria**

1. On Web, a report with prose markers [1] and [2] and an empty citation list shows the Sources heading and the uncaptured notice naming '2 numbered sources'.
2. On Web, a report with captured citations shows no uncaptured notice.
3. On Web, a marker [9] with only 2 citations is not turned into a link.
4. On Mobile, a chip with url missing or 'ftp://x' is disabled and has accessibility role text.
5. On Mobile, a chip with an https URL is enabled and opens a dialog with an 'Open page' button.
6. A restricted source shows a restricted label (currently fails: not built).
7. A source older than the defined threshold shows a stale notice (currently fails: not built).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that shows a citation should treat a non-URL string as text, not as an anchor. [inferred from S36.19 and the web test 'A source with no parseable url'].
- The notice should work on a per-source basis, not only when all sources are missing. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-citation status field (ok, unavailable, restricted, stale) to the shared Citation type and render it in the shared chip and in CitationRow.
- [proposed] Show the same uncaptured notice on Mobile by keeping URL-less citations in the mapper instead of dropping them.
- [proposed] Define the stale threshold in configuration, not as a constant.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Web report view; computes uncapturedSources and renders the notice and the CitationRow list |
| component | CitationRow | `apps/web/features/chat/components/research/ResearchReportView.tsx` | One source row; always an anchor to citation.url, with favicon fallback to a globe |
| service | linkifyCitations / citedSourceNumbers / citationRenderOutcome | `apps/web/features/chat/lib/citation-links.ts` | Links only markers that name an existing source; finds cited numbers; classifies render outcome |
| event | citation_rendered | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Product analytics event with outcome succeeded or failed |
| component | CitationChip (mobile) | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Mobile chip; disabled and role text when canOpenSource is false; preview dialog and Open page action |
| component | WebSearchResultCard | `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx` | Mobile source card; disabled when URL not openable |
| component | ResearchSourcesAppendix | `apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx` | Chooses chips (3 or fewer) or cards (more) for the source list |
| service | canOpenSource / openSource | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | Openability check and in-app browser open with failure alert |
| service | isValidExternalHttpUrl | `apps/mobile/src/features/chat/utils/externalUrls.ts` | Allows only http and https |
| service | citations mapper | `apps/mobile/src/features/research/service.ts` | Maps API report rows; drops citations with empty URL (line 47) |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile report detail; builds sources and renders the appendix |
| component | CitationChip (shared) | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Shared chip used by Web and Desktop chat answers; renders an anchor to citation.url, no unavailable state |
| schema | Citation | `packages/contracts/types/src/research.ts` | Contract: id, title, url (required string), accessedAt, optional snippet, publishedDate; no status field |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Returns saved reports with their citations |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Stores citations as a JSON array per report |
| component | ResearchReport (Tauri) | `apps/desktop/src/features/research/ResearchReport.tsx` | Retained Tauri report; no source list or notices |
| test | ResearchReportView.test.tsx | `apps/web/features/chat/components/research/ResearchReportView.test.tsx` | Tests the uncaptured notice and unparseable-URL row |
| test | citation-links.test.ts | `apps/web/features/chat/lib/citation-links.test.ts` | Tests marker linking and outcome |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens a saved report on Web or Desktop; the page fetches reports for the signed-in user. | device and our servers | apps/web/app/api/research/reports/route.ts:19-60 (GET, user-scoped DB) |
| Server reads the report row including its citations JSON array and returns it. | our servers | apps/web/db/neon/0094_research_reports.sql:28-45; apps/web/lib/services/research-report-service.ts:300-320 |
| ResearchReportView counts citations and cited [n] numbers in the text; if citations are empty and numbers exist it renders the notice. | device | apps/web/features/chat/components/research/ResearchReportView.tsx:216-219,618-642 |
| Source rows load favicons from a third-party favicon service by domain. | outside service | apps/web/features/chat/components/research/ResearchReportView.tsx:79-82 (google.com/s2/favicons) |
| On Mobile, the same API is called, the mapper drops URL-less citations, and the appendix renders chips or cards, disabled when the URL is not http/https. | device and our servers | apps/mobile/src/features/research/service.ts:41-62,121-130; apps/mobile/src/features/chat/utils/externalUrls.ts:9-16 |
| Tapping an openable Mobile chip shows a dialog, then opens the page in the in-app browser. | device | apps/mobile/src/features/chat/components/CitationChip.tsx:43-53 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report citations (id, title, url, accessedAt, snippet, publishedDate) | table research_reports, column citations (jsonb array) | Fetched on demand from the server; Mobile keeps them in screen state only | Kept with the report; rows cascade-delete with the conversation (apps/web/db/neon/0094_research_reports.sql:32). Retention beyond that: unknown. |
| citation_rendered analytics event | product analytics (trackProductEvent) | Sent to the analytics service | unknown |

**Models and providers.** No model is called to show these notices. The report content and citations were produced earlier by the research run, which uses the Cloud research pipeline (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts). Which model or provider produced a report is stored in the model and provider columns (0094_research_reports.sql:49-50).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reports are read through a signed-in, user-scoped database session (apps/web/app/api/research/reports/route.ts:46). Mobile loads reports only when the app is in Cloud mode and signed in (apps/mobile/src/features/research/ReportsScreen.tsx:532). |
| Permissions | Rate limited with the 'chat-conversation' limiter (route.ts:22). Per-user ownership by user_id (0094_research_reports.sql:30). No source-level permission model found. |
| Subscription | none found in the code for viewing a stored report or its notices. Entitlement for running new research is outside this feature (see SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | none found in the code for the notices. Report list page limit is 1 to 100 (route.ts:17). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent: notices are drawn from stored data. |
| Provider restrictions | none found in the code. Favicons come from a third-party service (ResearchReportView.tsx:82). |
| Local mode | Reports come from the Cloud server, so the report list is not shown in Local mode on Mobile (ReportsScreen.tsx:532,load returns when not signedInCloud). Behaviour of a locally produced answer with citations: the shared chip and mobile chip logic is not Cloud specific, but a Local citation flow was not examined: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty citations, prose has markers (Web) | Notice shown, singular or plural | ResearchReportView.tsx:618-642; ResearchReportView.test.tsx:151-160 |
| Empty citations and no markers | No Sources section at all | ResearchReportView.tsx:618,643; ResearchReportView.test.tsx test 'renders nothing for sections the report genuinely lacks' |
| Unparseable URL string (Web) | Row shown with the raw string and a globe icon, but still an anchor with that href | ResearchReportView.tsx:73-95; ResearchReportView.test.tsx:80-84 |
| Marker number above citation count | Left as plain text and counted as failed | apps/web/features/chat/lib/citation-links.ts |
| Mobile chip without openable URL | Disabled, accessibility role text, no explanation | CitationChip.tsx:86,94 |
| Mobile open fails | Alert 'Could not open citation' with retry advice | CitationChip.tsx:48; sourceDisplay.ts:30-33 |
| Mobile report list loading, error | Error text 'Could not load reports. Check your connection and try again.' | ReportsScreen.tsx:547-549 |
| Restricted or stale source | not handled in the code | No match in the files listed under implementation_map |
| Offline | not handled in the code for the notices beyond the load error above | ReportsScreen.tsx:547 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Uncaptured-sources notice, unparseable URL row, marker linking, interrupted report
- `apps/web/features/chat/lib/citation-links.test.ts`: Marker linking, cited numbers, render outcome
- `apps/mobile/__tests__/AssistantLinkOpening.test.tsx`: Mentions canOpenSource or canPreviewCitation; exact cases not read: unknown
- `apps/mobile/src/features/research/__tests__/ReportsScreenCitations.test.tsx`: Citations on the mobile report screen (appendix mocked); exact assertions not read

**Test scenarios**

- **Uncaptured notice on Web**
  1. Open a saved report whose citations array is empty but whose text contains [1] and [2].
  2. Scroll to Sources.
  - Expected: Heading Sources and the notice 'refers to 2 numbered sources' appear; no links.
- **Unparseable URL row**
  1. Open a report with one citation whose url is 'not a url'.
  2. Inspect the row.
  - Expected: Row shows the raw text; check whether it is a link (current code makes it one, required behaviour says text).
- **Mobile disabled chip**
  1. Open a report with a citation whose URL is 'ftp://example.com'.
  2. Tap the chip.
  - Expected: Chip is disabled and nothing opens.
- **Restricted source**
  1. Cite a source the user lacks permission for.
  2. Look at the citation.
  - Expected: Should show a restricted label; today nothing is shown (gap).
- **Stale source**
  1. Open a report whose sources were retrieved long ago.
  2. Look at the source list.
  - Expected: Should show a stale notice; today only retrieval dates are shown (gap).

**Where to look when it fails**

- Analytics event citation_rendered with outcome failed.
- API GET /api/research/reports response: citations array empty.
- Mobile alert titles 'Could not open citation' and 'Could not open source'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/036-sources-and-grounding-interface.md](../../70-qa/test-plans/web/036-sources-and-grounding-interface.md)
- Desktop: [70-qa/test-plans/desktop/036-sources-and-grounding-interface.md](../../70-qa/test-plans/desktop/036-sources-and-grounding-interface.md)
- Mobile: [70-qa/test-plans/mobile/036-sources-and-grounding-interface.md](../../70-qa/test-plans/mobile/036-sources-and-grounding-interface.md)

## 10. Gaps and dependencies

- **No restricted-source notice** Affects: All six apps. Evidence: Brief S36.20 missing; no code found. Work needed: Define a restricted state in the Citation contract, set it where access is checked, render it in the shared chip, CitationRow and mobile chip.
- **No stale-source notice** Affects: All six apps. Evidence: Brief S36.21 missing; only accessedAt is displayed (ResearchReportView.tsx:60-68). Work needed: Decide the freshness rule in configuration and show a notice when retrieval is older than it.
- **Unparseable URL still rendered as a link on Web** Affects: Web, Desktop. Evidence: ResearchReportView.tsx:88-95. Work needed: Render a non-link element when the URL does not parse.
- **Mobile has no uncaptured-sources notice and drops URL-less citations silently** Affects: Mobile. Evidence: apps/mobile/src/features/research/service.ts:47. Work needed: Keep the information and show a notice like Web.
- **Mobile disabled chip gives no reason** Affects: Mobile. Evidence: CitationChip.tsx:86-94. Work needed: Add a short visible or spoken reason.
- **CLI, VS Code and Chrome have no notice** Affects: CLI, VS Code, Chrome. Evidence: Brief S36.19 missing. Work needed: Not examined for design: unknown
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/research/reports
- table:research_reports
- file:apps/web/features/chat/components/research/ResearchReportView.tsx
- file:apps/mobile/src/features/chat/components/CitationChip.tsx
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-shared-ui-and-design

## Unknown

- Exact assertions in AssistantLinkOpening.test.tsx and ReportsScreenCitations.test.tsx.
- Why stored reports have empty citations (the test comment says every stored report on the QA account was in this state); the producing code path was not traced.
- Whether the shared chat citation chip handles a missing URL in practice.
- Whether any test has ever been run: no result file recorded.
- How a Local-mode citation behaves.
