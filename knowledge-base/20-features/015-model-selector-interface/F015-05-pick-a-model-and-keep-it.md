---
id: "F015-05"
type: "feature"
title: "Pick a model and keep it"
aliases: ["Pick a model and keep it", "Explicit model selection, Sticky model preference, Conversation-specific override (brief S15.10, S15.29, S15.30)", "Switch model", "commitModel and handleSelectModel (Web)", "selectAndClose (Mobile)", "Select Model command (VS Code)", "applyModelSelection (Chrome)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S15.10", "S15.29", "S15.30"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F015-01", "F015-02", "api:PUT /api/chat/conversations/{id}", "table:web_conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-05 Pick a model and keep it

Choosing a model row makes the next message use it. The choice is remembered for later sessions, and each saved conversation keeps its own model when reopened. Switching to a model that cannot handle the chat warns first on Web and VS Code. Locked rows cannot be chosen.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.10](../../10-requirements/capabilities/015-model-selector-interface.md#s1510), [S15.29](../../10-requirements/capabilities/015-model-selector-interface.md#s1529), [S15.30](../../10-requirements/capabilities/015-model-selector-interface.md#s1530).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Applies the chosen model to the next message, stores it as the remembered choice, and on a saved conversation stores it on that conversation.

**Why it exists.** People expect the app to use the model they picked, to remember it, and to reopen an old chat on the model that chat used. Switching mid-chat can lose images, tools or cache, so people must be warned.

**Who uses it.** Everyone who chooses a model.

**Problems it solves**

- The model resetting to a default on every reload.
- A reopened chat continuing on an unrelated model.
- Silent loss of attached images or tools after a switch.
- Crossing from a local model to a cloud model without consent.

**Use cases**

- Web user opens an old chat and the composer shows that chat's model.
- Web user picks a model unable to read images in a chat with images and sees a warning with 'Switch anyway'.
- Desktop user leaves a local model after a local answer and is asked to start a new chat.
- VS Code user picks a model with no chat open and sets the default for new chats.

## 2. User experience

**Where to find it**

- Web and Desktop: click a row in the short list or catalogue (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171-1195; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:492-496).
- Mobile: tap a row in the sheet (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:443-452, 531-547).
- CLI: highlight a row and press Enter in the /model overlay (apps/cli/src/tui/widgets/model_picker.rs:769-798).
- VS Code: command 'Code: Select Model' or the sidebar popover (apps/extension-vscode/src/core/commandSetup.ts:1302-1379).
- Chrome: click a row in the side panel model dropdown (apps/extension/src/side_panel.ts:6017-6032).

**Before you start**

- The row must not be locked; locked rows show the plan or sign-in needed.
- Web: if the open chat holds on-device answers, leaving the local model needs confirmation.
- Mobile: switching provider mid-chat can need a higher plan (ModelPickerSheet.tsx:486-508).

**Screens and controls**

- Web switch warning panel inside the picker: 'Switch to <model>?', warning lines, buttons 'Switch anyway' and 'Keep <current model>' (ComposerFooter.tsx:1533-1567).
- Web local fork dialog titled 'Start a new chat for a cloud model?' with the button 'Start a new chat' (apps/web/features/chat/hooks/useLeaveLocalModel.tsx:11-14).
- Mobile alerts 'Start a new chat for this model' and a download prompt for on-device models (ModelPickerSheet.tsx:495-529).
- Mobile mode switch confirmation when the new model is in the other execution mode (apps/mobile/app/(app)/chat/[id].tsx:1435-1445).
- VS Code modal 'Switch to <model>?' with 'Switch anyway' when the new model loses abilities (commandSetup.ts:1359-1370).

**Journey**

1. Open the picker.
2. Click or tap a row; a locked row opens its upgrade or sign-in path instead.
3. If the chat has images, tools or a long context the model cannot take, Web and VS Code ask first.
4. Confirm. The picker closes, the label changes, and the next message uses the model.
5. Web with a saved chat: the model is saved on the conversation on the server; with no chat yet, only the global selection changes.
6. Reopen the chat later: Web restores that chat's model.

**What the person sees and gets**

- Web: choosing the model already selected closes the picker and changes nothing (ComposerFooter.tsx:1177-1180).
- Web error toast 'Could not save the model for this conversation. The previous model remains active.' (ComposerFooter.tsx:1156-1163).
- Web trigger shows 'Saving…' during the save (ComposerFooter.tsx:1483-1505).
- Web cache hint in the picker after a completed turn: a note that switching resets the cached prompt (apps/web/features/chat/components/Composer/__tests__/ComposerFooter.model-switch-note.test.tsx, by title).
- VS Code information message names the model and whether it applies to this chat or to new chats (commandSetup.ts:1372-1378).

**Settings**

- Web preference storage key agi-model-store version 6 (model-store.ts:376-378).
- VS Code agiWorkforce.model for the default.
- CLI -m flag or default.model for the startup model (lib.rs:190-192, 8049-8055).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: commitModel records the recent model, then either sets the global selection (no saved chat) or calls onModelChange, which saves the model on the conversation and updates the global selection after a successful save (ComposerFooter.tsx:1141-1168; apps/web/features/chat/pages/WebChatPage.tsx:2153-2172).
- Web: the server saves the model on the conversation with PUT /api/chat/conversations/{id}; a route id must be sent with a model and must be a configured route for it (apps/web/lib/hooks/useConversations.ts:892-935; apps/web/app/api/chat/conversations/[id]/route.ts:202-206).
- Web: when a saved chat opens, its model is restored into the composer once per conversation and model (WebChatPage.tsx:2106-2123).
- Web: locked rows do not call onSelect (ComposerFooter.tsx:1289-1296 passes undefined when locked or saving).
- Web: a compatibility check lists images, tools or context problems; blocking findings open the warning panel (ComposerFooter.tsx:1180-1187).
- Web: leaving a local model when the chat holds local answers needs confirmation and opens a new chat (useLeaveLocalModel.tsx:35-57).
- Mobile: model store keeps the choice per mode; conversation model saved in the chat store and synced for cloud chats (store.ts:179-203; apps/mobile/stores/chat/chatMessageStore.ts:931-953).
- CLI: Enter switches the session model; managed models enter a managed session (tui_app.rs:5073-5109).
- VS Code: with a chat open the pick applies to the chat; otherwise it saves the default setting (ChatStateManager.ts:1199-1212).
- Chrome: the choice is saved to extension storage and a changed model resets conversation state (side_panel.ts:6017-6032).

**Incomplete**

- Web Desktop local selection is deliberately not persisted, so a reload returns to the cloud selection (apps/web/features/desktop-host/lib/local-model-selection.ts).
- CLI choice is session-only in the code read; no write to config was found (tui_app.rs:5073-5109).
- Mobile has no incompatibility warning on a switch (brief S15.34 lists Mobile missing); Mobile warns only for mode change and provider change (chat/[id].tsx:1435-1445; ModelPickerSheet.tsx:486-508).
- CLI has no incompatibility dialog (brief S15.34 lists CLI missing); only the banner 'Model changed to ...' (model_picker.rs:786).

**Present but disconnected or switched off**

- Web Chrome extension: none.

**Not available**

- Persisted local model selection on Web and Desktop (by design).
- CLI and Chrome conversation-level warning dialogs.

## 4. Required behaviour

**Established requirements**

- The user can pick a specific model and the next message uses it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.10)
- The chosen model is remembered for the next session. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.29)
- A conversation can keep its own model, separate from the default used elsewhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.30)
- Switching to a model that cannot handle the conversation asks for confirmation and explains what is lost. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.34)
- A move from Local to BYOK or cloud is an explicit fork with consent and a visible provider label; nothing silently routes a Local chat. (source: doc: AGENTS.md section 6)
- The selector shows disabled reasons and never lets a locked row be picked by mistake. (source: doc: docs/product/experience-contract.md section 7.3; doc: docs/product/requirements.md section 10.8 (M-MODEL-003))

