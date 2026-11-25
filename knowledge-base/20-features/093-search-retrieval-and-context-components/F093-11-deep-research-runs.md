---
id: "F093-11"
type: "feature"
title: "Deep Research runs"
aliases: ["Deep Research", "Deep Research runs", "research loop", "Research orchestrator (S93.29)", "Research report generator (S93.30)", "Research evidence store (S93.28)", "Research plan", "research report"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.28", "S93.29", "S93.30"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "mode:cloud", "table:research_reports", "F093-07", "F093-08", "F093-09", "F093-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-11 Deep Research runs

Deep Research is a long, paid-tier research run on Cloud. It drafts a plan the user reviews, runs bounded search and read rounds, stops on budgets, completed plan or a round with no new sources, then writes a cited report. The run is saved and can be paused, resumed, cancelled or retried.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.28](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9328), [S93.29](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9329), [S93.30](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9330).

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

**What it does.** Server-side loop: plan, user approval, gathering rounds with web search, page reads, optional files and connectors, then a synthesis turn that always runs on what was gathered; the report and its sources are saved [apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1-52, 3088-3110, 3363-3395].

**Why it exists.** One reply cannot cover a question that needs many sources. A durable report survives a closed tab or a failed run [apps/web/db/neon/0094_research_reports.sql:1-18].

**Who uses it.** Paid-plan users on web, mobile and the internal desktop build [doc: docs/product/surface-feature-matrix.md:63]. Not on CLI, VS Code or Chrome [same doc, lines 277-279].

**Problems it solves**

- Shallow answers to broad questions
- Lost work when a run fails
- Unreviewed spend (the plan is approved first)
- Reports with no sources

**Use cases**

- Compare options in a market with a cited report
- Re-run a past report for current sources
- Limit a run to named sites or the user's own files
- Resume an interrupted run

## 2. User experience

**Where to find it**

- Web composer + menu row 'Deep Research' [apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:187, 1305-1311, 1720-1732].
- Plan card headed 'Research plan' with 'Add a step', 'Remove this step', 'Start research', 'Cancel', section 'Before I search', a 'Deliverable' group and a checkbox 'Stop once a round of searching stops finding anything new' [apps/web/features/chat/components/research/ResearchPlan.tsx:23-32, 219, 288].
- Progress and controls: 'Pause', 'Resume', 'Retry', 'Send as new message' [apps/web/features/chat/components/research/ResearchActivity.tsx:531-675].
- Report view with actions such as 'Run this research again for current sources', 'Turn this report into an artifact', 'Save this report to your library', 'Save this report to a project', 'Ask a follow-up about this report' [apps/web/features/chat/components/research/ResearchReportView.tsx:360-672].
- Mobile: Reports screen listing saved reports; research state in chat [apps/mobile/src/features/research/ReportsScreen.tsx; apps/mobile/src/features/chat/utils/researchRunState.ts].
- Internal Tauri desktop: DeepResearchPage with its own local orchestrator via research_start and research_cancel [apps/desktop/src/features/research/DeepResearchPage.tsx; apps/desktop/src/stores/researchStore.ts:159, 203].

**Before you start**

- Paid plan: pro, max, max_15x, team, team_premium or enterprise [packages/contracts/types/src/billing-catalog.ts:341, 355].
- A model that supports research (catalog capability and context window) [apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2477-2483].
- A streaming request; Free trial requests are excluded [route.ts:567].

**Screens and controls**

- Composer row; plan card with editable steps, deliverable depth and format, source choices (files, connectors, allowed and denied sites), cost estimate [ResearchPlan.tsx; ResearchCostEstimate.tsx; research-run-options.ts:112-119].
- Activity header with pause, resume, retry, steering guidance box [ResearchActivity.tsx:591, 664].

**Journey**

1. 1. Turn on Deep Research and send a question.
2. 2. The server writes a plan and pauses at 'Review the plan to start searching' [research-loop.ts:3098-3110].
3. 3. The user edits and presses 'Start research' (or 'Cancel').
4. 4. Rounds of search and page reads run with progress.
5. 5. A cited report is written and saved; a notification is sent [research-run-options.ts:74-97].
6. 6. The user can pause, resume, retry, or save the report.

