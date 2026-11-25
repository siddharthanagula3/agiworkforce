---
id: "F108-03"
type: "feature"
title: "Deep research workspaces (finance, company, legal, science)"
aliases: ["Deep Research (web label)", "Deep research (mobile label)", "Research toggle", "Research run", "Research loop", "Research reports / Reports", "Financial research workspace (S108.09)", "Company research (S108.10)", "Legal research workspace (S108.17)", "Scientific research workspace (S108.20)"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.09", "S108.10", "S108.17", "S108.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "file:apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts", "api:POST /api/llm/v1/chat/completions", "api:GET /api/research/reports", "table:research_reports", "provider:perplexity", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-03 Deep research workspaces (finance, company, legal, science)

One general Deep Research run serves the finance, company, legal and science items. A paid person turns on Deep Research, approves a plan, and the server runs bounded search rounds and writes a cited report that is saved. No finance, legal or science specific code exists. Works on web, Desktop (hosted web) and mobile.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.09](../../10-requirements/capabilities/108-specialist-workspaces.md#s10809), [S108.10](../../10-requirements/capabilities/108-specialist-workspaces.md#s10810), [S108.17](../../10-requirements/capabilities/108-specialist-workspaces.md#s10817), [S108.20](../../10-requirements/capabilities/108-specialist-workspaces.md#s10820).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Plans a research question, runs several rounds of web search and page reads, merges and numbers sources, and writes a cited report that is saved and can be reopened (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1-45).

**Why it exists.** The brief maps four specialist workspaces (markets, company, legal, science) to this single research capability. The product matrix lists Deep Research as general availability on web, desktop and mobile (doc: docs/product/surface-feature-matrix.md:63).

**Who uses it.** A person on a plan with Deep Research: pro, max, max_15x, team, team_premium or enterprise (billing-catalog.ts:355).

**Problems it solves**

- Answering a broad question with many sources in one cited document
- Keeping citation numbers stable across rounds
- Letting the person review and edit the plan before cost is spent
- Resuming or reopening a report later

**Use cases**

- Profile a company: business, financials, news, competitors
- Compare a market or instrument with sources
- Find legal authorities on a question and cite them
- Summarise recent papers on a scientific topic

## 2. User experience

**Where to find it**

- Web: composer plus menu row 'Deep Research' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:187,1307-1311,1720-1730); availability decided in apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1621-1628. Sources panel and reports gallery in ResearchPanel (apps/web/features/chat/components/research/ResearchPanel.tsx:475).
- Desktop: the hosted web app [doc: AGENTS.md section 5]; the surface matrix also lists a retained Tauri page at apps/desktop/src/features/research (doc: docs/product/surface-feature-matrix.md:272-276).
- Mobile: composer add sheet row 'Deep research' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:230-235,1232-1239); saved reports under the drawer entry 'reports' (labelKey drawer.reports, apps/mobile/src/features/drawer/components/DrawerContent.tsx:161-167) opening screen 'Reports' (apps/mobile/src/features/research/ReportsScreen.tsx:621).
- CLI, VS Code, Chrome: absent (doc: docs/product/surface-feature-matrix.md:63,274-276).

**Before you start**

- Signed in on a plan with Deep Research; Free trial turns are refused (route.ts:567; ChatComposerNew.tsx:1622-1624).
- Cloud mode and a model that can search; web needs the model's research capability, or tools plus a context window of at least 500,000 (apps/web/features/chat/lib/research-capability-gate.ts:3-13); mobile needs research and search capability and cloud mode (AddToChatSheet.tsx:230-235).
- Switch canUseDeepResearch on for the account (ChatComposerNew.tsx:1621).

**Screens and controls**

- Toggle 'Deep Research' (web) or 'Deep research' (mobile).
- Plan card headed 'Research plan' with buttons 'Start research' and 'Cancel' on web (apps/web/features/chat/components/research/ResearchPlan.tsx:23-31); mobile card labels 'Research plan, editable' and 'Cancel' (apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:373,548,641).
- Plan questions and editable steps, deliverable choice (ResearchPlan.test.tsx:18-97).
- Source choices: web, files, connectors, allowed and blocked sites (research-run-options.ts:~85-95; ResearchActivity.tsx:448).
- Activity header with phase labels such as 'Research paused', 'Research complete', 'Research failed', 'Research stopped' (ResearchActivity.tsx:56-64).
- Report view with sources panel; export formats include Markdown (ResearchReportView.tsx:134).

