---
id: "F035-01"
type: "feature"
title: "Start a research run and see what it may cost"
aliases: ["Deep Research", "Deep research toggle", "research: true request flag", "Research run", "Research cost estimate", "S35.01", "S35.34"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.01", "S35.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "provider:perplexity", "file:apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-01 Start a research run and see what it may cost

Starting a Deep Research run: the person switches on Deep Research in the chat box (web, desktop through the hosted web app, mobile) or sends research true on a streaming chat request. The server checks plan, model and lockdown, then runs a bounded plan, search and write loop. Only the web plan card shows a credit estimate.

Area: [35. Research workspace](README.md). Requirement items: [S35.01](../../10-requirements/capabilities/035-research-workspace.md#s3501), [S35.34](../../10-requirements/capabilities/035-research-workspace.md#s3534).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person ask a question as a Deep Research run instead of a normal chat reply. The server plans searches, runs them within fixed limits, then writes a cited report. The web plan card shows an estimated credit cost and the credits available [inferred from ResearchCostEstimate.tsx:32-57].

**Why it exists.** Research costs many model calls and searches, so it is opt-in, paid-plan only and bounded, and the cost is shown before the person approves spending (doc: docs/product/experience-contract.md W08 row, line 781).

**Who uses it.** People on a paid plan (pro, max, max_15x, team, team_premium, enterprise) on web, desktop or mobile, and developers calling the chat completions API [packages/contracts/types/src/billing-catalog.ts:341,355].

**Problems it solves**

- A normal chat answer does not read many sources and cite them.
- Unbounded agent loops could spend a person's budget without warning.
- Models that cannot do research must not silently fail.

**Use cases**

- A web user switches on Deep Research and asks for a market comparison.
- A mobile user turns on Deep research in the Add to chat sheet and asks a question.
- A developer sends research true with stream true to the API and reads the streamed plan and report.

## 2. User experience

**Where to find it**

- Web and Desktop (desktop shows the hosted web app): composer plus menu row 'Deep Research' [apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:187,1307,1720; ARCHITECTURE.md:37,51].
- Mobile: 'Deep research' row in the Add to chat sheet [apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1232-1238]; once on, the chat input shows a 'Research' chip with the label 'Deep Research active' [apps/mobile/src/features/chat/components/ChatInput.tsx:586-591].
- API: field research on POST chat completions [apps/web/public/openapi.json:765-768].
- CLI, VS Code, Chrome: no start control found (grep of apps/cli/src, apps/extension-vscode/src, apps/extension/src found no research request flag; only a routing task label and plan tier list).

**Before you start**

- Signed in, on a plan with the deep_research capability (not Free) [packages/contracts/types/src/billing-catalog.ts:355].
- A model with the research capability, or a tool-capable model with a context window of at least 500,000 tokens, or Auto, on web [apps/web/features/chat/lib/research-capability-gate.ts:3-14; ChatComposerNew.tsx:1616-1620].
- Mobile: Cloud mode, a model that declares both research and search, and the canUseDeepResearch capability granted [AddToChatSheet.tsx:230-235].

**Screens and controls**

- Web toggle disabled with title 'Upgrade to use Deep Research' for free trial or requires_upgrade, 'Checking your plan…' while the plan loads, or 'Deep Research isn't available for this model. Choose Auto or a model that supports Deep Research.' [ChatComposerNew.tsx:6094-6106].
- Web plan card shows a cost line under the plan (ResearchCostEstimate) [apps/web/features/chat/components/research/ResearchPlan.tsx:321].
- Mobile shows no cost line (no estimate code in the mobile research folder; grep found none).

**Journey**

1. Pick a model that supports research (or Auto).
2. Switch on Deep Research.
3. Type the question and send.
4. The run plans, then stops on a plan card titled 'Research plan' with the status 'Review the plan to start searching' (see F035-02) [ResearchPlan.tsx:22; ResearchActivity.tsx:58].
5. Read 'Estimated cost: up to about N credits for up to R model rounds and S searches.' and 'You have N available right now.' [ResearchCostEstimate.tsx:47-52].
6. Press Start research; while running a chip 'up to ~N' shows next to counts [ResearchActivity.tsx:396].

**What the person sees and gets**

- Warning when the estimate is above the balance: '…so the run may stop before it finishes.' [ResearchCostEstimate.tsx:50].
- No price data: 'A cost estimate is not available for this model. The run is metered as it goes.' [ResearchCostEstimate.tsx:35-37].
- After the run, the settled credits appear in the status bar counts [ResearchActivity.tsx:392-394].
- If the model cannot do research the reply is a normal answer that says Deep Research did not run (fallback reason research_unsupported_model) [request-processor.ts:6412-6413].

**Settings**

- Server environment: AGI_RESEARCH_MAX_ITERATIONS (2 to 8), AGI_RESEARCH_MAX_SEARCHES (3 to 15), AGI_RESEARCH_BUDGET_MS (30 s to 10 min), AGI_RESEARCH_MAX_PARALLEL_TOOL_CALLS (1 to 8), AGI_RESEARCH_MAX_QUERY_REWRITES (0 to 12) [research-loop.ts:1769-1782,1840-1845].
- Mobile build flag FEATURES.research (currently true) [apps/mobile/lib/v1FeatureFlags.ts:24].
- Account Lockdown mode blocks research [request-processor.ts:5313-5328].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer toggle with plan, model and free-trial gating, and it switches itself off when the model loses support [ChatComposerNew.tsx:1616-1628,1700-1705,2212-2214].
- Request fields research, research_sources, research_resume are validated server side [request-processor.ts:721-775].
- Free plan refused with 403 plan_upgrade_required [request-processor.ts:1503-1522,5194-5195]; free trial refused with 403 free_trial_feature_unavailable [request-processor.ts:2663,4405-4420].
- Capability and kill-switch gate canUseDeepResearch via assertCapabilityAvailable [request-processor.ts:5220-5222].
- Lockdown refuses with 403 lockdown_blocks_research [request-processor.ts:5313-5328].
- Unsupported model falls back to a normal answer with fallback reason research_unsupported_model [request-processor.ts:5295,6412-6413].
- The loop runs only on streaming requests [route.ts:560,567]; defaults 6 model calls, 12 searches, 4 minutes of gathering, 3 parallel tool calls [research-loop.ts:178-184].
- The server records the run as a cloud agent run of kind research [route.ts:568].
- Web cost estimate with available credits from five-hour, weekly, monthly plan remaining plus bonus and purchased [apps/web/lib/hooks/useManagedUsageSummary.ts:163-172; apps/web/lib/billing/credit-estimates.ts:76-91].
- Mobile toggle and request building [AddToChatSheet.tsx:230-235; apps/mobile/stores/chat/chatExecutionStore.ts:3264-3270,3395].

**Incomplete**

- Estimate appears only on the web plan card and as a chip during the run, not in the composer before sending [ResearchPlan.tsx:321; ResearchActivity.tsx:282-288].
- The estimate uses the model picked in the model store, not the model that serves the run, so under Auto it may differ [ResearchActivity.tsx:277-281] [inferred].
- Mobile shows no estimate and no remaining allowance (no code found).
- Mobile toggle needs the research capability flag strictly, while web also accepts large-context tool models, so the two apps differ [AddToChatSheet.tsx:230-235 vs research-capability-gate.ts:5-13].

**Present but disconnected or switched off**

- The Tauri build (retained internal code) has its own DeepResearchPage and research store that call Tauri commands such as research_cancel; they are not the public Electron path [apps/desktop/src/features/research/DeepResearchPage.tsx:1; apps/desktop/src/stores/researchStore.ts:203; ARCHITECTURE.md:37].

**Not available**

- CLI: no research start (apps/cli/src/plans.rs:101 only lists the capability tier).
- VS Code: no start control found; it can only manage cloud runs (apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:54).
- Chrome extension: no start control found; research appears only as a routing task type (apps/extension/src/features/cloud-bridge/managedChatRouting.ts:27).

## 4. Required behaviour

**Established requirements**

- A user can start a Deep Research task and it runs as a research run (S35.01). (source: brief S35.01)
- The user can see how much research allowance remains before starting (S35.34). Web done, mobile missing. (source: brief S35.34)
- Research is opt-in, paid-plan capability; Deep Research is not available on the free plan. (source: packages/contracts/types/src/billing-catalog.ts:355)
- Deep research meters provider search cost by the existing policy. (source: doc: docs/decisions/2026-09-15-founder-decisions.md:207)
- Review the plan before approved work begins; allowed source controls are enforced. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. On web with a paid plan and a supporting model, the Deep Research row is enabled; with a Free plan it is disabled with 'Upgrade to use Deep Research'.
2. A request with research true on a Free plan returns 403 with code plan_upgrade_required.
3. A streaming request with a supporting model returns an event stream whose first stop is the plan (status phase awaiting_approval).
4. With Lockdown mode on, the request returns 403 lockdown_blocks_research.
5. With a model that cannot do research, the reply is a normal answer and the turn is marked research_unsupported_model.
6. The plan card shows 'up to about N credits' and 'You have N available right now', and a warning when N is above the balance.
7. Setting AGI_RESEARCH_MAX_SEARCHES outside 3 to 15 is clamped into range.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The loop budget is 'plan turn, up to maxIterations-2 gathering rounds, one write turn', so the default 6 gives 4 gathering rounds [research-loop.ts:1796-1800 region and 1769].
- A research:true request with stream false gets no loop, since the loop is inside the stream branch (route.ts:560); the reply is a single normal turn that already has web search on and the research prompt applied [request-processor.ts:2500-2512].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the estimate in the composer before sending, on every app, using the serving model.
- [proposed] Show credits remaining on mobile and hide the toggle with an upgrade hint for Free users.
- [proposed] Align the mobile capability test with the web gate.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerPlusMenu Deep Research row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Web toggle row labelled Deep Research |
| component | ChatComposerNew gating | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Decides if research is allowed for the model and plan, and clears it when not |
| other | modelSupportsResearch | `apps/web/features/chat/lib/research-capability-gate.ts` | Research capability or tools plus 500k context rule |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends research, research_sources, research_resume on the chat request |
| component | ResearchCostEstimate | `apps/web/features/chat/components/research/ResearchCostEstimate.tsx` | Estimate and available credits text |
| service | estimateResearchCredits | `apps/web/lib/billing/credit-estimates.ts` | Typical tokens times rounds plus per-search charge |
| hook | useManagedUsageSummary / spendableCreditsNow | `apps/web/lib/hooks/useManagedUsageSummary.ts` | Reads usage buckets to compute credits available |
| endpoint | POST chat completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Dispatches the research loop on streaming requests |
| service | request-processor gates | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema, plan refusal, capability gate, lockdown, unsupported-model fallback |
| service | runResearchLoop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Bounded plan, search, write loop and its limits |
| service | buildResearchRunOptions | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Wires report saving, sources, pause, steer, cancel into the loop |
| config | BILLING_PLAN_CAPABILITY_TIERS | `packages/contracts/types/src/billing-catalog.ts` | deep_research is allowed on pro and above |
| config | openapi | `apps/web/public/openapi.json` | Documents research, research_sources, research_resume |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile Deep research row |
| component | ChatInput research chip | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Shows Deep Research active chip |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Decides researchEnabled and builds the request on mobile |
| config | FEATURES | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile research flag |
| test | request-processor research tests | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.research.test.ts` | Research mode and capability tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Composer decides research is allowed (plan, model capability) and sends research true with stream true. | device | ChatComposerNew.tsx:1616-1628; useChatStream.ts:4600 |
| The server parses the body, refuses Free plans and free trials, checks the capability gate and the research-capable model, applies the research prompt and turns web search on. | our servers | request-processor.ts:5194,5220,5240-5246; 2500-2512 |
| Lockdown check: refuse with lockdown_blocks_research. | our servers | request-processor.ts:5313-5328 |
| The route starts a cloud agent run of kind research, scopes connectors, searches the person's files and starts the loop. | our servers | route.ts:567-633,706 |
| The loop makes tool-free planning, searches through the search backend, then a tool-free writing turn. | outside service | research-loop.ts:3033-3057,2630-2700 |
| Each search is admitted and billed through the search budget before running. | our servers | research-loop.ts:1807-1830 |
| The estimate on the plan card is computed in the browser from the catalog price and the usage summary. | device | credit-estimates.ts:76-91; ResearchCostEstimate.tsx:26-31 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cloud agent run record (kind research) and settled usage | our database via beginCloudAgentRun and the managed usage ledger | server side only; the client keeps a run reference in message metadata | unknown (retention for runs not read) |
| Composer toggle state (researchEnabled) | web composer toggles store; mobile chatViewStore features and researchByConversation | not synced (per device) [inferred] | cleared when model loses support (web) |

**Models and providers.** Any chat model whose catalog capabilities say research, or a tool-capable model with a 500,000-token context, or Auto. Web search uses the model's native search where its provider has one, otherwise the generic search backend (provider:perplexity charges) [request-processor.ts:2543-2580; research-loop.ts:1807-1830]. The estimate uses catalog prices, so a model with no published price gets 'no estimate' [credit-estimates.ts:36-44].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; the request needs a bearer token and a subscription tier [request-processor.ts:5194]. |
| Permissions | Account Lockdown blocks it; workspace and agent site rules narrow sources; capability kill switch canUseDeepResearch and canUseWebSearch [request-processor.ts:5220-5232,5313]. |
| Subscription | Paid plans only: pro, max, max_15x, team, team_premium, enterprise [billing-catalog.ts:341,355]. Free plan: 403 plan_upgrade_required; free trial: 403 free_trial_feature_unavailable. |
| Limits and metering | 6 model calls, 12 searches, 4 minutes of gathering, 3 parallel tool calls, 8 page fetches total, 3 per round [research-loop.ts:178-199]. Searches are charged per call at the rate card and refused if the charge cannot be held [research-loop.ts:1807-1830,2650]. Credits settle on the managed usage ledger [assistant-turn-research.ts:56]. |
| Feature flags | canUseDeepResearch and canUseWebSearch capability flags; env AGI_RESEARCH_* names; mobile FEATURES.research. |
| Model compatibility | Needs research capability, or tools plus 500,000 context. Mobile needs research and search capabilities. |
| Provider restrictions | Needs a native search tool or a configured generic search backend; otherwise the run ends in error 'No web search was available on this route' [research-loop.ts:2993-3000]. |
| Local mode | Mobile: toggle hidden unless app mode is cloud [AddToChatSheet.tsx:232]. Web and desktop: the request goes to the managed server, so research is a Cloud feature; whether the toggle is shown when a local model is selected is unknown. Own key: none found in the code (no own-key research path). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Free plan | Toggle disabled with upgrade title; server 403 plan_upgrade_required. | ChatComposerNew.tsx:1622,6097; request-processor.ts:1516 |
| Plan still loading | Toggle disabled with 'Checking your plan…'. | ChatComposerNew.tsx:6099 |
| Model cannot research | Toggle disabled; if sent anyway, normal answer with research_unsupported_model. | ChatComposerNew.tsx:1703; request-processor.ts:6412 |
| Non-streaming request | Loop not started; normal single reply. Exact reply unknown beyond the code gate. | route.ts:560; request-processor.ts:635 |
| Estimate unavailable | Text says no estimate and run is metered as it goes. | ResearchCostEstimate.tsx:35-37 |
| Balance below estimate | Warning says run may stop early; Start is not blocked. | ResearchCostEstimate.tsx:44-52 |
| No search tool on serving route | Error status and a message; failed row stored. | research-loop.ts:2985-3000 |
| Offline or reconnect | Not handled in the research card; the chat stream replays from a cursor on lost events [useChatStream.ts:3770-3778]. | useChatStream.ts:3770 |
| Accessibility | Toggle row has a disabled title; estimate has data-testid only; status bar has aria-label 'Deep research: label'. | ResearchActivity.tsx:493-497 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.research.test.ts`: Research prompt injection, web search forced on, capability gate rules, approved-plan schema
- `apps/web/features/chat/lib/research-capability-gate.test.ts`: Model research gate
- `apps/web/lib/hooks/useChatStream.research.test.tsx`: Request fields sent for research and resume, new idempotency key on retry
- `apps/web/__tests__/research-tier-claims.test.ts`: Marketing copy plan labels for Deep Research
- `apps/mobile/__tests__/AddToChat.test.tsx`: Add to chat sheet (mentions research; exact cases not read)
- `apps/mobile/__tests__/ChatInput.test.tsx`: Chat input (mentions research; exact cases not read)

**Test scenarios**

- **Free plan refused**
  1. Sign in on a Free account
  2. Send research true, stream true via API
  - Expected: 403 with code plan_upgrade_required and required_plans listed
- **Paid web run reaches the plan**
  1. Sign in on a paid plan
  2. Switch on Deep Research with a supporting model
  3. Send a question
  - Expected: Plan card 'Research plan' with the cost lines and the status 'Review the plan to start searching'
- **Lockdown**
  1. Turn Lockdown mode on
  2. Send a research question
  - Expected: 403 lockdown_blocks_research and the message to turn Lockdown off
- **Unsupported model**
  1. Pick a model without research
  2. Send research true by API
  - Expected: Normal answer and fallback reason research_unsupported_model
- **Mobile toggle**
  1. Open Add to chat in Cloud mode with a research and search model
  2. Turn on Deep research
  3. Send
  - Expected: Chip 'Deep Research active' and a plan card on the reply

**Where to look when it fails**

- Response header X-AGI-Research-Loop: active [route.ts:764-770].
- Log '[research-loop] no web search available on the serving route'.
- Error codes plan_upgrade_required, free_trial_feature_unavailable, lockdown_blocks_research.
- Table research_reports; cloud agent run row of kind research.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Estimate not shown before sending and not on mobile** Affects: Web composer users, all mobile users. Evidence: ResearchPlan.tsx:321; no estimate code in apps/mobile research folder. Work needed: Add the estimate and available credits to the mobile plan card and optionally the composer
- **Estimate uses the picked model, not the serving model** Affects: Auto and routed turns. Evidence: ResearchActivity.tsx:277-281. Work needed: Use the resolved serving model or say it is approximate
- **Mobile gate stricter than web gate** Affects: Mobile users with large-context tool models. Evidence: AddToChatSheet.tsx:230-235 vs research-capability-gate.ts:5. Work needed: Share one gate
- **CLI, VS Code and Chrome cannot start research** Affects: Those apps. Evidence: no research flag in apps/cli/src, extension sources. Work needed: Product decision and client work
- **Mobile shows no upgrade hint for Free users (toggle just hidden)** Affects: Mobile Free users. Evidence: AddToChatSheet.tsx:230-236. Work needed: Show a disabled row with an upgrade hint
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

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
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- provider:perplexity
- file:apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts

## Unknown

- Whether the web composer shows the toggle when a local model is selected.
- What a non-streaming research request returns beyond the missing loop.
- Whether the estimate for Auto selections returns no estimate (depends on whether the Auto id is in the catalog; not checked).
- Retention of the cloud agent run row.
- Whether migrations 0191 and 0224 are applied (their headers say NOT YET APPLIED; apps/web/db/neon/0191_research_report_settled_cost.sql:3).