**What the person sees and gets**

- Status events: planning, awaiting_approval, searching, synthesizing, complete, error [research-loop.ts:446-520; mobile researchRunState.ts:19-28].
- Status line 'Research complete' or 'Research complete, but the report could not be saved' [research-loop.ts:3583-3586].
- Gaps list: planned questions the report does not answer [ResearchPlan.tsx:35 copy; research-loop.ts:590-631].

**Settings**

- Environment values: AGI_RESEARCH_MAX_ITERATIONS, AGI_RESEARCH_MAX_SEARCHES, AGI_RESEARCH_BUDGET_MS, AGI_RESEARCH_MAX_PARALLEL_TOOL_CALLS, AGI_RESEARCH_MAX_QUERY_REWRITES; AGI_NATIVE_SEARCH_MAX_USES [research-loop.ts:1771-1790, 171-227; request-processor.ts:2558-2561].
- Deliverable defaults: full-report, prose, 0 minimum sources, stop when no new sources [packages/contracts/types/src/research.ts:286-292].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capability check refuses Deep Research for non-paid tiers on the server and the composer disables it with an upgrade state [request-processor.ts:5221; billing-catalog.ts:355; ChatComposerNew.tsx:1620-1627].
- Defaults: 6 iterations, 12 searches, 4-minute budget, 3 parallel tool calls, 4 query rewrites; each is read from an environment value within a range (iterations 2 to 8, searches 3 to 15, budget 30 s to 10 min, parallel 1 to 8, rewrites 0 to 12) [research-loop.ts:178-184, 227, 1771-1795].
- A planning turn runs when there are at least 3 iterations; the last iteration is always synthesis [research-loop.ts:1796-1810].
- Stop rules, as coded: (a) the model says READY_TO_REPORT AND every planned query is searched or dropped AND the minimum source count is met; (b) search budget reached; (c) time budget reached; (d) diminishing returns, meaning the latest round added zero new sources, only when the deliverable asks for it and no planned query is pending [research-loop.ts:3363-3395]. The 0.5 coverage threshold is not a stop rule; it labels gaps after the report [research-loop.ts:590-631]. The first draft was wrong on this.
- Each search in a round goes through search admission: automated callers are charged; a refused or failed hold skips the search [research-loop.ts:1811-1845].
- Cancellation is checked at boundaries from the client abort or a durable cancel flag; a cancelled run is stored as interrupted with what it gathered so a retry can resume [research-loop.ts:2034-2050; research-run-options.ts:11-14].
- Pause, steer and resume exist (pause request, steer messages, resume with approved steps and prior sources) [research-loop.ts:2078-2100; research-run-options.ts:98-112; ResearchActivity.tsx:531-675].
- Report save is an upsert on (user, request), retried 3 times; completed status sets completed_at; failed or interrupted rows keep an honest error [research-loop.ts:188-189, 1984-2024; research-report-service.ts:212-296; 0094_research_reports.sql:52].
- Approved runs start as a durable workflow when durable turns are enabled and the transport is healthy; otherwise the request-scoped loop runs [route.ts:634-700].
- Sources can include the user's own files and connected apps; allowed and denied sites are enforced at ingestion and in the reader [route.ts:604-626; research-sources.ts:56-66; research-loop.ts:855-880].
- Reports list API: GET /api/research/reports with request, conversation, limit and cursor filters [apps/web/app/api/research/reports/route.ts:15-24].

**Incomplete**

- The 0094 header says runs are request-bound with no background survival; the route now has a durable path, so that header is out of date (documentation drift) [0094_research_reports.sql:20-24; route.ts:634-660].
- The 0191 migration that adds settled cost is headed 'NOT YET APPLIED : draft only'; whether production has it is unknown [apps/web/db/neon/0191_research_report_settled_cost.sql:1-5].
- The saved row has no columns for gaps, deliverable or source selection; those are attached to the returned object in memory only [research-report-service.ts:237-243; research-run-options.ts:75-86].
- Citations have no locator [research-loop.ts:1002-1010].

**Present but disconnected or switched off**

