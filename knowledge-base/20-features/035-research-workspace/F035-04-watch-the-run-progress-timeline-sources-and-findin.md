---
id: "F035-04"
type: "feature"
title: "Watch the run: progress, timeline, sources and findings"
aliases: ["Research progress", "Research activity bar", "Research timeline", "Sources panel", "Planned questions", "Gaps", "x_research_status", "x_research_plan", "S35.09", "S35.10", "S35.11", "S35.12", "S35.13", "S35.14"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.09", "S35.10", "S35.11", "S35.12", "S35.13", "S35.14"]
depends_on: ["F035-01", "F035-02", "F035-03", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:research_reports", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-04 Watch the run: progress, timeline, sources and findings

While a run is going, the chat message shows its phase, round, search and source counts, elapsed time and a step list with statuses. A Research side panel (Sources, Report, Library) lists numbered sources. A finished report lists each planned question as answered or not answered. Findings are not grouped under questions, and conflicting sources are not shown.

Area: [35. Research workspace](README.md). Requirement items: [S35.09](../../10-requirements/capabilities/035-research-workspace.md#s3509), [S35.10](../../10-requirements/capabilities/035-research-workspace.md#s3510), [S35.11](../../10-requirements/capabilities/035-research-workspace.md#s3511), [S35.12](../../10-requirements/capabilities/035-research-workspace.md#s3512), [S35.13](../../10-requirements/capabilities/035-research-workspace.md#s3513), [S35.14](../../10-requirements/capabilities/035-research-workspace.md#s3514).

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

**What it does.** Streams the run's state to the screen as status, plan and gap events and keeps numbered sources the report cites [research-loop.ts:467-590].

**Why it exists.** A run takes minutes and costs money, so the person needs to see what it is doing and what it found.

**Who uses it.** People running Deep Research on web, desktop (hosted web) and mobile.

**Problems it solves**

- Not knowing whether a long run is stuck.
- Not knowing which sources a claim came from.
- Not knowing which planned question the report skipped.

**Use cases**

- Watch the timer and search count.
- Open the Sources tab to check citation [3].
- See that a planned question is marked Not answered.

## 2. User experience

**Where to find it**

- Web and Desktop: status bar above the assistant reply (role status, aria-label 'Deep research: <label>') [ResearchActivity.tsx:493-497]; side panel via the sources toggle button with tabs 'Sources', 'Report', 'Library' [ResearchPanel.tsx:403-440,532].
- Mobile: ResearchRunCard (testID research-run-card) and a 'Sources · N' appendix [ResearchRunCard.tsx:476; ResearchSourcesAppendix.tsx:24].

**Before you start**

- A research run started (F035-01).

**Screens and controls**

- Status labels: Planning research, Review the plan to start searching, Searching the web, Writing report, Research paused, Research complete, Research failed, Research stopped [ResearchActivity.tsx:56-65].
- Counts: 'round i of n', 'N of M searches' while active, 'N searches', 'N sources', credits when finished, 'up to ~N' while active, elapsed m:ss with a one-second timer [ResearchActivity.tsx:291-300,366-420].
- Step rows with statuses Queued, In progress, Done, Failed, and 'Not run' for dropped, with a note under dropped, failed or done steps; guidance steps labelled 'Your guidance' [ResearchActivity.tsx:66-75,100-128].
- Report reader sections 'Key findings' and 'Planned questions' ('Answered:' or 'Not answered:' with a reason) [ResearchReportView.tsx:529,539-558].
- Mobile: step labels Queued, In progress, Done, Failed, Not run; 'Planned questions' with 'Answered: ' and 'Not answered: ' [ResearchRunCard.tsx:144-148,572-595].

**Journey**

1. Send a research question.
2. Watch the status bar and step list update.
3. Open the side panel Sources tab to see numbered sources.
4. When done, open the report and read Key findings and Planned questions.

**What the person sees and gets**

- Numbers on citations match the numbered source list, for web, file and connected-app sources alike [research-loop.ts:855-880].
- Planned questions marked answered when at least half of the question's words reach the report [research-loop.ts:590-640].

**Settings**

- None found for the progress view; browser reply-ready notification opt-in footer appears while active [ResearchActivity.tsx:127-151].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server events x_research_status, x_research_plan, x_research_gaps [research-loop.ts:467,519,568].
- Web status bar, step list, panel tabs [ResearchActivity.tsx; ResearchPanel.tsx].
- Persisted projection so a reload restores phase, sources, steps, elapsed time, credits [assistant-turn-research.ts:56-78].
- Mobile card, steps, planned questions, sources appendix, reducer for the events [researchRunState.ts; ResearchRunCard.tsx; ResearchSourcesAppendix.tsx].
- Dropped steps carry a reason (for example 'not searched: the time budget was reached') [research-loop.ts:3398-3420].

**Incomplete**

- Findings are not grouped under each question: the report reader shows a flat 'Key findings' list and a separate answered or not answered list per question, so brief S35.13 is only partly met (ResearchReportView.tsx:529,539; ResearchRunCard.tsx:572). The brief's cited lines 714 and 762 are not that code.
- The 'Gaps' block in ResearchPlan is rendered only for the editable plan, when no gaps exist yet, so it is effectively not reachable [ResearchPlan.tsx:307; ResearchActivity.tsx:799] [inferred].
- Answered is a word-overlap guess (50 percent of the question's words), not a judgement of evidence [research-loop.ts:590,597-640].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Contradictory evidence display: searched the research components and loop for 'contradict', 'conflicting' and 'disagree'; only an unrelated comment found.
- CLI, VS Code, Chrome: no progress view.

## 4. Required behaviour

**Established requirements**

- A progress view shows phase, counts and elapsed time. (source: brief S35.09)
- A timeline of searches and steps with status. (source: brief S35.10)
- The user can see the list of sources visited. (source: brief S35.11)
- The run gathers evidence into a collection the report is built from and the user can inspect. (source: brief S35.12)
- The report or run view groups findings under each question. (source: brief S35.13)
- Where sources disagree the view shows conflicting evidence side by side or flags it (missing on all apps). (source: brief S35.14)
- Every claim has supporting evidence or explicit uncertainty; citations resolve to material; reopen the report with sources intact. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. During a run the bar shows a phase label and a timer that increases each second.
2. After round 1 the search and source counts are above zero.
3. Each plan step shows one of Queued, In progress, Done, Failed or Not run.
4. A dropped step shows its reason.
5. Citation numbers in the report equal the numbered sources in the panel.
6. After a reload the finished run still shows phase, sources, steps and credits.
7. The report lists each planned question as answered or not answered.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Findings per question need a per-question mapping the code does not produce.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Group findings under each plan question.
- [proposed] Flag sources whose claims differ.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchActivity | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Status bar, counts, step list |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Side panel with Sources, Report, Library tabs |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Reader with Key findings and Planned questions |
| store | research-panel-store | `apps/web/features/chat/stores/research-panel-store.ts` | Panel open state |
| hook | useChatStream research reducers | `apps/web/lib/hooks/useChatStream.ts` | Parses status, plan, gaps events into message state |
| service | research event builders | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Status, plan, gaps events and gap derivation |
| service | SourceAggregator | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Numbered, de-duplicated sources |
| service | buildPersistedTurnResearch | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.ts` | Rebuilds the progress state from the stored report |
| service | research-report-service | `apps/web/lib/services/research-report-service.ts` | Reads and writes report rows |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Fetch a report or the library list |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Stores steps, citations, key findings, status |
| schema | ResearchStep and ResearchGap | `packages/contracts/types/src/research.ts` | Wire and storage types |
| component | ResearchRunCard | `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx` | Mobile progress and steps |
| other | researchRunState | `apps/mobile/src/features/chat/utils/researchRunState.ts` | Mobile reducer, labels and resume payload |
| component | ResearchSourcesAppendix | `apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx` | Mobile sources list |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile report reader |
| test | ResearchActivity tests | `apps/web/features/chat/components/research/ResearchActivity.test.tsx` | Counts and step rendering |
| test | researchRunState tests | `apps/mobile/src/features/chat/utils/__tests__/researchRunState.test.ts` | Mobile reducer |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Loop emits status, plan and gaps events as it works. | our servers | research-loop.ts:467-590,3361 |
| The client merges events into message research state and ticks a local timer. | device | useChatStream.ts:3343-3430; ResearchActivity.tsx:291-300 |
| The report row stores steps, citations, key findings and gaps once at the end. | our servers | research-loop.ts:1984-2015 |
| Panel Report tab and gallery fetch rows through the reports endpoint. | device and our servers | ResearchPanel.tsx:214-260; research/reports/route.ts:48-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Steps, citations, key findings, gaps, source count, duration | table research_reports | server side; clients fetch | cascades with the conversation; library hides temporary and deleted chats [research-report-service.ts:320-384] |
| Live run state | client message metadata | saved with the message, may fail by size; rebuilt from the report [assistant-turn-research.ts:1-20] | chat retention |

**Models and providers.** Events are provider-neutral; sources come from native search or the generic backend (provider:perplexity charges).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Reports are visible only to their owner (row-level security) [0094_research_reports.sql owner policies]. |
| Subscription | Same as F035-01. |
| Limits and metering | Plan state capped at 50 steps in persisted projection; 50 gaps; 100 retry sources [assistant-turn-research.ts:36; researchRunState.ts:60-62]. |
| Feature flags | None found. |
| Model compatibility | None. |
| Provider restrictions | None. |
| Local mode | Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Planning | Label Planning research; pulse icon. | ResearchActivity.tsx:56,512 |
| Failed | Red bar, Retry button. | ResearchActivity.tsx:480,556 |
| Stopped by you | Adds '(stopped by you)'. | ResearchActivity.tsx:504 |
| No steps | No step list. | ResearchActivity.test.tsx |
| Late join or dropped event | Plan and gaps events carry the whole list each time. | research-loop.ts:519-545 |
| Malformed plan event | Ignored; good plan kept. | useChatStream.research.test.tsx |
| Offline | Not handled in the research card; stream replay by cursor. | useChatStream.ts:3770 |
| Accessibility | Bar is role status with a label; plan list is aria-live polite; mobile card has accessibility label. | ResearchActivity.tsx:493,780; ResearchRunCard.tsx:477 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchActivity.test.tsx`: Search cap display, step statuses, Retry/Resume buttons
- `apps/web/features/chat/components/research/ResearchPanel.sourcesNumbering.test.tsx`: Source numbering
- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Report reader
- `apps/web/lib/hooks/useChatStream.research.test.tsx`: Phases, sources, plan events
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.test.ts`: Loop events, gaps, plan (large file; not read in full)
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.test.ts`: Persisted projection
- `apps/mobile/src/features/chat/utils/__tests__/researchRunState.test.ts`: Mobile reducer
- `apps/mobile/src/features/chat/components/research/__tests__/ResearchRunCard.test.tsx`: Live counts, finished run

**Test scenarios**

- **Live counts**
  1. Start and approve a run
  2. Watch the bar for 30 seconds
  - Expected: Timer rises; searches and sources counts grow; 'N of M searches' while active
- **Citation numbers**
  1. Finish a run
  2. Open Sources tab
  3. Compare [2] in text to the list
  - Expected: Same source
- **Dropped step**
  1. Use a tiny search budget
  2. Finish
  - Expected: Dropped steps show 'Not run' with a reason
- **Reload**
  1. Finish a run
  2. Reload the page
  - Expected: Phase, steps, sources and credits still shown
- **Planned questions**
  1. Open the finished report
  - Expected: Each question shown Answered or Not answered

**Where to look when it fails**

- Table research_reports (steps, citations, gaps).
- Header X-AGI-Research-Loop.
- Log '[research-loop] provider emitted no usage'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Findings not grouped under questions** Affects: Web, desktop, mobile. Evidence: ResearchReportView.tsx:529,539; ResearchRunCard.tsx:572. Work needed: Map findings and citations to plan steps
- **Contradictory evidence not shown** Affects: All apps. Evidence: no code found. Work needed: Detect and display conflicts
- **Gaps block unreachable in the chat plan card** Affects: Web. Evidence: ResearchActivity.tsx:799 only renders editable plan. Work needed: Show gaps on the finished run or remove the block
- **Answered test is word overlap** Affects: All. Evidence: research-loop.ts:590-640. Work needed: Better coverage check
- **No progress view on CLI, VS Code, Chrome** Affects: Those apps. Evidence: no code. Work needed: Decide scope
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F035-01
- F035-02
- F035-03
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:research_reports
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether the desktop Electron window hides any panel the web shows (not checked).
- What the mobile Reports screen shows for per-step data.
- Exact content of the large research-loop test beyond its title.
