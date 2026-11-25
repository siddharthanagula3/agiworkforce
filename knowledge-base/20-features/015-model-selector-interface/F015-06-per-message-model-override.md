---
id: "F015-06"
type: "feature"
title: "Per-message model override"
aliases: ["Per-message model override", "Per-turn model override (brief S15.31)", "Try again with (regenerate with another model, Web)", "handleRegenerateWithModel", "Retry with another model (Mobile)", "Regenerate with a model (Chrome)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S15.31"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "F015-05", "api:PUT /api/chat/conversations/{id}"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-06 Per-message model override

On Web and Desktop a person can regenerate an answer on another model from the answer's refresh menu, 'Try again with', without changing the chat's saved model. No way to send a new message on a one-off model was found. Mobile and Chrome retry with a model but keep that model afterwards.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.31](../../10-requirements/capabilities/015-model-selector-interface.md#s1531).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Re-runs one assistant answer on a model chosen in the answer's regenerate menu, so the person can compare or recover without switching the conversation's model.

**Why it exists.** People want to see how another model answers the same question, or get past a failed or limited answer, without changing the chat's model for later messages.

**Who uses it.** Web and Desktop users who see a weak or failed answer.

**Problems it solves**

- A bad answer from one model.
- A model that hit its limit.
- Wanting a second opinion on one answer.

**Use cases**

- User opens 'Try again with' on an answer and picks another model.
- A Free user retries on a free model from the allowed list.
- A user who hit a usage limit card retries on another model.

## 2. User experience

**Where to find it**

- Web and Desktop: on an assistant message, the refresh icon with the label 'Regenerate response' opens a menu: 'Try again', then 'Try again with' and a list of models (apps/web/features/chat/components/messages/MessageBubble.tsx:3871-3902). Image and video answers do not get this menu (MessageBubble.tsx:3869-3870).
- Mobile: the 'retry with model' action on an assistant message opens the picker and then reruns (apps/mobile/src/features/chat/components/MessageBubble.tsx:1216-1219, 1661-1666; apps/mobile/app/(app)/chat/[id].tsx:1420-1448).
- Chrome: regenerate with a model selection from the answer (apps/extension/src/side_panel.ts:5961-5965, 9577-9603).

**Before you start**

- The conversation must be saved and not streaming (apps/web/features/chat/pages/WebChatPage.tsx:5706).
- Free plans can choose only free-allowed models (apps/web/features/chat/lib/regenerate-model-options.ts:8-20).
- Local to BYOK regeneration is refused with a reason (WebChatPage.tsx:5748-5760).

**Screens and controls**

- Web menu items with the model name and a check mark on the model that produced the answer (MessageBubble.tsx:3892-3901).
- Web list from selectableRegenerateModelOptions: models the account can select, with Free restrictions (regenerate-model-options.ts).

**Journey**

1. Find an assistant answer.
2. Open the Regenerate response menu.
3. Choose Try again with and a model.
4. The old answer is rolled back and the same user message is re-sent to that model.
5. The conversation's saved model and the composer selection stay as they were.

**What the person sees and gets**

- The new answer replaces the old one, tagged with the serving model (outside this feature).
- A refusal appears as a chat error when the retry would cross a trust boundary (WebChatPage.tsx:5757-5760).
- When the answer carries a usage limit card, the conversation model is also changed to the chosen model (WebChatPage.tsx:5880-5882).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: handleRegenerateWithModel resolves a selectable id and calls handleRegenerateMessage with it; the request uses targetModelId and the conversation model is not saved (apps/web/features/chat/pages/WebChatPage.tsx:5704-5707, 5877-5885).
- Web: the list is filtered for Free plans to free models and the promoted model (apps/web/features/chat/lib/regenerate-model-options.ts:8-20; test apps/web/features/chat/lib/regenerate-model-options.test.ts).
- Web: regeneration across Local to BYOK is refused (WebChatPage.tsx:5748-5760).
- The completions API takes the model per request, so the server accepts a different model per turn (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:285-305 area).

**Incomplete**

- The draft said modelOverrideId is the override; it is a field for promotional image and video generation turns (WebChatPage.tsx:503-504, 2610-2613, 4385-4388), not this feature.
- A one-off model for a new, unsent message was not found on any app.
- When a limit card is present, the retry also changes the saved conversation model, so it is not one-turn only in that case (WebChatPage.tsx:5880-5882).
- Mobile retry-with-model sets the conversation model and keeps it (apps/mobile/app/(app)/chat/[id].tsx:1429-1448).
- Chrome regenerate with a model calls applyModelSelection, which stores the choice for later turns (side_panel.ts:9595, 6017-6032).

**Present but disconnected or switched off**

- none found.

**Not available**

- Per-turn override for a new message on all apps.
- Any per-turn override on CLI and VS Code (brief lists them missing; none found in apps/cli/src and apps/extension-vscode/src).

## 4. Required behaviour

**Established requirements**

- The user can run a single turn with a different model without changing the conversation's model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.31)
- Regenerate must not move a Local transcript to another trust boundary without a visible refusal or consent. (source: doc: AGENTS.md section 6; apps/web/features/chat/pages/WebChatPage.tsx:5748-5760)
- The picker never lets a locked or unavailable model be chosen. (source: doc: docs/product/experience-contract.md section 7.3)

**Acceptance criteria**

1. On Web, 'Try again with' another model re-runs only that answer on the chosen model.
2. After the retry, the composer and the saved conversation model still show the previous model.
3. A Free account sees only the free-allowed models in the list.
4. On a Local conversation, choosing a BYOK model shows a refusal and sends nothing.
5. Image and video answers show no 'Try again with' menu.
6. On a usage-limit card, choosing a model changes the conversation model too, and the screen says so [inferred requirement; today it does so silently].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A true per-turn override should be reachable from the composer for new messages, not only for regeneration [inferred from S15.31].
- Mobile and Chrome should leave the stored choice unchanged on a retry [inferred from the requirement wording].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a one-turn model selector in the composer's send control.
- [proposed] Make Mobile and Chrome retry-with-model one-turn only, or rename it as a switch.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble regenerate menu | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Regenerate response menu and Try again with list (lines 3865-3904). |
| service | handleRegenerateMessage and handleRegenerateWithModel | `apps/web/features/chat/pages/WebChatPage.tsx` | Rolls back and re-sends with the target model (lines 5704-5885). |
| service | regenerateModelOptions | `apps/web/features/chat/lib/regenerate-model-options.ts` | Filters models for the menu by plan. |
| service | resolveRegenerateBoundaryRefusal | `apps/web/features/chat/lib/regenerateReplay.ts` | Trust boundary check used at WebChatPage.tsx:5753 (file name inferred from tests listing; not opened). |
| endpoint | POST chat completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts the model on each request. |
| service | Mobile retryMessage with model | `apps/mobile/app/(app)/chat/[id].tsx` | retryWithModelRef and the picker callback (lines 1109, 1310, 1420-1448). |
| component | Mobile MessageBubble retry action | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Retry with another model action (lines 1216-1219, 1661-1666). |
| service | Chrome regenerateTurn | `apps/extension/src/side_panel.ts` | Regenerates with a model selection (lines 9577-9603). |
| service | modelOverrideId media field | `apps/web/features/chat/pages/WebChatPage.tsx` | Not this feature: media promotion model id (lines 503-504). |
| test | regenerate-model-options test | `apps/web/features/chat/lib/regenerate-model-options.test.ts` | Free filtering of the list. |
| test | regenerateReplay test | `apps/web/features/chat/lib/regenerateReplay.test.ts` | Regenerate replay rules (name only; content not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses a model in the Try again with menu. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:3892-3896 |
| The page resolves the id, checks Free promotion and trust boundary rules, and rolls back the answer. | device | WebChatPage.tsx:5704-5760, 5877-5885 |
| The user message is re-sent to the chat completions API with model set to the target. | our servers | WebChatPage.tsx:5779, 5807, 5819 |
| The server routes and answers using the named model, subject to plan and quotas. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts (provider call); route not traced in this page |
| When a limit card exists, the conversation model is first saved with the same PUT as F015-05. | our servers | WebChatPage.tsx:5880-5882; apps/web/lib/hooks/useConversations.ts:892-935 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Regenerated answer and its serving model | Conversation messages on the server | Yes | Replaces or sits as a variant according to the variants setting (WebChatPage.tsx:5862 variantsEnabled) |
| Conversation model | Table web_conversations | Yes | Unchanged by a plain retry on Web |

**Models and providers.** The chosen model can be any model the account may select. A paid model is excluded for Free accounts. A Local transcript cannot be re-sent to a BYOK model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in conversation required; the website free-trial state also restricts the list (WebChatPage.tsx:5867-5875). |
| Permissions | none found beyond the normal chat request authorization. |
| Subscription | Free plan sees free models, the promoted model and free-quota chat offerings only (regenerate-model-options.ts:8-20). |
| Limits and metering | The retry spends the chosen model's allowance like a new turn [inferred from the replay through the same API]; trial exhaustion opens the upgrade dialog (WebChatPage.tsx:5736-5739). |
| Feature flags | Variants flag (variantsEnabled) changes how the retried answer is stored (WebChatPage.tsx:5862). |
| Model compatibility | Replay decision checks whether the old transcript can be replayed (WebChatPage.tsx:5740-5747). |
| Provider restrictions | Local to BYOK refused (WebChatPage.tsx:5748-5760). |
| Local mode | Web and Desktop: a Local conversation cannot be regenerated on a BYOK model; whether regenerating a local answer on another local model works was not traced. Mobile retry with model changes the conversation model and the execution mode through a confirmation (chat/[id].tsx:1435-1445). CLI none. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming in progress | Regenerate does nothing. | WebChatPage.tsx:5706 |
| Trial exhausted | Upgrade dialog. | WebChatPage.tsx:5736-5739 |
| Boundary refusal | Chat error with a reason, nothing sent. | WebChatPage.tsx:5753-5760 |
| Failed answer with an approval card | Resumes the card instead of regenerating. | WebChatPage.tsx:5709-5716 |
| Image and video answers | No Try again with menu. | MessageBubble.tsx:3869-3870 |
| Offline or API error | not handled specially in this path in the code read. | WebChatPage.tsx:5704-5850 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/regenerate-model-options.test.ts`: Free accounts get no paid models, paid accounts keep choices, free-quota chat offerings accepted, promoted model offered during a promotion.
- `apps/web/features/chat/lib/regenerateReplay.test.ts`: Regenerate replay (name only).
- `apps/web/features/chat/lib/free-model-handoff.test.ts`: Free model handoff for replays (name only).

**Test scenarios**

- **Retry on another model (Web)**
  1. Get an answer on model X in a saved chat on a paid plan.
  2. Regenerate response > Try again with > model Y.
  3. Look at the composer, then send a new message.
  - Expected: The answer is re-run on Y; the composer still shows X; the new message uses X.
- **Free list**
  1. On a Free account open Try again with.
  - Expected: Only free-allowed models are listed.
- **Boundary refusal**
  1. In a Local conversation choose a BYOK model in Try again with.
  - Expected: A visible refusal; no request is sent.
- **Limit card**
  1. Reach a usage limit card, then retry on another model.
  - Expected: The retry runs and the conversation model changes too.
- **Mobile retry**
  1. Use retry with model on Mobile and pick another model, then send a new message.
  - Expected: The new message uses the picked model (observed behaviour to record).

**Where to look when it fails**

- Network: POST chat completions body model field after a retry.
- Chat error text from resolveRegenerateBoundaryRefusal.
- Server logs from the completions route (not traced).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **No one-off model choice exists for a new message.** Affects: All apps. Evidence: No composer control found; only regenerate paths (WebChatPage.tsx:5877-5885). Work needed: Decide the control and the request field.
- **Mobile and Chrome retry-with-model keep the new model afterwards, so they are not per-turn overrides.** Affects: Mobile and Chrome. Evidence: apps/mobile/app/(app)/chat/[id].tsx:1429-1448; apps/extension/src/side_panel.ts:6017-6032, 9595. Work needed: Separate the one-turn path or rename the action.
- **On Web a usage limit card makes the retry change the conversation model silently.** Affects: Web and Desktop. Evidence: WebChatPage.tsx:5880-5882. Work needed: Tell the person that the conversation model changed.
- **The brief's per-turn evidence mixes media fields and regenerate paths.** Affects: Documentation. Evidence: WebChatPage.tsx:503-504 versus 5704-5885. Work needed: Correct the brief code column for S15.31.
- **CLI and VS Code have no per-turn override.** Affects: CLI and VS Code. Evidence: No code found in apps/cli/src or apps/extension-vscode/src. Work needed: Decide whether they need it.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- F015-05
- api:PUT /api/chat/conversations/{id}

## Unknown

- Whether the server treats a regenerate request differently from a normal send in billing or routing.
- Whether regenerating a local answer on another local model is allowed on Desktop.
- The path of resolveRegenerateBoundaryRefusal (the import was not opened; the file name in the map is an inference).
- Whether Desktop shows the same menu in the packaged Electron window (hosted web app, not run).
- What the Mobile retry shows when the chosen model is in the other execution mode.