- Cloud-only: Local and own-key never reach this loop [request-processor.ts:4876 comment].
- Deep Research on CLI, VS Code and Chrome: absent per the surface matrix [docs/product/surface-feature-matrix.md:277-279].

**Not available**

- Internal Tauri desktop runs a separate local orchestrator (analyse query, iterations, dedupe) not tied to the Cloud meter or the plan gate [apps/desktop/src-tauri/src/core/research/orchestrator.rs:135-200, 351, 488, 565]. The public Desktop shows the web app instead [doc: AGENTS.md section 5].
- Mobile starts runs through chat with a research flag and resume payload; the Reports screen is the list view [apps/mobile/stores/chat/chatExecutionStore.ts:354-362, 3264; apps/mobile/src/features/research/service.ts:134].

## 4. Required behaviour

**Established requirements**

- Research runs store their evidence (sources, citations, status, cost) durably. (source: brief S93.28)
- A research orchestrator runs plan, search rounds, stop rules, synthesis, cancellation and resume. (source: brief S93.29)
- A report generator synthesizes the final report in the requested deliverable format with citations. (source: brief S93.30)
- Review the plan before approved work begins; cancellation stops new side effects; resume an interrupted report without rerunning completed actions unnecessarily; allowed source controls are enforced, not just prompted; reports reopen with sources intact. (source: doc: docs/product/experience-contract.md:781)
- Deep Research is generally available on web, desktop and mobile, absent on CLI, VS Code and Chrome. (source: doc: docs/product/surface-feature-matrix.md:63)

**Acceptance criteria**

1. A Free account cannot start Deep Research; the composer shows an upgrade state and the server refuses.
2. A paid account sees a plan first and no search runs until 'Start research'.
3. A run stops at 12 searches or 4 minutes by default and still writes a report.
4. A round that finds no new source ends gathering when the box is ticked and no planned query is pending.
5. Cancelling mid-run stores status interrupted with the gathered sources and a retry can resume.
6. A completed run has a saved row with status completed, citations and sources_consulted.
7. With sites restricted, no source outside them appears in the report.
8. If the save fails three times, the status line says the report could not be saved.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Resume should keep prior sources and completed steps [inferred from research-run-options.ts:98-112].
- Free-plan refusal happens at two layers (capability and route) [route.ts:567; request-processor.ts:5221].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store gaps, deliverable and source selection in the report row so a reopened report shows them.
- [proposed] Update the 0094 header and confirm 0191 status in the migration log.
- [proposed] Offer Deep Research on mobile and web with the same plan card and document the desktop internal orchestrator as retired or aligned.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | The orchestrator: plan, rounds, stop rules, cancel, synthesis, persist |
| service | research-run-options | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Wires persistence, resume, domain policy, connectors, notifications |
| service | research-sources | `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Domain policy, file and connector sources |
| service | assistant-turn-research | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.ts` | Attaches the report activity to the assistant message |
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Dispatches research, starts cloud agent run, durable workflow |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Capability check and researchModeAllowed |
| service | research-report-service | `apps/web/lib/services/research-report-service.ts` | saveResearchReport, list, get by request |
| service | research-report-settlement | `apps/web/lib/services/research-report-settlement.ts` | Settled cost on the report row |
| endpoint | /api/research/reports | `apps/web/app/api/research/reports/route.ts` | List and fetch reports |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Report rows with RLS owner isolation |
| table | settled cost column | `apps/web/db/neon/0191_research_report_settled_cost.sql` | Adds settled_cost_microusd |
| schema | research contract | `packages/contracts/types/src/research.ts` | Deliverable spec, steps, gaps, citations, report |
| component | ResearchPlan | `apps/web/features/chat/components/research/ResearchPlan.tsx` | Plan card |
| component | ResearchActivity | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Progress, pause, resume, retry, steer |
| component | ResearchPanel and ResearchReportView | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources panel and report view |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends research, sources and resume record |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Deep Research row |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Run record, cancel, pause and steer flags |
| service | billing catalog | `packages/contracts/types/src/billing-catalog.ts` | deep_research capability by plan tier |
| component | mobile ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile report list |
| store | mobile researchRunState | `apps/mobile/src/features/chat/utils/researchRunState.ts` | Mobile research phases and resume payload |
| component | desktop DeepResearchPage | `apps/desktop/src/features/research/DeepResearchPage.tsx` | Internal Tauri build page |
| service | Tauri research orchestrator | `apps/desktop/src-tauri/src/core/research/orchestrator.rs` | Internal Tauri local research |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The composer sends the question with research on; the server checks the paid capability and the model. | device and our servers | useChatStream.ts:310-318; request-processor.ts:5221, 2477-2483 |
| The server starts a research cloud-agent run row and, for the first pass, writes a plan and stops for approval. | our servers | route.ts:567-570; research-loop.ts:3088-3110 |
| The user edits and approves the plan; the approved steps return with the next request. | device | research-run-options.ts:98-112; ResearchPlan.tsx |
| Gathering rounds run searches and page reads (native provider search or the platform tools), within the budgets, and aggregate sources. | our servers | research-loop.ts:2600-2700, 3363-3395 |
| Synthesis writes the report; the loop saves the row and notifies the user. | our servers | research-loop.ts:3544; research-run-options.ts:74-97 |
| The client lists and reopens reports through the reports API. | device and our servers | research/reports/route.ts; mobile service.ts:134 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report: query, title, summary, content, citations, steps, key findings, status, sources consulted, duration, error, model, provider | table research_reports, owner-only row-level security | yes through the API | Rows cascade-delete with the conversation; no other expiry found [0094_research_reports.sql:30-60] |
| Run state for cancel, pause and steer | Cloud agent run records | server only | unknown |
| Settled cost in microUSD | research_reports.settled_cost_microusd (if 0191 is applied) | yes | Null when not settled [0191:6-12] |