**Journey**

1. Open a chat and choose the plus menu, then switch on Deep Research.
2. Type the question and send.
3. The first request ends after planning and shows the plan for approval (research-run-options.ts: requirePlanApproval when no approved steps).
4. Edit steps, answer questions, pick sources, then press 'Start research' (or 'Cancel').
5. Watch the activity header as rounds search and read pages; sources accumulate with stable numbers.
6. A final turn writes the report with numbered citations; it streams as the answer.
7. Reopen it from the sources panel gallery on web or from Reports on mobile.

**What the person sees and gets**

- Activity phases: planning, awaiting approval, searching, synthesizing, paused, complete, error (research-loop.ts:150-152).
- Cumulative sources list and the cited report (research-loop.ts:23-35).
- A notification when a report settles (research-run-options.ts: notifyResearchReportSettled).
- Plan refusal: 'Deep Research is available on <plans> plans. Upgrade your plan to use it.' (request-processor.ts:1508-1519).
- Mobile empty state 'No reports yet' with 'Turn on Research in the composer and ask. Reports appear here.' and signed-out text 'Sign in to read your reports' (ReportsScreen.tsx:596-646).

**Settings**

- Domain allow and deny lists and file sources per run (research-run-options.ts).
- Workspace website rules (request-processor.ts:5253-5262).
- Operator variables AGI_RESEARCH_MAX_ITERATIONS, AGI_RESEARCH_MAX_SEARCHES, AGI_RESEARCH_BUDGET_MS, AGI_RESEARCH_MAX_PARALLEL_TOOL_CALLS, AGI_RESEARCH_MAX_QUERY_REWRITES (research-loop.ts:1769-1845).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Plan, approval, search rounds, page reads, source merge, synthesis and report save are implemented and wired through the chat route (route.ts:567-770; research-loop.ts).
- Bounds: model calls default 6 (allowed 2 to 8), searches 12 (3 to 15), gathering budget 4 minutes (30 seconds to 10 minutes), 3 parallel tool calls (1 to 8), page reads 8 per run and 3 per round; with planning on, gathering rounds are model calls minus 2, so 4 by default (research-loop.ts:166-186,1769-1801). A synthesis turn always runs at the end.
- Citation numbers are stable and deduplicated across rounds (research-loop.test.ts:251-262).
- Heartbeat keeps the stream alive during silent rounds (route.ts:786).
- Client cancel or stop aborts upstream and the run is recorded as interrupted (route.ts:600-610; research-loop.test.ts:838).
- Reports saved to research_reports and listed by GET /api/research/reports (research-report-service.ts:205-237; apps/web/app/api/research/reports/route.ts:20-62).
- Approved plans can run as a durable workflow with checkpoints when durable turns are enabled; otherwise request-scoped (route.ts:630-690).
- Mobile reports screen, detail, sharing and follow-up (ReportsScreen.tsx).

**Incomplete**

- No domain-specific behaviour: nothing in the code names finance, filings, legal authorities or scientific literature. Domain quality depends on web search and the user's domain allow list [inferred].
- The brief's code pointers into vendor-directory.json land on unrelated connector entries (for example a lab-results summary listing at line 2843 and an arXiv search listing at line 388); those are directory listings of third-party servers, not research code.
- Connector sources in research are limited by the connector release state: only 13 connectors are selectively released and none is finance, legal or science specific (connector-release.ts:16-30; route.ts:700-706) [inferred from the list].

**Present but disconnected or switched off**

- Mobile Research toggle needs FEATURES.research, which is true (apps/mobile/lib/v1FeatureFlags.ts:24).
- Chrome: no research toggle or reports; only a routing task type named 'research' in the model router (apps/extension/src/features/cloud-bridge/managedChatRouting.ts:27).

**Not available**

- Chrome, CLI, VS Code: absent.
- Local mode on mobile: the toggle only shows in cloud mode (AddToChatSheet.tsx:230-235).
- Finance filings, legal case-law database, and paper library: see F108-04 for the unbuilt library.

## 4. Required behaviour

**Established requirements**