**Acceptance criteria**

1. Pick a model, send a message: the request carries the picked model.
2. Reload the Web page: the global selection is the same; open an old chat: the composer shows that chat's model.
3. Pick the already selected model: the picker closes and nothing is saved.
4. If saving the conversation model fails, the toast appears and the label still shows the old model.
5. A locked row cannot be chosen by click or keyboard.
6. In a chat with images, switching to a model without image input shows the warning with Switch anyway and Keep.
7. After a local answer on Desktop, choosing a cloud model asks to start a new chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every surface should warn when a switch drops capability; Mobile and CLI do not [inferred from S15.34].
- The label should change only after the save succeeds on Web (it does: ComposerFooter.tsx:1154-1163) and the same on other apps [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Persist the Desktop local model choice per chat with consent text.
- [proposed] Add the incompatibility dialog to Mobile and the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFooter commit and switch | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | commitModel, handleSelectModel, switch warning panel (lines 1141-1195, 1533-1567). |
| service | handleConversationModelChange | `apps/web/features/chat/pages/WebChatPage.tsx` | Saves the conversation model and updates the global selection (lines 2153-2172); restores it on open (2106-2123). |
| hook | useConversations.updateConversation | `apps/web/lib/hooks/useConversations.ts` | PUT of the conversation including model (lines 892-948). |
| endpoint | PUT /api/chat/conversations/{id} | `apps/web/app/api/chat/conversations/[id]/route.ts` | Validates and stores model and route (lines 202-206, 591). |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/route.ts` | Row holds model and selected_route_id (queries at lines 39, 110, 222). |
| store | useModelStore | `apps/web/shared/stores/model-store.ts` | Global selection with persistence (lines 331-412). |
| hook | useLeaveLocalModel | `apps/web/features/chat/hooks/useLeaveLocalModel.tsx` | Fork dialog when leaving a local model. |
| service | evaluateModelCompatibility | `packages/ai/routing/src/model-picker.ts` | Imported by the footer for switch findings; implementation file not opened (import at ComposerFooter.tsx:1121-1123 region). |
| component | Mobile ModelPickerSheet select flow | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Lock, download, provider guard and select (lines 443-563). |
| store | Mobile model store actions | `apps/mobile/src/features/model-picker/store.ts` | setModel, showConversationModel, restoreNewChatModel (lines 179-234). |
| screen | Mobile chat screen model handler | `apps/mobile/app/(app)/chat/[id].tsx` | Applies the picked model to the conversation and handles the mode switch (lines 1420-1475). |
| service | CLI finish_model_pick | `apps/cli/src/tui/tui_app.rs` | Switches the session model and prints the banner (lines 5073-5109). |
| service | VS Code selectModel | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Conversation or default scope (lines 1199-1212). |
| command | agi-workforce.selectModel | `apps/extension-vscode/src/core/commandSetup.ts` | Reachability, lock, provider guard and loss warning (lines 1302-1379). |
| service | Chrome applyModelSelection | `apps/extension/src/side_panel.ts` | Stores the choice and resets state on change (lines 6017-6032). |
| test | ComposerFooter model-switch-note test | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.model-switch-note.test.tsx` | Switch is immediate, with a cache note. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks a row; the footer checks the lock and the compatibility findings. | device | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171-1195 |
| With no saved chat the global selection is set at once and stored in the browser. | device | ComposerFooter.tsx:1147-1150; model-store.ts:339-344 |
| With a saved chat, the page sends PUT /api/chat/conversations/{id} with model; the server validates the route and updates web_conversations. | our servers | apps/web/lib/hooks/useConversations.ts:892-935; apps/web/app/api/chat/conversations/[id]/route.ts:202-206 |
| After the save succeeds the page sets the global selection and clears any substitution note. | device | WebChatPage.tsx:2163-2168 |
| On open of a saved chat, the page reads the chat's model and sets the selection. | device | WebChatPage.tsx:2106-2123 |
| Desktop: a local model is chosen in memory and the turn runs on the local server on the computer. | device | apps/web/features/desktop-host/lib/local-model-selection.ts; ComposerFooter.tsx:1126-1139 |
| CLI Enter calls session.switch_model or enter_managed_model; managed models can start a new managed session. | device and our servers | apps/cli/src/tui/tui_app.rs:5080-5098 |
| Mobile saves the choice in MMKV; a cloud chat's model is patched and synced remotely. | device and our servers | apps/mobile/stores/chat/chatMessageStore.ts:931-953 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation model and selected route | Table web_conversations columns model and selected_route_id | Yes, to every Web device on the account | Kept with the conversation; deleted with it |
| Global selection (Web) | Browser key agi-model-store, version 6 | No | Until browser data is cleared |
| Local model selection (Desktop) | Memory only | No | Lost on reload by design |
| Mobile selection and per-mode new-chat choice | MMKV key model-store | No for the selection; the conversation model syncs for cloud chats | Until app data is cleared |
| CLI session model | Process memory and session metadata (apps/cli/src/sessions.rs:529-543) | Hosted sessions carry model in their metadata | With the session |

**Models and providers.** The selected model id is passed to the chat completion request; the server may add a provider route. A model picked from a managed route must match a configured route (route.ts:205-206). Local models never go through the catalogue and run on the local server.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Choosing a model needs no account on Web for a global change; saving it on a saved chat needs sign-in. Cloud models need a signed-in plan. |
| Permissions | The conversation PUT needs authentication and a CSRF token (apps/web/lib/hooks/useConversations.ts:909-910). |
| Subscription | modelLock decides whether a row is locked by plan, environment or availability (ComposerFooter.tsx:1190-1200, 1289-1296); on Free the model resets to a free one when the lock applies (ComposerFooter.tsx:1349-1351). |
| Limits and metering | Switching never blocks; a note says the prompt cache restarts and prior context is billed again at input price (comment at ComposerFooter.tsx:1058-1062; test ComposerFooter.model-switch-note.test.tsx). Mobile provider switch mid-chat can need a higher plan (ModelPickerSheet.tsx:490-499). |
| Feature flags | none found in the code. |
| Model compatibility | Findings for images, attachments, tools and context size, with 'unknown_model' ignored (ComposerFooter.tsx:1180-1184). VS Code describes capability losses (modelConstants.ts:347; commandSetup.ts:1359-1370). |
| Provider restrictions | VS Code refuses a switch across a trust boundary inside a chat (commandSetup.ts:1334-1339). Web refuses Regenerate across Local to BYOK (WebChatPage.tsx:5748-5760). |
| Local mode | Web and Desktop: a local selection is kept in memory only; leaving it after local answers needs a new chat (useLeaveLocalModel.tsx). Mobile: local models need the download and runtime state to be ready before selection (ModelPickerSheet.tsx:510-529). CLI: Local rows are never locked (model_picker.rs:196-214). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Same model chosen | Picker closes, no save. | ComposerFooter.tsx:1177-1180 |
| Save failure | Toast; previous model stays. | ComposerFooter.tsx:1155-1163 |
| Double pick while saving | Ignored; trigger disabled. | ComposerFooter.tsx:1148-1149, 1483 |
| Stored model no longer valid | Web repairs to a known model; Mobile falls back; Chrome resets to Auto. | model-store.ts:398-409; store.ts:317-345; managedModelPicker.ts:275-287 |
| Unsupported mix (images, tools, context) | Web warning panel; VS Code modal; Mobile and CLI none. | ComposerFooter.tsx:1533-1567; commandSetup.ts:1359-1370 |
| Cancel the warning | 'Keep <current>' leaves the model unchanged. | ComposerFooter.tsx:1560-1566 |
| Model download needed (Mobile) | Confirm download, then select once ready; failures can be retried. | ModelPickerSheet.tsx:513-529 |
| Offline | Web conversation save fails and shows the toast; local-only changes stay. | ComposerFooter.tsx:1155-1163 [inferred for offline] |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/stores/model-store.test.ts`: Rehydration repair, same-version stale ids, stale setter values.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.model-switch-note.test.tsx`: Switch commits without a dialog when a cache exists; cache note in the picker.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.dead-control.test.tsx`: A row the composer cannot hold is refused with a reason.
- `apps/mobile/__tests__/NewChatModelChoice.test.tsx`: New-chat choice survives opening another conversation; conversation keeps its own model.
- `apps/extension/__tests__/model-selection-storage-key.test.ts`: Chrome saves the choice, restores it, keeps it across New Chat, resets on a real owner change.
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: selectModel messages (name only; contents not read).
- `apps/extension-vscode/src/__tests__/modelPickerReachability.test.ts`: Unreachable and boundary-refused quick pick items.

**Test scenarios**

- **Conversation keeps its model (Web)**
  1. In chat A pick model X, in chat B pick model Y.
  2. Switch back to chat A.
  - Expected: Chat A shows X; chat B shows Y; reload keeps both.
- **Save failure**
  1. Block PUT /api/chat/conversations/{id}.
  2. Pick another model in a saved chat.
  - Expected: Toast 'Could not save the model for this conversation. The previous model remains active.'
- **Incompatible switch**
  1. Attach an image in a chat.
  2. Pick a model that cannot read images.
  - Expected: Warning panel with Switch anyway and Keep <model>.
- **Leave a local model**
  1. On Desktop, get an answer from a local model.
  2. Pick a cloud model.
  - Expected: Dialog 'Start a new chat for a cloud model?'; confirming opens a new chat.
- **CLI switch**
  1. Run /model, choose another model, Enter, then ask a question.
  - Expected: Banner 'Model changed to ...'; the header shows the new model.
- **VS Code scopes**
  1. With no chat open pick a model; open a chat and pick another.
  - Expected: First changes the default, second only the chat.

**Where to look when it fails**

- Web network: PUT /api/chat/conversations/{id} response and validation error 'Select a model together with its provider route'.
- Browser storage agi-model-store.
- CLI chat line 'Model switch failed: <reason>' (tui_app.rs:5099).
- VS Code information or warning messages from commandSetup.ts:1334-1378.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **No incompatibility dialog on Mobile or the CLI.** Affects: Mobile and CLI users who switch mid-chat. Evidence: Brief S15.34 lists Mobile and CLI missing; no check in ModelPickerSheet.tsx:443-563 or model_picker.rs:769-798. Work needed: Add a shared compatibility check and a confirm step.
- **CLI model choice is not persisted outside the session in the code read.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:5073-5109. Work needed: Confirm and decide on saving or a flag.
- **Desktop local model choice is lost on reload.** Affects: Desktop. Evidence: apps/web/features/desktop-host/lib/local-model-selection.ts. Work needed: Decide per-chat persistence consistent with the trust rules.
- **Chrome applies a regenerate-with-model as a lasting choice.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts:6017-6032, 9595. Work needed: Separate a one-turn choice from the stored choice if one-turn is wanted.
- **The draft's cited lines for commit and same-model checks were stale.** Affects: Documentation. Evidence: Real lines are ComposerFooter.tsx:1141-1195. Work needed: Use the lines in this page.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F015-01
- F015-02
- api:PUT /api/chat/conversations/{id}
- table:web_conversations

## Unknown

- Where the compatibility evaluator is implemented and its full rule list (imported in ComposerFooter.tsx, file not opened).
- Whether the CLI writes the chosen model to config or a session record on exit.
- Whether a Desktop reload really resets a local choice in the packaged app (store has no persistence, not run).
- Whether Mobile syncs a local-mode chat model off the device (local store only in the code read: chatMessageStore.ts:935-942).