**Models and providers.** The loop uses the user's chosen or routed model through the provider adapters, with managed failover to another candidate on availability errors; we never call a provider 'deep research' model [research-loop.ts:1-12, 1746-1765]. Search uses native provider search when present, else the platform tool [research-loop.ts:19-27].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account. |
| Permissions | Capability canUseDeepResearch and canUseWebSearch; connector permissions; tool approval policy [request-processor.ts:5221-5228; route.ts:600-625]. |
| Subscription | Paid tiers only: pro, max, max_15x, team, team_premium, enterprise [billing-catalog.ts:341, 355]. Free: allowed false with policy source tier:free [packages/contracts/cloud-contracts/src/capability-handshake.ts:57]. |
| Limits and metering | Run budgets above; each search is charged to managed credits as an automated caller; the run's model usage settles through the managed usage lifecycle [research-loop.ts:1811-1845, 3596-3606]. |
| Feature flags | Kill switch for canUseDeepResearch [apps/web/lib/observability/ownership.ts:111]; durable-turns flag [route.ts:637]. |
| Model compatibility | Needs the catalog research capability and enough context window; the composer offers it on Auto [ChatComposerNew.tsx:1612-1618]. |
| Provider restrictions | Any adapter-backed provider takes this path, Anthropic included [route.ts:559-566 comment]. |
| Local mode | Does not run in Local or own-key on the managed route [request-processor.ts:4876 comment]. The internal Tauri build runs its own local orchestrator regardless of plan (not traced for gating). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Awaiting approval | Stream ends with phase paused and status 'Review the plan to start searching' | research-loop.ts:3098-3110 |
| Cancelled | Stored interrupted with 'Research was cancelled.'; stop reason cancelled | research-loop.ts:2034-2050 |
| Client closed or abrupt stop | The finally block stores an interrupted row if none was written | research-loop.ts:3590-3597 |
| No search available on the serving route | Stored failed with an explicit message | research-loop.ts:3000 |
| Synthesis cut short | Stored interrupted with the partial text; status 'Report cut short' | research-loop.ts:3519-3538 |
| Empty report or every provider call failed | Stored failed with the cause; gathered sources kept | research-loop.ts:3495-3510 |
| Report save fails | 3 attempts with growing delay; then status line says it could not be saved | research-loop.ts:188-189, 2006-2024, 3583-3586 |
| Paused | Saved as interrupted with a paused reason | research-loop.ts:2094 |
| Search charge refused | That search is skipped | research-loop.ts:1811-1845 |
| Offline or reconnect | The run continues on the server when the durable path is on; resume uses the stored row; client reconnect to a followed run exists | route.ts:634-700; useChatStream.ts:3115-3190 |
| Accessibility | Plan, panel and report controls carry aria-labels; full audit not done | ResearchActivity.tsx:546, 591; ResearchPanel.tsx:392-403 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.test.ts`: 79 cases: source aggregation, plan parsing, gaps, stop logic, query rewrites
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.url-fetch.test.ts`: 9 cases: page reads in rounds, cancellation
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.anthropic-wire.test.ts`: Anthropic wire shape in the loop
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.google-wire.test.ts`: Google wire shape in the loop
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.secret-results.test.ts`: secret handling in results (title-level)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.research.test.ts`: 15 cases: research request shaping
- `apps/web/lib/services/research-report-service.test.ts`: 21 cases: upsert, completed_at, interrupted rows with honest error
- `apps/web/features/chat/components/research/ResearchActivity.test.tsx`: activity header (contents not read)
- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: report view
- `apps/web/features/chat/components/research/ResearchReportsGallery.test.tsx`: reports list
- `apps/mobile/src/features/research/__tests__/service.test.ts`: mobile reports fetch and pagination

