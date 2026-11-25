---
id: "F079-09"
type: "feature"
title: "Compare models side by side"
aliases: ["Compare answers", "Compare models", "Compare Models", "/models/compare", "/compare", "Compare (spec table)", "S79.24"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S79.24"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-api-and-contracts", "surface:web", "surface:mobile", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-09 Compare models side by side

Send one prompt to two or three models and read the answers side by side. Web has a Compare answers page; Mobile has a Compare Models screen for two models in Cloud mode. Tools and memory are switched off for these requests. A model that fails does not stop the others.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.24](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7924).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Streams the same prompt to several chosen models in parallel (within the plan's concurrency) and shows each answer with its state, time to first text and total time.

**Why it exists.** People choose between models by reading real answers; this matches a feature leaders ship [inferred from the brief's parity framing; doc: AGENTS.md section 10].

**Who uses it.** Web (and Desktop through the hosted app) and Mobile Cloud users.

**Problems it solves**

- Picking a model by name alone.
- Copying a prompt between chats to compare.
- One failing model ruining the comparison.

**Use cases**

- Open /models/compare and compare three models on a draft email.
- Select models in the catalogue and click 'Compare answers'.
- On Mobile type /compare and compare two models on a question.
- A free plan runs one answer at a time; the second starts when the first ends.

## 2. User experience

**Where to find it**

- Web: page /models/compare titled 'Compare answers' (apps/web/app/models/compare/page.tsx:7-11); or in the model catalogue the button 'Compare answers' (apps/web/features/models/components/ModelCatalogueBrowser.tsx:317-330). The neighbouring 'Compare' button opens a specification table, not answers (ModelCatalogueBrowser.tsx:296-310).
- Desktop: the public Desktop shows the hosted web app (doc: AGENTS.md section 5), so the same page [inferred]; no desktop-specific compare code was found in apps/desktop/src.
- Mobile: slash command 'compare' described 'Compare model responses' (apps/mobile/src/features/chat/components/CommandPalette.tsx:34-39), visible only in Cloud mode (apps/mobile/app/(app)/(tabs)/chat.tsx:1173; apps/mobile/app/(app)/chat/[id].tsx:1787); screen title 'Compare Models' (apps/mobile/src/features/compare/index.tsx:417).

**Before you start**

- Web: at least two answerable models in the catalogue (CompareAnswersPage.tsx:244).
- Mobile: Cloud mode, signed in, and a plan with at least two models (index.tsx:198-247, :431-440).

**Screens and controls**

- Web: one selector per slot labelled 'Model 1', 'Model 2', 'Model 3'; remove buttons 'Remove <model> from the comparison'; prompt box with placeholder 'Ask every model the same thing'; send and stop; 'Try again' on a catalogue load error (CompareAnswersPage.tsx:236,264,287,315).
- Web answer cards show states Queued, streaming spinner '<model> is answering', Stopped, Finished in <seconds>.
- Mobile: two model pickers (slots A and B), prompt input, stop, a 'winner' verdict and a report action 'Report this answer' (index.tsx:44-52,729).

**Journey**

1. Web: open the page or click 'Compare answers' in the catalogue with 2 to 3 models chosen.
2. Adjust slots, type a prompt, send (Enter sends, Shift+Enter adds a line).
3. Answers stream in cards; queued ones wait if the plan limits concurrent answers.
4. Read, stop if needed, or send another prompt.
5. Mobile: type /compare in a Cloud chat, choose models A and B, type a prompt, send.

**What the person sees and gets**

- Per answer phase: queued, streaming, done, stopped, failed (use-compare-answers.ts:8).
- Failed answer text 'This model could not answer. Try again.' unless a more specific user message exists (use-compare-answers.ts, ANSWER_FAILED_MESSAGE).
- Web note about plan concurrency: 'Your plan runs <n> answer(s) at a time, so the rest start as each one finishes.' (CompareAnswersPage.tsx:100-105).
- Mobile Local-mode text: 'Model comparison runs on AGI Cloud, so it is unavailable while chat is in Local Mode. Nothing was sent from this device. Switch to AGI Cloud to compare two models.' (index.tsx:82-84).
- Mobile attachment text: 'Compare sends prompt text only...' (index.tsx:79-80).

**Settings**

- Plan concurrency limit from getPlanMaxConcurrentTurns (CompareAnswersPage.tsx:143; mobile index.tsx:98-100).
- Web model list reflects favourites and recents (CompareAnswersPage.tsx:152-160).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web page with 2 to 3 slots (compare-answers.ts:6-7) and parallel streaming with a worker pool sized by plan limit (use-compare-answers.ts:80-140; CompareAnswersPage.tsx:143).
- Each request sends one user message with stream true, tool_choice none, memory_enabled false, connector_tools_enabled false (compare-answer-stream.ts:143-153).
- Errors per answer are isolated; others continue (use-compare-answers.ts catch block).
- Stop aborts active answers and marks them stopped (use-compare-answers.ts:70-84).
- The compare request resolves the answered model from the X-AGI-Resolved-Model header (compare-answer-stream.ts:158-159).
- Mobile compare runs two streams, supports queued second answer on one-at-a-time plans, aborts when switching to Local, ignores answers after account change (index.tsx:198-330; test names in apps/mobile/__tests__/CompareLocalModeGate.test.tsx, CompareAccountIsolation.test.tsx).

**Incomplete**

- Mobile has only two slots (A and B); Web allows three.
- The Web 'Compare' (specification table) and 'Compare answers' buttons sit side by side; the first does not send a prompt (ModelCatalogueBrowser.tsx:296-310).

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI, VS Code and Chrome: no compare code found (brief status missing).
- Desktop-specific compare: none found; relies on the hosted web page [inferred].
- Local models in Compare: Web slots come from the managed catalogue and requests go to Cloud endpoints (compare-answer-stream.ts:140); Mobile blocks Local entirely (index.tsx:82-84).

## 4. Required behaviour

**Established requirements**

- One prompt can be sent to several models and the answers compared. (source: S79.24 brief 'Should')
- Web needs 2 to 3 models; each answer shows queued, streaming, done, stopped or failed. (source: S79.24 brief; compare-answers.ts:6-7; use-compare-answers.ts:8)
- A failed model shows 'This model could not answer. Try again.' without stopping the others. (source: S79.24 brief)
- Compare requests turn off tools and memory. (source: S79.24 brief; compare-answer-stream.ts:143-153)
- Nothing silently routes a Local chat to Cloud; the Mobile screen states the boundary and stops. (source: doc: AGENTS.md section 6; index.tsx:82-84)

**Acceptance criteria**

1. Send is disabled with the reason 'Choose at least two models to compare.' when fewer than two slots are filled.
2. With three slots and a plan limit of one, only one answer streams at a time and the others show queued.
3. Killing the network for one model's request marks only that card failed with the standard message.
4. The request body contains tool_choice none and memory_enabled false.
5. Stop turns active cards to Stopped and leaves finished cards as they were.
6. On Mobile in Local mode, pressing send shows the Local notice and no network request is made.
7. On Mobile, an attachment is refused with the 'prompt text only' message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Compare usage is billed to the plan like a normal Cloud turn because it uses the normal chat endpoint [inferred from chatCompletionEndpoint].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add compare to the CLI and VS Code only if parity demands it.
- [proposed] Rename one of the two catalogue buttons to avoid confusion.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Compare answers route | `apps/web/app/models/compare/page.tsx` | Server page wrapping CompareAnswersPage with requested model ids. |
| component | CompareAnswersPage | `apps/web/features/models/components/CompareAnswersPage.tsx` | Slots, prompt box, answer cards, plan concurrency. |
| hook | useCompareAnswers | `apps/web/features/models/lib/use-compare-answers.ts` | Per-answer state machine, worker pool, stop. |
| service | streamCompareAnswer | `apps/web/features/models/lib/compare-answer-stream.ts` | Builds the request and reads the event stream. |
| service | compare-answers helpers | `apps/web/features/models/lib/compare-answers.ts` | Limits, href, initial slot choice. |
| component | ModelCatalogueBrowser | `apps/web/features/models/components/ModelCatalogueBrowser.tsx` | Select models and open compare (33-35,109-110,317). |
| service | model-presentation isSelectable | `apps/web/features/models/lib/model-presentation.ts` | Which catalogue entries can answer (63-70). |
| service | chatCompletionEndpoint | `apps/web/features/chat/lib/free-quota-selection.ts` | Chooses the endpoint per model (40-46). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Serves the compare requests as ordinary Cloud turns. |
| endpoint | POST /api/models/free-quota/completions | `apps/web/features/chat/lib/free-quota-selection.ts` | Endpoint for free-offering models (named in chatCompletionEndpoint; route file not opened). |
| service | plan concurrency | `packages/contracts/types/src` | getPlanMaxConcurrentTurns used by Web and Mobile (definition file not opened). |
| screen | Mobile CompareScreen | `apps/mobile/src/features/compare/index.tsx` | Two streams, Local gate, queue, verdict, report. |
| other | Mobile route | `apps/mobile/app/(app)/compare.tsx` | Exports the screen; hidden drawer entry in _layout.tsx:131. |
| command | /compare palette command | `apps/mobile/src/features/chat/components/CommandPalette.tsx` | Entry, boundary cloud. |
| component | Mobile ChatInput command | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Shows /compare when onOpenCompare is set (1564,1577). |
| service | Mobile post-auth intent | `apps/mobile/src/features/auth/services/postAuthIntent.ts` | cloud-compare intent (9). |
| service | Mobile streamChat | `apps/mobile/services/streaming.ts` | Transport used by compare. |
| test | Web stream test | `apps/web/features/models/lib/compare-answer-stream.test.ts` | Frame reading and errors. |
| test | Mobile compare tests | `apps/mobile/__tests__/CompareLocalModeGate.test.tsx` | Local gate; siblings CompareAccountIsolation, CompareAnswerReport, CompareSpeedVerdict. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends the prompt; the hook creates one controller per model and queues all answers. | device | use-compare-answers.ts:80-100 |
| For each model the client posts the prompt to the chat endpoint chosen for that model with auth and CSRF headers and an idempotency key. | device and our servers | compare-answer-stream.ts:131-153; free-quota-selection.ts:40-46 |
| The server runs a normal Cloud turn: plan check, routing, provider call, billing. | our servers | chat completions route (SYS-chat-turn-pipeline); request has stream true, tool_choice none |
| The provider generates the text. | outside service | managed-failover.ts:1-58 (provider streams) |
| Client reads frames, coalesces text per animation frame and updates the card; records time to first text and total time. | device | use-compare-answers.ts:100-135 |
| Mobile does the same with streamChat for slots A and B, sequentially when the plan allows one answer at a time. | device and our servers | apps/mobile/src/features/compare/index.tsx:255-330 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Compare prompt and answers | Component state in memory only | No | Lost when the page or screen is left [inferred: no persistence code found in the files opened] |
| Server-side turn records (usage, routing trace) | Normal Cloud tables incl. routing_decision_traces | Server only | As for any Cloud turn (see F079-08) |

**Models and providers.** Models come from the web catalogue endpoint (useModelCatalogue) and, on Mobile, from getCloudModelsForTier (index.tsx:111-118). Default pair on Mobile uses provider default models from the types package (index.tsx:108-109). Providers are resolved by the server.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: the chat endpoint needs an auth token (compare-answer-stream.ts:133-134); a signed-out experience for the page itself: unknown. Mobile: sign-in required ('Sign in to use AGI Cloud model comparison.', index.tsx:240-247). |
| Permissions | Only models the plan includes can be chosen (COMPARE_ANSWERS_BLOCKED_REASON 'Pick two models your plan includes to compare answers.', ModelCatalogueBrowser.tsx:35). |
| Subscription | Models are filtered by plan tier; concurrency by plan (getPlanMaxConcurrentTurns). Each answer is a normal metered Cloud turn [inferred]. |
| Limits and metering | 2 to 3 slots on Web, 2 on Mobile; concurrency per plan. Usage accounting for compare turns: not separately handled in the compare code found. |
| Feature flags | none found in the code |
| Model compatibility | Only entries admitted, available and live can be chosen (model-presentation.ts:63-70). Tools and memory are always off. |
| Provider restrictions | Same server rules as any Cloud turn (data policy, region). |
| Local mode | Mobile Local mode: the screen shows the boundary notice and stops; aborts active compare if switched to Local (test title CompareLocalModeGate). Desktop Local and Web Local models: no compare path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Fewer than two answerable models | Page shows an empty explanation instead of slots. | CompareAnswersPage.tsx:244 |
| Catalogue load error | 'Try again' control. | CompareAnswersPage.tsx:236 |
| Queued | Card queued until a worker is free. | use-compare-answers.ts:14,80-100 |
| Stopped | 'Stopped before this model answered.' or 'Stopped' badge. | CompareAnswersPage.tsx:411,432 |
| Failed | Standard message; other cards continue. | use-compare-answers.ts catch block |
| Stream skipped frames | Fails only if no text arrived; otherwise answer kept. | compare-answer-stream.ts settle function; test titles in compare-answer-stream.test.ts:65-101 |
| Mobile account switch or Local switch mid-run | Results ignored or aborted. | index.tsx:150-175,262-270 |
| Offline | Surfaces as a failed card via the error path; no dedicated offline state found. | use-compare-answers.ts catch block |
| Accessibility | Labelled selectors, remove buttons and spinner labels on Web; Mobile uses accessibilityLabel on back; fuller audit not done. | CompareAnswersPage.tsx:264,287,409; index.tsx:405-411 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/models/lib/compare-answer-stream.test.ts`: Normal answer, invalid JSON frame skipped, non-object frame skipped, unreadable message when no text, error frame after text.
- `apps/web/features/models/__tests__/ModelCompareTable.test.tsx`: The specification table component, not the answers page.
- `apps/web/features/models/__tests__/ModelCatalogueBrowser.filters.test.tsx`: Catalogue filters; references compare-answers helpers.
- `apps/mobile/__tests__/CompareLocalModeGate.test.tsx`: Boundary notice, Switch to AGI Cloud action, sign-in redirect, refused forced send, abort on Local switch.
- `apps/mobile/__tests__/CompareAccountIsolation.test.tsx`: Account isolation (name; contents not opened).
- `apps/mobile/__tests__/CompareAnswerReport.test.tsx`: Report flow (name).
- `apps/mobile/__tests__/CompareSpeedVerdict.test.tsx`: Speed verdict (name).

**Test scenarios**

- **Three-way compare**
  1. Open /models/compare with three model ids in the query.
  2. Send a prompt.
  - Expected: Three cards stream; each ends Finished in <seconds>.
- **One failure**
  1. Block one model's request in dev tools.
  2. Send.
  - Expected: That card shows 'This model could not answer. Try again.'; others finish.
- **One at a time plan**
  1. Use an account whose plan concurrency is 1.
  2. Send.
  - Expected: One card streams, others queued, concurrency note visible.
- **No tools or memory**
  1. Send and inspect the request body.
  - Expected: tool_choice none, memory_enabled false, connector_tools_enabled false.
- **Mobile Local**
  1. In Local mode open /compare route and try to send.
  - Expected: Local notice, no network call.
- **Stop**
  1. Send and press stop during streaming.
  - Expected: Active cards show Stopped.

**Where to look when it fails**

- Idempotency key purpose 'compare' (compare-answer-stream.ts:122-127).
- Server turn logs by request id; routing_decision_traces rows for each compare answer.
- Console warnings for skipped frames (compare-answer-stream.test.ts titles imply logging).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **Compare absent on CLI, VS Code and Chrome.** Affects: CLI, VS Code, Chrome. Evidence: No compare code found; brief status missing. Work needed: Decide if parity needs it.
- **Mobile limited to two models, Web up to three.** Affects: Mobile. Evidence: index.tsx modelA/modelB; compare-answers.ts:7. Work needed: Align or document.
- **No dedicated Desktop (native) compare; depends on hosted web.** Affects: Desktop. Evidence: No compare code in apps/desktop/src; doc: AGENTS.md section 5. Work needed: Verify the Electron window opens /models/compare.
- **No test found for the Web answers page or hook.** Affects: Web. Evidence: No test file for CompareAnswersPage or use-compare-answers. Work needed: Add component and hook tests.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-api-and-contracts
- surface:web
- surface:mobile
- api:POST /api/llm/v1/chat/completions

## Unknown

- Whether the Web page works signed out.
- Whether the Electron Desktop window exposes /models/compare as a menu entry.
- How compare turns are metered against plan quotas (no compare-specific code found).
- Whether Local models can appear in the Web compare slots (catalogue endpoint contents not opened).
- Definition file of getPlanMaxConcurrentTurns.
