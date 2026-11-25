---
id: "F062-02"
type: "feature"
title: "Per-agent status, model and result"
aliases: ["Model labels", "Per-agent status", "Per-agent result", "Per-agent usage", "Compare Models", "Compare answers", "/compare", "/tasks show", "Cost and usage"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.04", "S62.05", "S62.07", "S62.08"]
depends_on: ["surface:mobile", "surface:web", "surface:cli", "mode:cloud", "mode:local", "plan:free", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "api:POST /api/llm/v1/chat/completions", "F062-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-02 Per-agent status, model and result

Shows, for each participating agent or model, its model name, status, result and (where built) usage. Mobile has Compare Models (two answers, timings). Web has Compare answers (two or three models, timings, no cost). The CLI /tasks show prints model, tokens and cost. Web and mobile Cloud runs also show model and cost.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.04](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6204), [S62.05](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6205), [S62.07](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6207), [S62.08](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6208).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a per-participant view: which model, is it still working, what did it answer, and what did it cost. Mobile Compare Models sends one prompt to two Cloud models side by side. Web Compare answers does the same for two or three models. The CLI /tasks show prints a child's model, input and output tokens, and credits. Cloud task cards on web and mobile show model and cost for each run.

**Why it exists.** People choosing between models, or checking what a delegated agent did and spent, need the answer and the cost per participant, not one blended result. AGI is model agnostic, so showing the model is part of being honest about what ran (doc: docs/product/experience-contract.md rule 5).

**Who uses it.** People who want to compare models (mobile and web), developers watching child agents and their cost (CLI), and anyone reviewing Cloud work runs (web, desktop, mobile).

**Problems it solves**

- Which model gave which answer is labelled.
- A slow or failed model is visible next to a working one.
- Child agent spend is visible in credits, or 'on your subscription' (apps/cli/src/subagent.rs:119-146).

**Use cases**

- On mobile, type /compare in the chat input, send a prompt, and read both answers.
- On web, pick models in the Models page and press 'Compare answers'.
- In the CLI, run /tasks show subagent_<n> after a child finishes to see its cost.
- On web Work history, open a run and read 'Cost and usage'.

## 2. User experience

**Where to find it**

- Mobile: chat input command palette entry 'compare' with description 'Compare model responses' (apps/mobile/src/features/chat/components/CommandPalette.tsx:33-38); opens screen titled 'Compare Models' (apps/mobile/src/features/compare/index.tsx:417). Shown only in Cloud conversation mode (apps/mobile/app/(app)/chat/[id].tsx:1785-1788).
- Web: route /models/compare, heading 'Compare answers'; reached from the Models page by selecting models and pressing 'Compare answers' (apps/web/app/models/compare/page.tsx; apps/web/features/models/components/ModelCatalogueBrowser.tsx:311-322).
- Desktop: Electron shows the hosted web app (AGENTS.md section 5), so /models/compare is [inferred] reachable; not verified. Tauri DesktopTasks shows Cloud runs only.
- CLI: /tasks show <id> (apps/cli/src/repl/registry.rs:549-562).
- Web, desktop and mobile Cloud runs: 'Cost and usage' section in the task detail panel (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:338-381) and Model, Cost and Usage rows in the mobile sheet (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:360-390).
- VS Code and Chrome: no per-agent model or usage view found.

**Before you start**

- Mobile compare: signed in, Cloud mode, a plan with at least two Cloud models ('Your current plan has fewer than two models available for comparison.') (compare/index.tsx:441).
- Web compare: signed-in web app and at least two selectable models on the plan ('Comparing needs two models your plan includes') (CompareAnswersPage.tsx).
- CLI: a child has finished and has a result.

**Screens and controls**

- Mobile: two model pills A and B (tap to pick a model), 'vs', answer panels with model name, optional 'Faster' badge, Report flag, stats chips (time to first token, approx tokens, total time), composer with Stop (compare/index.tsx:539-724).
- Web: model selects 'Model 1..3', 'Add a model', remove buttons, prompt box 'Ask every model the same thing', send or stop button, answer panels with Copy and 'Chat with <model>' buttons (CompareAnswersPage.tsx).
- CLI: /tasks show <id>.

**Journey**

1. Mobile: 1. Type /compare in the Cloud chat input. 2. Pick models in pills A and B if wanted. 3. Type a prompt and send. 4. Both answers stream; each panel shows 'Generating...'. 5. When both finish the faster panel gets a 'Faster' badge.
2. Web: 1. Open Models. 2. Select two or three models, press 'Compare answers'. 3. Type a prompt, send. 4. Read answers side by side with timing 'First words in X s · Finished in Y s'.
3. CLI: 1. Let the model spawn a child. 2. Wait until it completes. 3. Type /tasks show <id>.

**What the person sees and gets**

- Mobile: 'Generating...' while streaming; 'No response yet.' when empty; 'Stopped before this answer finished.' after Stop; red error box on failure; a queued note 'Your plan runs one answer at a time, so the second waits for the first.' (compare/index.tsx:92-94, :655-680).
- Mobile statistics are estimates: approx tokens = text length / 4 (compare/index.tsx:296).
- Web: spinner with 'X is answering', 'Waiting for the first words…', 'Stopped' label, 'Answered by <model>' when the server resolved a different model, notes for length limit and safety stop (CompareAnswersPage.tsx).
- Web footnote: 'Each answer counts as a message on your plan. Not saved to chats; memory stays off.' (CompareAnswersPage.tsx).
- CLI detail: 'Model <name> · N in / M out tokens · <credits> credits' or 'on your subscription' (subagent.rs:127-146).
- Cloud run: cost in credits on each list card and in the detail panel; free-trial runs say 'metered against your free trial allowance' (TaskDetailPanel.tsx:350-354).

**Settings**

- Mobile and web: model choice per slot is the only setting; mobile compare disables the picker's fast-speed setting (apps/mobile/__tests__/CompareAccountIsolation.test.tsx:108).
- Compare requests turn off memory and connector tools, and thinking (compare/index.tsx:279-283; compare-answer-stream.ts:154-160).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile compare streams two Cloud models in parallel (or one after the other on a plan limited to one turn) and shows per-panel status, text, timings and errors (compare/index.tsx:200-330).
- Mobile 'Faster' badge only when both answers are done, neither failed nor stopped, durations differ; equal durations show 'tie' on the pill (compare/index.tsx:729-738; ModelPill at :539-600).
- Web compare streams two or three models with a worker pool limited by the plan's concurrent turn limit (apps/web/features/models/lib/use-compare-answers.ts:96-150; CompareAnswersPage.tsx).
- CLI /tasks show prints model, tokens, credits and result only after the child has a result (subagent.rs:119-180).
- Web and desktop Cloud run cards show model label and cost (TasksPage.tsx:735-760) and the detail panel shows 'Cost and usage' (TaskDetailPanel.tsx:338).

**Incomplete**

- Mobile and web comparison show timing only, no cost or usage, and no cost estimate before sending (no code found).
- CLI usage appears only for finished children; a failed or cancelled child shows 'It left no output.' even though spend is tracked (subagent.rs:170-173; get_spent at :873).
- Mobile 'approx tokens' is an estimate from text length, not billed usage (compare/index.tsx:296).

**Present but disconnected or switched off**

- Mobile /compare is hidden unless the conversation is in Cloud mode (apps/mobile/app/(app)/chat/[id].tsx:1786-1788).

**Not available**

- Web: the brief (S62.04-S62.08) lists comparison as missing, but /models/compare exists and is tested at route level (apps/web/e2e/signed-in-page-routes.spec.ts:8).
- Desktop Tauri, VS Code, Chrome: no per-agent model/result/usage view found.
- Local-model comparison: mobile refuses in Local mode (compare/index.tsx:81-84); web compare has no Local route [inferred from the cloud completion endpoint].

## 4. Required behaviour

**Established requirements**

- Each participating agent or model is labelled with the model it runs on. (source: brief S62.04)
- The view shows the live status of each participant. (source: brief S62.05)
- Each participant's result is shown separately. (source: brief S62.07)
- The user sees usage or cost per participating agent or model. (source: brief S62.08)
- Mobile: Generating while streaming, No response yet when empty, a stopped note after Stop, an error box on failure. (source: brief draft for F062-02 and compare/index.tsx:655-690)
- Faster appears only when both answers are done, neither failed nor stopped, and durations differ. (source: apps/mobile/src/features/compare/index.tsx:729-738)
- Trust is visible: Local, own key and Cloud labels show when they affect behaviour. (source: docs/product/experience-contract.md rule 5)

**Acceptance criteria**

1. Mobile compare in Local mode shows the Cloud-only notice and sends nothing.
2. Mobile: both panels show the model's display name; during streaming each shows 'Generating...'.
3. Mobile: pressing Stop turns unfinished panels to 'Stopped before this answer finished.' and no Faster badge appears.
4. Mobile: when one answer fails, no Faster badge appears.
5. Web: choosing fewer than two models disables send with 'Choose at least two models to compare.'
6. CLI: /tasks show on a finished child prints model, in/out tokens and credits; on a running child prints 'Still running...'.
7. Web Work history: a settled run shows its cost in credits.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Cost per compared answer should be shown or estimated, because the footnote says each answer counts on the plan.
- [inferred] Because AGI is provider agnostic, the model label should name the provider route too; mobile pills do show the provider name (compare/index.tsx:577-585).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show billed usage per answer on web and mobile compare once the server returns it.
- [proposed] Show cost for failed or cancelled CLI children in /tasks show.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | CompareScreen | `apps/mobile/src/features/compare/index.tsx` | Mobile Compare Models screen, streaming, state, Faster logic. |
| screen | compare route | `apps/mobile/app/(app)/compare.tsx` | Expo route re-exporting the screen. |
| component | CommandPalette entry compare | `apps/mobile/src/features/chat/components/CommandPalette.tsx` | Lists /compare with cloud boundary (33-38). |
| component | ChatInput onOpenCompare | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Adds /compare when a handler exists (1564, 1577). |
| service | streamChat | `apps/mobile/services/streaming.ts` | Sends each model's request to the managed completion endpoint. |
| service | getCloudModelsForTier | `apps/mobile/lib/models.ts` | Models allowed for the plan (117). |
| config | getPlanMaxConcurrentTurns | `packages/contracts/types/src/billing-catalog.ts` | Plan limit that queues the second answer (792). |
| screen | CompareAnswersPage | `apps/web/features/models/components/CompareAnswersPage.tsx` | Web compare UI and answer panels. |
| hook | useCompareAnswers | `apps/web/features/models/lib/use-compare-answers.ts` | Runs answers with a worker pool, phases queued/streaming/done/stopped/failed. |
| service | streamCompareAnswer | `apps/web/features/models/lib/compare-answer-stream.ts` | Reads the SSE stream for one model. |
| service | compare-answers helpers | `apps/web/features/models/lib/compare-answers.ts` | Limits 2 to 3, default model choice, link builder. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions` | Managed completion endpoint used by compare (compare-answer-stream.ts:151; chatCompletionEndpoint may choose a free-quota endpoint). |
| command | /tasks show | `apps/cli/src/repl/registry.rs` | Prints task detail (549-562). |
| service | format_task_detail, SubagentUsage | `apps/cli/src/subagent.rs` | Model, tokens, credits text (119-250). |
| component | TaskCostSection and run card cost | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Cost and usage for Cloud runs (338-381). |
| component | CloudRunDetailSheet metadata rows | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Model, Cost, Usage rows (360-390). |
| test | mobile compare tests | `apps/mobile/__tests__/CompareSpeedVerdict.test.tsx` | Faster verdict rules. |
| test | web compare stream test | `apps/web/features/models/lib/compare-answer-stream.test.ts` | Frame parsing and failure rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile checks Cloud mode, sign-in, no attachments, two distinct plan models, then starts one stream per model. | device | apps/mobile/src/features/compare/index.tsx:200-262 |
| Each request goes to the managed chat endpoint with memory, connectors and thinking off. | our servers | compare/index.tsx:276-284; apps/web/features/models/lib/compare-answer-stream.ts:151-163 |
| Our service routes each request to the chosen provider and streams text back. | outside service | AGENTS.md section 7; endpoint above (provider list not traced for this feature) |
| The client appends deltas, measures time to first token and total time, and shows the badge when rules allow. | device | compare/index.tsx:286-330; use-compare-answers.ts:122-141 |
| CLI: child finishes, usage from the turn is stored, /tasks show formats it. | device | subagent.rs:183-250, :782-796 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Compared answers and timings | Component state in memory only | No; web footnote says not saved to chats | Lost on leaving or resetting the screen (compare/index.tsx:137-149). |
| Billed usage of each compare request | our servers usage ledger (SYS-subscriptions-entitlements-and-usage) | Server side | unknown |
| CLI child usage and cost | In memory and the session cost ledger | No sync found | Session lifetime (agent/chat.rs:3129-3136). |

**Models and providers.** Mobile pickers offer Cloud models allowed for the plan; defaults come from provider default models via the shared registry (compare/index.tsx:99-100, :109-119). Web groups models by developer from the model catalogue API (CompareAnswersPage.tsx). CLI child model is the parent's or a named agent's (subagent.rs:1130). No model identifiers are hardcoded in this page.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile: signed-in Cloud account required ('Sign in to use AGI Cloud model comparison.', compare/index.tsx:243). Web: signed-in app. CLI: none for Local. |
| Permissions | Mobile compare refuses attachments (compare/index.tsx:78-79). No other permission rule found. |
| Subscription | Plan decides which Cloud models can be compared and how many answers run at once (compare/index.tsx:95-97, :117; billing-catalog.ts:792). Web: 'Each answer counts as a message on your plan.' |
| Limits and metering | Mobile: exactly two models. Web: two to three models (compare-answers.ts:6-7). A plan limited to one concurrent turn runs answers one at a time. Usage is metered on our servers per request. |
| Feature flags | none found for compare. Mobile Cloud runs depend on FEATURES.cloudTasks (apps/mobile/lib/v1FeatureFlags.ts:10). |
| Model compatibility | Any Cloud model the plan lists; Local models are not offered. |
| Provider restrictions | Web may route a model through a free-quota endpoint when the model is a free offering (apps/web/features/chat/lib/free-quota-selection.ts:40-45). |
| Local mode | Mobile: not available; shows 'Model comparison runs on AGI Cloud, so it is unavailable while chat is in Local Mode. Nothing was sent from this device.' (compare/index.tsx:81-84). CLI Local children work and show model; cost is likely zero [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading / waiting | Mobile 'Generating...'; queued second answer shows the one-at-a-time note; web 'Waiting for the first words…' and queued note. | compare/index.tsx:655, :92; CompareAnswersPage.tsx |
| Empty | Mobile 'No response yet.'; web 'This model returned an empty answer.' | compare/index.tsx:668; CompareAnswersPage.tsx |
| Error | Mobile shows the error text in a red box; web shows an alert notice per panel; other panel keeps going. | compare/index.tsx:659-664; use-compare-answers.ts:143-150 |
| Cancel | Stop aborts both and marks unfinished ones stopped; changing a model resets the comparison. | compare/index.tsx:171-177, :140-149; use-compare-answers.ts:77-90 |
| Retry | No per-panel retry; the person sends the prompt again. Rerunning one participant is missing (brief S62.27). | brief S62.27 |
| Offline | not handled in the code on the compare screen beyond the stream error text. | compare/index.tsx:305-320 |
| Account switch | Results are cleared and old callbacks ignored when the Cloud account changes. | apps/mobile/__tests__/CompareAccountIsolation.test.tsx:124 |
| Plan drops below two models | Comparison aborts and is no longer offered. | CompareAccountIsolation.test.tsx:228, :253 |
| Accessibility | Mobile pills and report buttons have labels; stat chips are labelled 'Time to first token', 'Approx tokens', 'Total time'. Web answers are article elements with busy state and named buttons. | compare/index.tsx:565, :700-715; CompareAnswersPage.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CompareLocalModeGate.test.tsx`: Local mode shows the boundary notice, no stream starts, switch to Cloud action.
- `apps/mobile/__tests__/CompareSpeedVerdict.test.tsx`: Faster verdict, tie, no verdict when stopped or failed, queued note on one-turn plans.
- `apps/mobile/__tests__/CompareAccountIsolation.test.tsx`: Account isolation, model reset, plan eligibility, default models.
- `apps/mobile/__tests__/CompareAnswerReport.test.tsx`: Report control on finished answers.
- `apps/web/features/models/lib/compare-answer-stream.test.ts`: Frame parsing, skipped frames, error after text.
- `apps/web/e2e/signed-in-page-routes.spec.ts`: /models/compare renders heading 'Compare answers' (line 8).
- `apps/cli/src/subagent.rs`: Inline tests for task detail inputs such as usage kept after failure (1702, 2026).

**Test scenarios**

- **Mobile happy path**
  1. Sign in, Cloud mode, plan with two models.
  2. Type /compare, send a prompt.
  - Expected: Two panels with model names, both stream, Faster badge on the quicker one, stats chips present.
- **Mobile Stop**
  1. Send a long prompt.
  2. Press Stop mid-stream.
  - Expected: Unfinished panels show the stopped note; no Faster badge.
- **Mobile Local mode**
  1. Switch chat to Local mode.
  2. Open Compare Models.
  - Expected: Boundary notice and no composer; nothing sent.
- **Web three models**
  1. Open /models, select three models, press Compare answers.
  2. Send a prompt.
  - Expected: Three panels; on a one-turn plan they run one after another with the plan note.
- **CLI child cost**
  1. Run a task that spawns a child.
  2. Type /tasks show subagent_<n> after it completes.
  - Expected: Model, in/out tokens and credits or 'on your subscription'.
- **Cloud run cost**
  1. Open Work history on web, select a completed run.
  - Expected: 'Cost and usage' shows credits and token counts.

**Where to look when it fails**

- Web logger warning '[ModelCompare] skipped a frame ...' (compare-answer-stream.ts).
- Web error classes CompareAnswerError.
- Mobile EgressBlockedError surfaces as the Local-mode notice (compare/index.tsx:101).
- Server usage ledger for per-request metering (location not read).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md)
- Desktop: [70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md)
- Mobile: [70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md)
- CLI: [70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **No cost or usage per answer in mobile or web compare, and no pre-run estimate (S62.25).** Affects: Mobile, web. Evidence: No cost fields in CompareStreamState or CompareAnswer. Work needed: Return usage with the stream and display it.
- **The brief says web has no comparison, but /models/compare exists.** Affects: Docs, test plans. Evidence: apps/web/app/models/compare/page.tsx. Work needed: Update brief rows S62.04-S62.08, S62.19, S62.20, S62.26 for web.
- **CLI hides usage for failed or cancelled children.** Affects: CLI. Evidence: format_task_detail None branch (subagent.rs:170-173) while get_spent exists (:873). Work needed: Show get_spent in the detail.
- **No comparison on desktop Tauri, VS Code or Chrome.** Affects: Those apps. Evidence: No code found. Work needed: Decide scope; Electron may inherit web.
- **No Local-model comparison on mobile.** Affects: Mobile Local mode users. Evidence: compare/index.tsx:81-84. Work needed: Product decision; Local inference is free of subscription so a local compare could be offered.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- surface:web
- surface:cli
- mode:cloud
- mode:local
- plan:free
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- api:POST /api/llm/v1/chat/completions
- F062-01

## Unknown

- Which provider folders serve each compared model; routing for this feature was not traced.
- Whether the Electron desktop exposes /models/compare.
- How usage from compare requests is recorded against the plan's message count.
- Whether CLI Local children report zero cost.
- Whether a free-quota endpoint changes metering for web compare.