- A research workspace for financial questions (markets, instruments, filings) gives sourced, cited output. (source: S108.09 (brief))
- The user researches a company and gets a sourced profile (business, financials, news, competitors). (source: S108.10 (brief))
- A legal-research workspace searches case law and statutes and returns cited authorities. (source: S108.17 (brief))
- A scientific-research workspace searches literature and produces cited syntheses. (source: S108.20 (brief))
- Deep Research is general availability on web, desktop, mobile and the API; absent on CLI, VS Code and Chrome. (source: doc: docs/product/surface-feature-matrix.md:63)
- Deep research and API search is metered as provider search. (source: doc: docs/decisions/2026-09-15-founder-decisions.md:207)
- Evaluate research planning, source restrictions, progress, stopping and cited outputs with the leaders as the reference. (source: doc: docs/product/competitive-guidance.md:344-352)

**Acceptance criteria**

1. A Free or basic account sees Deep Research refused or marked as needing an upgrade; a pro account can start a run.
2. The first send shows a plan and no searches happen until 'Start research' is pressed.
3. A run never exceeds the configured searches, model calls or time and always ends with a report, even when a bound stops gathering.
4. Citation numbers in the report match the sources list and do not change between rounds.
5. Pressing stop mid-run ends it and the saved report shows an interrupted status.
6. The saved report appears in the web gallery and the mobile Reports screen with its citations.
7. A blocked site in the run's deny list never appears as a source.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Specialist depth for finance, legal and science would need dedicated sources; today the generic loop is what satisfies the brief rows, which the brief marks 'done' [inferred from absence of domain code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add domain presets that preload source allow lists (for example regulator filing sites, court sites, paper indexes) on the plan card.
- [proposed] Add a Chrome entry only if the product matrix decision changes.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerPlusMenu research row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Web 'Deep Research' toggle row (187,1307,1720) |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Capability decision canUseDeepResearch and upgrade state (1621-1628) |
| other | research capability gate | `apps/web/features/chat/lib/research-capability-gate.ts` | Which models can research (capability or large context) |
| component | ResearchPlan | `apps/web/features/chat/components/research/ResearchPlan.tsx` | Plan card: Start research, Cancel, edit, questions |
| component | ResearchActivity | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Progress header, phases, plan decision, source domains |
| component | ResearchPanel and gallery | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources side panel and saved reports gallery |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Report display and export |
| endpoint | POST /api/llm/v1/chat/completions (research) | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Dispatches research turns to the loop (567-770); heartbeat at 786 |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Plan, gather, synthesize, bounds, citations, checkpoints |
| service | research-run-options | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Connector scoping, sources, persistence, plan approval flag |
| service | research-sources | `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Domain policy, connector and file source prompts |
| service | getResearchPlanRefusal | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Plan check (1503-1519), called at 5194; research mode at 5240 |
| service | research-report-service | `apps/web/lib/services/research-report-service.ts` | Save, read, list reports; settled cost |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | List reports or fetch one by requestId |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Stores query, content, citations, steps, status, cost; row-level security |
| config | billing capability deep_research | `packages/contracts/types/src/billing-catalog.ts` | Tier list for deep_research (355) |
| service | web-search budget | `apps/web/lib/web-search/search-budget.ts` | Search admission and charge used by the loop (research-loop.ts:1802-1832) |
| screen | Mobile composer sheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | 'Deep research' row and visibility rule |
| component | Mobile ResearchRunCard | `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx` | Plan and progress card on mobile |
| screen | Mobile ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Saved reports list and detail |
| service | Mobile research service | `apps/mobile/src/features/research/service.ts` | Fetches /api/research/reports (121-134) |
| config | mobile feature flag research | `apps/mobile/lib/v1FeatureFlags.ts` | research true (24) |
| test | check-research-run-bounds | `scripts/check-research-run-bounds.test.mjs` | Guard that checks declared bounds and terminal statuses against the contract |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person switches Deep Research on and sends; the client sends research:true to the chat endpoint. | device and our servers | ComposerPlusMenu.tsx:1307; request-processor.ts:2700 |
| Server refuses with plan_upgrade_required when the plan lacks deep_research. | our servers | request-processor.ts:1503-1519,5194 |
| Server enters research mode for a paid, non-trial turn and starts a run record; the first request stops after planning. | our servers | route.ts:567-578; research-run-options.ts (requirePlanApproval) |
| After 'Start research' the approved steps return in a second request; durable workflow or request-scoped loop runs. | our servers | route.ts:630-690 |
| Each gathering round asks the chosen provider with a search tool; searches may be a provider-native tool or our own web_search function; admitted searches reserve a charge. | outside service | research-loop.ts:11-18,1802-1832 |
| Pages are read through url_fetch (up to 8) and merged into a deduplicated, numbered source list; blocked domains are dropped. | outside service | research-loop.ts:152-165; research-loop.test.ts:284 |
| A synthesis turn writes the report; the report is saved to research_reports and a notification is sent. | our servers | research-run-options.ts:~60-85; research-report-service.ts:205-237 |
| The client shows the report, sources panel and gallery; mobile reads the list from the API. | device | ResearchPanel.tsx:475; service.ts:121-134 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Research report: query, title, summary, content, citations, steps, key findings, status, cost, model, provider | table research_reports (server database) | Served to web and mobile by GET /api/research/reports | Unique per user and request id; status pending, researching, synthesizing, completed, interrupted, failed (0094_research_reports.sql:45-47); deletion rules not examined |
| Run record, checkpoints and steer messages | cloud agent run store (apps/web/lib/services/cloud-agent-run-service.ts) | Server only | unknown |
| Usage and search charges | managed usage accounting (apps/web/lib/services/managed-usage-accounting-service.ts) | Server only | unknown |

**Models and providers.** The run uses the model the person selected or Auto picked, on any provider reachable through the shared adapters; the loop calls no provider 'deep research' model (research-loop.ts:3-8). Web search comes from a provider-native tool or our generic backend; the search charge feature is named for Perplexity (research-loop.ts:1815-1822), so provider:perplexity matters for metering. A managed failover plan can rotate the serving provider (route.ts:605-614).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; account active. |
| Permissions | Workspace website rules narrow sources (request-processor.ts:5253-5262); connector sources obey per-chat switches and saved verdicts (research-run-options.ts:53-70). |
| Subscription | Capability deep_research: pro, max, max_15x, team, team_premium, enterprise; basic and Free excluded (billing-catalog.ts:355; request-processor.ts:1503-1519). Free-trial turns never enter the loop (route.ts:567). |
| Limits and metering | Per-run bounds listed above, configurable by environment variables. Searches reserve and settle a charge (research-loop.ts:1802-1832) and settled cost is written to the report (research-report-service.ts:195-209). Decision doc says deep research meters provider search (docs/decisions/2026-09-15-founder-decisions.md:207). Account-level credit or quota numbers: unknown (not opened). |
| Feature flags | Mobile FEATURES.research true; web capability canUseDeepResearch; kill switch canUseWebSearch applies to search (request-processor.ts:5225-5236); durable turns flag (route.ts:630-640). |
| Model compatibility | Web: research capability or tools plus at least 500,000 context; Auto is allowed. Mobile: research and search capabilities required (AddToChatSheet.tsx:230-235). |
| Provider restrictions | Any adapter-backed provider reaches the loop (research-loop.ts:11-18); search backend may differ per provider. No finance, legal or science provider. |
| Local mode | Not available on mobile (cloud mode only: AddToChatSheet.tsx:230-235). Local or own-key on web: unknown (appMode not examined in the web composer). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Waiting for approval | Plan shown with Start and Cancel; stateless, the approved plan returns on the next request | research-loop.ts:293-300; ResearchActivity.test.tsx:187-243 |
| Bound reached | Gathering stops at the iteration, search or time cap and synthesis still runs; the report is flagged cut short | research-loop.test.ts:676-762 |
| First gathering turn fails | Honest error and stop; a later failure keeps partial material and synthesizes | research-loop.test.ts:793-835 |
| Cancel | Stop aborts the provider call; terminal stop envelope; report persisted as interrupted | research-loop.test.ts:560-575,838 |
| Retry or resume | Prior sources and completed steps carry over and keep citation numbers | research-loop.ts:300-312; ResearchActivity.test.tsx:114-185 |
| Timeout or silent rounds | SSE heartbeat; nested provider deadlines | route.ts:786; research-loop.ts:130-137 |
| Failover | Managed failover can swap provider mid-run | route.ts:605-614 |
| Offline (client) | not handled in the code beyond stream error states | not found in research UI files |
| Signed-out mobile | 'Sign in to read your reports' | ReportsScreen.tsx:596-609 |
| Report list error | Message with 'Try again' | ReportsScreen.tsx:629-640 |
| Free account | Toggle shows needing upgrade; server refuses | ChatComposerNew.tsx:1622-1624; request-processor.ts:1503-1519 |
| App differences | Web has editable plan, source choices and domain lists; mobile reads reports and has the plan card; the brief's sibling items note mobile lacks source selection | audit/partial/035-research-workspace.md (S35.05) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.test.ts`: Plan to synthesis flow, bounds, errors, cancellation, source dedupe and numbering, domain blocking, status events
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.url-fetch.test.ts`: Page reads in rounds
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.anthropic-wire.test.ts`: One provider wire shape through the loop
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.google-wire.test.ts`: Another provider wire shape
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.secret-results.test.ts`: Secret handling of tool results
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.tool-call-ids.test.ts`: Tool call id bounds
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-run-options.connectors.test.ts`: Connector scoping for research
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-sources.test.ts`: Source prompts and domain rules
- `apps/web/lib/services/research-report-service.test.ts`: Report save and read
- `apps/web/db/neon/research-reports-migration.test.ts`: research_reports migration
- `apps/web/features/chat/components/research/__tests__/ResearchPlan.test.tsx`: Plan questions, edits, empty plan refusal
- `apps/web/features/chat/components/research/ResearchActivity.test.tsx`: Budget display, plan queue, retry, approval, completion notification
- `apps/web/features/chat/components/research/ResearchReportsGallery.test.tsx`: Reports gallery
- `apps/mobile/src/features/research/__tests__/ReportsScreen.test.tsx`: Mobile reports list (plus Actions, Citations, ModelName, Report tests in the same folder)
- `apps/mobile/src/features/chat/components/research/__tests__/ResearchRunCard.test.tsx`: Mobile research card
- `scripts/check-research-run-bounds.test.mjs`: Bounds guard against the contract

**Test scenarios**

- **Plan then start**
  1. Use a pro account
  2. Switch on Deep Research and ask for a company profile
  3. Read the plan, press Start research
  - Expected: No search before Start; then searching, synthesizing, complete; report with numbered citations
- **Plan refusal**
  1. Use a basic account
  2. Send a request with research true
  - Expected: 403 plan_upgrade_required naming the plans with Deep Research
- **Cap behaviour**
  1. Set AGI_RESEARCH_MAX_SEARCHES low in a test deployment
  2. Run a broad question
  - Expected: Gathering stops at the cap, a report is still written and marked cut short
- **Cancel**
  1. Start a run
  2. Press stop while searching
  - Expected: Run ends; saved report status interrupted
- **Mobile reports**
  1. Finish a run on web
  2. Open Reports on mobile
  - Expected: The report is listed and opens with citations
- **Blocked site**
  1. Add a domain to the deny list on the plan card
  2. Run
  - Expected: No source from that domain appears

**Where to look when it fails**

- Response headers X-AGI-Research-Loop: active and X-AGI-Tool-Loop: durable (route.ts:640-650,780)
- Log '[research] search charge could not be held; the search is skipped' (research-loop.ts:1829)
- Log 'Durable research run could not start; falling back to the request-scoped stream' (route.ts:~685)
- Table research_reports status and error columns; cloud agent run records

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)
- Mobile: [70-qa/test-plans/mobile/108-specialist-workspaces.md](../../70-qa/test-plans/mobile/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **No specialist workspaces: finance, company, legal and science share one generic run with no domain sources or presets** Affects: Web, Desktop, Mobile. Evidence: No domain code found; brief code pointers hit unrelated directory entries. Work needed: Decide if presets are wanted; add source presets and domain evaluation
- **Chrome has no Deep Research** Affects: Chrome. Evidence: docs/product/surface-feature-matrix.md:63. Work needed: Product decision
- **Mobile lacks the source selection that web has** Affects: Mobile. Evidence: audit/partial/035-research-workspace.md S35.05 lists mobile missing. Work needed: Add source choices on mobile
- **Web composer Local or own-key behaviour for research is not established** Affects: Web, Desktop. Evidence: not examined. Work needed: Read the web appMode gating and record it
- **Connector-based specialist sources are blocked by the release state** Affects: All. Evidence: connector-release.ts:14-30. Work needed: Release the needed connectors
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- file:apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts
- api:POST /api/llm/v1/chat/completions
- api:GET /api/research/reports
- table:research_reports
- provider:perplexity
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills

## Unknown

- Deletion and retention rules for research_reports rows.
- Account-level credit or quota numbers charged per run.
- Web composer behaviour in Local or own-key modes.
- Whether durable research turns are enabled in production.
- How the Desktop hosted window treats research differently, if at all.