**Test scenarios**

- **Free refusal**
  1. Sign in as a Free account
  2. Open the + menu
  - Expected: Deep Research shows an upgrade state; a forced request is refused.
- **Plan then run**
  1. Paid account, turn on Deep Research, ask a broad question
  2. Check no search ran before the plan card
  3. Press Start research
  - Expected: Rounds run, a cited report appears, row saved with status completed.
- **Cancel and resume**
  1. Start a run, cancel after round one
  2. Open the report row
  3. Use Resume
  - Expected: Row is interrupted with sources; resume continues without repeating completed steps.
- **Site restriction**
  1. Allow one site on the plan card, run
  - Expected: All citations are from that site.
- **Budget stop**
  1. Set AGI_RESEARCH_MAX_SEARCHES low on a test server
  2. Run
  - Expected: Gathering ends at the cap, the report notes unsearched steps.
- **Save failure**
  1. Force the report write to fail
  - Expected: Status 'Research complete, but the report could not be saved'.

**Where to look when it fails**

- Log lines '[research-loop] research report could not be persisted', '[research-loop] synthesis failed', '[research-loop] pause request could not be read'.
- Table research_reports: status, error, sources_consulted, settled_cost_microusd; index on unfinished runs [0094:62-70].
- Header X-AGI-Research-Loop and X-AGI-Workflow-Run-Id on the stream [route.ts:667-672].

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Gaps, deliverable and source selection are not stored with the report.** Affects: Web and mobile when a report is reopened. Evidence: research-report-service.ts:237-243. Work needed: Add columns by a new numbered migration and map them.
- **Settled cost column status unknown; migration file says not applied.** Affects: Report footer cost. Evidence: 0191_research_report_settled_cost.sql:3. Work needed: Check the migration log and fix the header.
- **0094 header says request-bound, which no longer matches the durable path.** Affects: Engineers. Evidence: 0094:20-24; route.ts:634-660. Work needed: Update the comment.
- **Deep Research absent on CLI, VS Code and Chrome (declared).** Affects: Those apps. Evidence: surface-feature-matrix.md:277-279. Work needed: Product decision.
- **The internal Tauri orchestrator is separate code with its own gating (unknown).** Affects: Internal desktop build. Evidence: orchestrator.rs:135-200. Work needed: Confirm retirement or alignment.
- **Citations carry no locator; no grounding check on the report.** Affects: All apps. Evidence: research-loop.ts:1002-1010; brief S93.27. Work needed: See F093-10.
- **No per-user cap on stored reports found.** Affects: Storage. Evidence: none found in research-report-service.ts. Work needed: Decide retention.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- mode:cloud
- table:research_reports
- F093-07
- F093-08
- F093-09
- F093-10

## Unknown

- Whether migration 0191 is applied in production.
- Retention of report rows beyond conversation deletion.
- The internal Tauri orchestrator's plan and entitlement gating.
- How mobile starts and approves a plan (store code seen, screens not traced).
- Per-run cost range and exact billing for a full run.
- Whether the durable-turns flag is on in production.
