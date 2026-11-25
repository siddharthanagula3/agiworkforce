---
id: "F062-09"
type: "feature"
title: "Side-by-side model comparison"
aliases: ["Compare answers", "Compare Models", "/models/compare", "/compare", "Model-comparison view", "Side-by-side model comparison", "S62.19", "S62.20", "S62.26"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["web", "mobile"]
implementation: {web: "built", desktop: "missing", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.19", "S62.20", "S62.26"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "plan:free", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-execution-boundaries", "api:GET /api/models/catalogue", "api:POST /api/llm/v1/chat/completions", "file:packages/contracts/types/src/billing-catalog.ts", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-09 Side-by-side model comparison

Sends one prompt to two or three models at once and shows each answer in its own panel. Web: Models page, 'Compare answers', two or three models. Mobile: 'Compare Models' screen opened by /compare, exactly two models, Cloud only. Answers run in parallel up to the plan limit. Nothing is saved.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.19](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6219), [S62.20](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6220), [S62.26](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6226).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Runs the same prompt on chosen models independently and streams each answer into its own panel so the person can compare quality and speed.

**Why it exists.** Brief items S62.19, S62.20 and S62.26 ask for a view that runs one prompt on several models, in parallel, with the user choosing the set. It supports model-agnostic choice.

**Who uses it.** People choosing which model suits a task, on web and mobile (Cloud accounts).

**Problems it solves**

- Seeing how models differ on the same prompt without pasting it several times.
- Seeing speed differences (first words and total time on web; time to first token and a Faster badge on mobile).

**Use cases**

- Pick two models on web, ask a coding question, read both answers, then press 'Chat with <model>' on the better one.
- On a phone, compare two models on a short question.
- Select models in the Models catalogue and open Compare answers with them preselected.

## 2. User experience

**Where to find it**

- Web: Models page (/models), select models for comparison, then the button 'Compare answers' (the separate button 'Compare' opens a specification table) (apps/web/features/models/components/ModelCatalogueBrowser.tsx:296-323). The page is /models/compare with title 'Compare answers' (apps/web/app/models/compare/page.tsx:8-12).
- Mobile: type /compare in the chat input (offered only in Cloud mode) to open the 'Compare Models' screen (apps/mobile/src/features/chat/components/ChatInput.tsx:1564-1577; apps/mobile/app/(tabs)/chat.tsx:1173 as apps/mobile/app/(app)/(tabs)/chat.tsx:1173; apps/mobile/app/(app)/compare.tsx:1).
- Desktop: no route or screen in the Tauri or Electron code; the Electron desktop shows the hosted web app so /models/compare may be reachable [inferred]; not verified.
- CLI, VS Code, Chrome: not available.

**Before you start**

- Web: models list loaded; at least two models selectable for the account (apps/web/features/models/components/CompareAnswersPage.tsx:262-276).
- Mobile: Cloud mode, signed in, a plan with at least two models (apps/mobile/src/features/compare/index.tsx:425-480).

**Screens and controls**

- Web: back link 'Models', heading 'Compare answers', one dropdown per slot labelled 'Model 1', 'Model 2', optional 'Model 3', remove button 'Remove <model> from the comparison', button 'Add a model', prompt box with placeholder 'Ask every model the same thing', Send/Stop button. Each answer panel has 'Copy the answer from <model>' and 'Chat with <model>' (apps/web/features/models/components/CompareAnswersPage.tsx:262-484).
- Mobile: header 'Compare Models' and 'Go back'; two model pills 'Select model A/B: currently <name>' that open the model picker; the chat input; per-answer 'Report this answer' flag (apps/mobile/src/features/compare/index.tsx:395-720).

**Journey**

1. Open the compare view and choose models (web: two to three; mobile: two).
2. Type a prompt and press Enter or Send.
3. Each model's panel shows 'Waiting for the first words…' or a queued note, then streamed text.
4. When finished each panel shows timing (web: 'First words in X s · Finished in Y s'; mobile: ms, approximate tokens, total time).
5. Optional: copy an answer, press 'Chat with <model>' (web) or report an answer (mobile), or Stop.

**What the person sees and gets**

- Queued note: 'Your plan runs N answer(s) at a time, so the rest start as each one finishes.' (web) and 'Your plan runs one answer at a time, so the second waits for the first.' (mobile) (apps/web/features/models/components/CompareAnswersPage.tsx:107-112; apps/mobile/src/features/compare/index.tsx:84-85).
- 'Answered by <model>' when the server resolved a different model (apps/web/features/models/components/CompareAnswersPage.tsx:383-385).
- Notes for 'length' and 'content_filter' finish reasons (web).
- Mobile 'Faster' badge and trophy on the quicker answer, 'tie' when equal.

**Settings**

- Plan and the model catalogue decide which models are offered.
- Web hint states each answer counts as a message on the plan, answers are not saved to chats, and memory stays off (apps/web/features/models/components/CompareAnswersPage.tsx:333-336).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web compare page, hook and stream reader send one request per model with tools off, memory off and connectors off (apps/web/features/models/lib/compare-answer-stream.ts:140-152).
- Web runs answers in parallel up to the plan's concurrent-turn limit using worker loops (apps/web/features/models/lib/use-compare-answers.ts:115-166; apps/web/features/models/components/CompareAnswersPage.tsx:166-168).
- Web lists only models the catalogue marks admitted, live, not temporarily unavailable and selectable (apps/web/features/models/lib/model-presentation.ts:63-70).
- Web two to three slots with add and remove (apps/web/features/models/lib/compare-answers.ts:6-7).
- Web empty state with 'See plans' link when fewer than two models (apps/web/features/models/components/CompareAnswersPage.tsx:256-270).
- Each web panel keeps its own failure; one failing model does not stop the others (apps/web/features/models/lib/use-compare-answers.ts:150-160).
- Mobile two-model compare with parallel streams, one-at-a-time queueing for plans with a limit of 1, Stop, Local-mode banner and 'Switch to AGI Cloud' action (apps/mobile/src/features/compare/index.tsx:200-335, :431-455).
- Mobile refuses attachments with a message (apps/mobile/src/features/compare/index.tsx:84-86, :222-231).
- The brief marks web as missing; the code shows web compare exists.

**Incomplete**

- Mobile picker: choosing the other slot's model swaps the two instead of rejecting; a model outside the tier list is silently ignored (apps/mobile/src/features/compare/index.tsx:343-367).
- Mobile 'tokens' are estimated as text length divided by 4 (apps/mobile/src/features/compare/index.tsx:277).
- Mobile compare has no Retry control per panel; the user must resend.

**Present but disconnected or switched off**

- On mobile the /compare command is hidden outside Cloud mode, though the screen handles Local mode if opened directly (apps/mobile/app/(app)/(tabs)/chat.tsx:1173).

**Not available**

- Desktop (no screen found), CLI, VS Code, Chrome: no compare view.
- Three-model compare on mobile (fixed to two).
- Attachments in compare on mobile (text only).
- Saving, rerun, cost estimate: see F062-11.

## 4. Required behaviour

**Established requirements**

- The user can open a view that runs one prompt on several models side by side. (source: S62.19)
- Each model answers the same prompt independently and in parallel. (source: S62.20)
- The user chooses which set of models takes part. (source: S62.26)
- Web models are selectable only if the catalogue marks them available and admitted for the account. (source: apps/web/features/models/lib/model-presentation.ts:63-70)
- Mobile compare must not send from Local mode; nothing leaves the device. (source: apps/mobile/src/features/compare/index.tsx:84-86 notice; AGENTS.md section 6)
- Model comparison in the competitor set (a multi-model Council) is a reference for the experience. (source: doc: docs/product/competitive-guidance.md:199)

**Acceptance criteria**

1. Web: with two models and a prompt, two panels stream and both end with timing.
2. Web: on a plan whose limit is 1, the second panel shows the queued note until the first finishes.
3. Web: a model that is not selectable never appears in the dropdowns.
4. Web: if one model returns an error, its panel shows an alert and the other panel completes.
5. Web: fewer than two selectable models shows the message and 'See plans'.
6. Mobile: in Local mode no request is made and the banner shows 'Switch to AGI Cloud'.
7. Mobile: attaching a file shows 'Compare sends prompt text only...' in both panels.
8. Mobile: both slots always hold different models.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Compare requests are billed as normal managed turns [inferred from the web hint and the common completions endpoint].
- A panel should be keyboard reachable [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Compare on desktop shell navigation if the Electron app should surface the hosted page.
- [proposed] Let mobile compare three models like web.
- [proposed] Update the area brief: web compare exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Compare answers route | `apps/web/app/models/compare/page.tsx` | Server page; reads ?model= params; metadata. |
| component | CompareAnswersPage | `apps/web/features/models/components/CompareAnswersPage.tsx` | Slots, prompt box, panels, concurrency note. |
| hook | useCompareAnswers | `apps/web/features/models/lib/use-compare-answers.ts` | Parallel workers, phases queued/streaming/done/stopped/failed, stop. |
| service | streamCompareAnswer | `apps/web/features/models/lib/compare-answer-stream.ts` | One streaming request per model; frame parser; error mapping. |
| service | compare-answers helpers | `apps/web/features/models/lib/compare-answers.ts` | Min 2 / max 3, initial model choice, href. |
| service | isSelectable | `apps/web/features/models/lib/model-presentation.ts:63` | Filters models offered. |
| component | ModelCatalogueBrowser 'Compare answers' | `apps/web/features/models/components/ModelCatalogueBrowser.tsx:312` | Entry button from the Models page. |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Catalogue with plan tier and admitted flags. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Managed turn endpoint with per-plan turn slot. |
| endpoint | Free-quota completions endpoints | `apps/web/features/chat/lib/free-quota-selection.ts:40` | Chooses the endpoint for provider-funded free models. |
| screen | Mobile CompareScreen | `apps/mobile/src/features/compare/index.tsx` | Two model pills, two streams, speed verdict, Local gate. |
| screen | Mobile compare route | `apps/mobile/app/(app)/compare.tsx` | Exports the screen. |
| component | ChatInput /compare command | `apps/mobile/src/features/chat/components/ChatInput.tsx:1564` | Entry command. |
| service | mobile streamChat | `apps/mobile/services/streaming.ts:1046` | Cloud stream with account epoch, consent and reconnect. |
| service | getCloudModelsForTier | `apps/mobile/lib/models.ts:117` | Models allowed for the plan on mobile Cloud chat. |
| service | getPlanMaxConcurrentTurns | `packages/contracts/types/src/billing-catalog.ts:792` | Plan concurrency limit used by web and mobile. |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile model choice per slot [path assumed from import]. |
| test | Mobile compare tests | `apps/mobile/__tests__/CompareAccountIsolation.test.tsx` | Slot, tier and account behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page loads the model catalogue for the signed-in plan. | our servers | apps/web/app/api/models/catalogue/route.ts:80-94 |
| Browser starts up to N workers (N = plan limit) and sends one POST per model with the prompt as the only message. | device | apps/web/features/models/lib/use-compare-answers.ts:162-165 |
| Server admits the turn through a per-plan slot, runs the model, and streams SSE frames. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:1452-1500 |
| The model provider generates the answer. | outside service | managed chat route dispatches to providers [inferred from route.ts] |
| Browser parses frames, coalesces text per frame and updates each panel. | device | apps/web/features/models/lib/use-compare-answers.ts:104-110 |
| Mobile does the same with streamChat for slot A and slot B (queued if the plan limit is 1). | device and our servers | apps/mobile/src/features/compare/index.tsx:241-335 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt and answers | component state in page memory only | no | lost on leaving or reloading (web hint 'Not saved to chats') |
| Request/usage records of each answer | server usage accounting for managed turns | server | unknown |
| Recent model choice when pressing 'Chat with <model>' | web model stores (recentModelIds, selected model) | unknown | unknown |

**Models and providers.** The models are whatever the catalogue offers for the plan; the page names no model. Requests use the idempotency purpose 'compare' (apps/web/features/models/lib/compare-answer-stream.ts:122-125). The server may answer with a different model; the 'X-AGI-Resolved-Model' header drives 'Answered by'.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs sign-in for a useful run (the stream adds a token when available; otherwise the server decides). Mobile needs sign-in and Cloud (apps/mobile/src/features/compare/index.tsx:210-220). |
| Permissions | none found in the code beyond account and plan. |
| Subscription | Models come from the plan catalogue; fewer than two models shows the upgrade path. Each answer counts as a message on the plan (apps/web/features/models/components/CompareAnswersPage.tsx:333). |
| Limits and metering | Concurrent turns by plan: web worker count and server turn slot; mobile queues B when limit <= 1 (apps/mobile/src/features/compare/index.tsx:82-85). Per-minute and quota rules live in the managed completions route [details unknown]. |
| Feature flags | none found in the code. |
| Model compatibility | Text only. Tools, memory, connectors and thinking are off (apps/web/features/models/lib/compare-answer-stream.ts:146-150; apps/mobile/src/features/compare/index.tsx:284-289). |
| Provider restrictions | Free provider-funded models use the free-quota endpoint on web; on mobile streamChat refuses a provider-funded Free model with 'Provider-funded Free models require the Free chat route' (apps/mobile/services/streaming.ts:1059-1062). How mobile Free compare passes this is not established. |
| Local mode | Mobile Local mode: the screen shows the banner 'Model comparison runs on AGI Cloud, so it is unavailable while chat is in Local Mode. Nothing was sent from this device.' and a switch action; send is refused (apps/mobile/src/features/compare/index.tsx:87-89, :431-455). No on-device model comparison exists. Web has no Local mode path in this page. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web 'Loading models…' spinner; per-panel 'Waiting for the first words…'; mobile 'Generating...'. | apps/web/features/models/components/CompareAnswersPage.tsx:243-247, :400 |
| Empty | Web message with 'See plans'; mobile 'Type a prompt below...' or 'Compare two models' with 'Go to Chat'. | apps/web/features/models/components/CompareAnswersPage.tsx:256-270; apps/mobile/src/features/compare/index.tsx:455-475 |
| Catalogue error | Web alert 'The model list could not be loaded.' with 'Try again'. | apps/web/features/models/components/CompareAnswersPage.tsx:229-241 |
| Per-model error | Panel alert with message; others continue. | apps/web/features/models/lib/use-compare-answers.ts:150-160 |
| Cancel | Stop aborts all and marks active panels 'Stopped'. | apps/web/features/models/lib/use-compare-answers.ts:73-85 |
| Retry | Not handled in the code per panel; the user sends the prompt again. | apps/web/features/models/lib/use-compare-answers.ts |
| Timeout / stream break | Web: 'The answer stopped before it finished. Try again.'; mobile uses timeout and reconnect in streamChat. | apps/web/features/models/lib/compare-answer-stream.ts:25-26; apps/mobile/services/streaming.ts:1076-1130 |
| Offline | Web shows the fetch error text; mobile shows the thrown message. | apps/mobile/src/features/compare/index.tsx:100-104 |
| Account switch / plan change | Mobile aborts and clears results when the account or plan changes. | apps/mobile/src/features/compare/index.tsx:182-196; apps/mobile/__tests__/CompareAccountIsolation.test.tsx:124-253 |
| Accessibility | Web: fieldset legend, aria-labels, aria-busy on streaming panel, role=alert on errors, touch targets for coarse pointers; mobile: accessibility labels on pills and report buttons. | apps/web/features/models/components/CompareAnswersPage.tsx:290-300, :360-372 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/models/lib/compare-answer-stream.test.ts`: Stream parsing: normal answer, skipped bad frames, unreadable message, error frame after text.
- `apps/web/e2e/signed-in-page-routes.spec.ts:8`: Route /models/compare renders heading 'Compare answers' for a signed-in user.
- `apps/web/e2e/phone-layout-rules.spec.ts:38`: Compare page is in the phone layout route list.
- `apps/mobile/__tests__/CompareLocalModeGate.test.tsx`: Local-mode notice, switch action, forced send refused, abort on switch to Local, no raw guard text.
- `apps/mobile/__tests__/CompareAccountIsolation.test.tsx`: Fast-speed opt-out, account isolation, model change cancels, plan with fewer than two models, distinct models, one-at-a-time on Free.
- `apps/mobile/__tests__/CompareSpeedVerdict.test.tsx`: Faster badge, no verdict on stop or error, tie, simultaneous note.
- `apps/mobile/__tests__/CompareAnswerReport.test.tsx`: Report control per finished answer.

**Test scenarios**

- **Web two-model run**
  1. Sign in on a paid plan, open /models/compare.
  2. Keep two models, type 'Explain recursion in one line', press Enter.
  - Expected: Two panels stream; each ends with 'Finished in X s'.
- **Web three models on a limit-1 plan**
  1. Use an account with concurrency 1.
  2. Add a third model and send.
  - Expected: Panels 2 and 3 show the queued note, then run in order.
- **Web one model fails**
  1. Pick a model that is failing or mock a 500 for one request.
  2. Send.
  - Expected: One panel shows an alert; the others complete.
- **Web too few models**
  1. Use a Free account whose catalogue has fewer than two selectable models.
  - Expected: Message with 'See plans'.
- **Mobile Local gate**
  1. Switch chat to Local mode.
  2. Open Compare Models directly.
  - Expected: Banner; no request; Switch to AGI Cloud action.
- **Mobile attachment**
  1. In Cloud mode attach an image in compare and send.
  - Expected: Both panels show 'Compare sends prompt text only...'.

**Where to look when it fails**

- Web console '[ModelCompare] skipped a frame...' warnings (apps/web/features/models/lib/compare-answer-stream.ts:88-96).
- Network tab: one POST per model to /api/llm/v1/chat/completions.
- Mobile: panel error text from compareErrorMessage; EgressBlockedError maps to the Local notice.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md)
- Mobile: [70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **No desktop compare screen.** Affects: Desktop (Tauri; Electron only via hosted web).. Evidence: No compare code in apps/desktop.. Work needed: Confirm Electron reaches /models/compare; add a nav entry if wanted.
- **No compare in CLI, VS Code, Chrome.** Affects: Those apps.. Evidence: No code found.. Work needed: Decide scope.
- **Mobile fixed to two models; web allows three.** Affects: Mobile.. Evidence: apps/mobile/src/features/compare/index.tsx:147-148. Work needed: Align or document.
- **Mobile picker swaps instead of rejecting a duplicate; tier violations are silent.** Affects: Mobile.. Evidence: apps/mobile/src/features/compare/index.tsx:343-367. Work needed: Show a message.
- **No tests found for the web compare page or hook; only the stream parser.** Affects: Web.. Evidence: features/models tests list.. Work needed: Add component and hook tests for concurrency and failure.
- **Local on-device comparison not offered.** Affects: Mobile Local and desktop Local users.. Evidence: apps/mobile/src/features/compare/index.tsx:87-89. Work needed: Decide whether local models should compare on device.
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- plan:free
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-execution-boundaries
- api:GET /api/models/catalogue
- api:POST /api/llm/v1/chat/completions
- file:packages/contracts/types/src/billing-catalog.ts
- SYS-shared-ui-and-design

## Unknown

- Whether the Electron desktop menu links to /models.
- How the server meters a compare answer (message count versus tokens).
- Whether mobile Free compare works given the provider-funded refusal in streamChat.
- Whether compare answers appear in the user's usage history.
- Whether a signed-out web visitor can run compare.
