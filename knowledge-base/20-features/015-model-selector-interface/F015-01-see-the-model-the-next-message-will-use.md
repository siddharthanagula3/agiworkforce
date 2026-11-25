---
id: "F015-01"
type: "feature"
title: "See the model the next message will use"
aliases: ["See the model the next message will use", "Current-model label (brief S15.01)", "model trigger / model chip in the composer footer (Web, Desktop)", "ModelSelectorButton, testID chat.composer.model (Mobile)", "model pill, element id modelPill (VS Code)", "model badge and model selector button (Chrome side panel)", "Model line in the CLI header"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S15.01"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "F015-02", "F015-05", "store:agi-model-store", "store:model-store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-01 See the model the next message will use

Every app shows, next to the message box, the name of the model that will answer the next message. On Web and Desktop it also names a local model and says nothing leaves the device. Auto shows its routing label. It is a label that opens the picker, not a separate control.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.01](../../10-requirements/capabilities/015-model-selector-interface.md#s1501).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the active model on the control that opens the model picker (Web and Desktop composer footer, Mobile composer button, VS Code model pill, Chrome side panel button) and as a text line in the CLI header, so the person can read what will answer before sending.

**Why it exists.** A person who switches models, or who lets Auto choose, must be able to see the current choice without opening anything. The founder decision puts the picker on the composer, with the model name on it (doc: docs/decisions/2026-11-12-founder-decisions.md, D-2026-11-12-04).

**Who uses it.** Every signed-in or signed-out person who chats on any of the six apps, and testers checking that the label matches what the turn really used.

**Problems it solves**

- Surprise about which model answered or what it costs.
- Not knowing that a local model is active and the chat stays on the device.
- Not knowing that Auto is on and may change the model per message.

**Use cases**

- A Web user opens a saved chat and sees the model that chat was saved with in the trigger.
- A Desktop user picks a model on this computer and sees its name with a Local badge.
- A Mobile user glances at the composer to see whether fast mode is on.
- A CLI user reads the header to confirm the model after /model.

## 2. User experience

**Where to find it**

- Web and Desktop: the model trigger button in the composer footer; its accessible name is '<model name> [Local|Free], change model' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1459-1483). Desktop shows the hosted web app (doc: AGENTS.md section 5).
- Mobile: the button above the chat input with accessibility label 'Model: <name>' and hint 'Opens the model picker' (apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:54-56, used at apps/mobile/src/features/chat/components/ChatInput.tsx:2236).
- CLI: the model name in bold in the header bar, with the context window in brackets (apps/cli/src/tui/tui_app.rs:2460-2470); the start panel line 'Model' with the access mode (apps/cli/src/tui/tui_app.rs:2783-2791).
- VS Code: the pill button titled 'Model' in the chat view, first text 'Auto' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3361); the Select Model quick pick shows 'Current: <name>' (apps/extension-vscode/src/core/commandSetup.ts:1323).
- Chrome: the model selector button in the side panel with a model badge and an effort badge (apps/extension/src/side_panel.ts:11376-11395).

**Before you start**

- None to see the label on any app. On Web the label shows the plan-correct model only once the plan is known; before that the picker treats the plan as unknown (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1033-1048).
- Chrome needs a signed-in managed account to list more than Auto; signed out it shows Auto and a note (apps/extension/src/side_panel.ts:11234-11236).

**Screens and controls**

- Web and Desktop: provider logo (or a monitor icon for a local model), name, optional badge 'Local' or 'Free', chevron. The name and chevron hide when the composer is narrower than 26rem; the accessible name stays (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1459-1535).
- Web and Desktop hover tooltip: the name plus one receipt line (ComposerFooter.tsx:1274-1278, 1522-1526). The same receipt is in a screen-reader-only span (ComposerFooter.tsx:1451-1455).
- Web locked trigger when lockModelSelector is true: shows the best Auto model for the plan with a trial suffix; clicking asks to upgrade (ComposerFooter.tsx:1438-1449).
- Mobile: model name in small text; a second word 'Fast' when fast mode is on and allowed (ModelSelectorButton.tsx:72-85).
- CLI: header text only; the start panel adds the access mode and the hint 'Choose Local, Your key, or Managed with /model.' (apps/cli/src/tui/tui_app.rs:2798-2800).

**Journey**

1. Open a chat on any app.
2. Read the model label on the composer (or header on the CLI).
3. Optionally hover (Web, Desktop) to read the receipt line, or tap/click the label to open the picker (see F015-02).
4. Pick another model (F015-05) and read the label change.
5. Send; the answer is produced by the model shown (Auto shows its profile label, and the real model is disclosed per answer, outside this feature).

**What the person sees and gets**

- Receipt text on Web and Desktop: for a local model '<server> on this device · nothing leaves this Mac'; for Auto the continuity line 'Stays on <name> for this chat' when the chat already has a saved model, otherwise 'Picks the best model for each message'; otherwise '<provider> · <description>' (ComposerFooter.tsx:205, 213, 1274-1278).
- While a conversation model is being saved the label reads 'Saving…' and the button is disabled (ComposerFooter.tsx:1483-1505).
- Mobile accessibility label becomes 'Model: <name>, fast mode on' when fast is on (ModelSelectorButton.tsx:54).

**Settings**

- Web and Desktop: Settings > General > Default model sets the model a new chat starts with (see F015-04).
- Mobile: haptics setting controls the tap feedback (ModelSelectorButton.tsx:33-35).
- VS Code: setting agiWorkforce.model (apps/extension-vscode/package.json:1219-1223).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop: label = local model name, else the Auto routing profile label when Auto is chosen with a non-default profile, else the selected model name (ComposerFooter.tsx:1005-1010, 1459-1460).
- Web: a stale or unknown stored model is repaired to a known one on load (apps/web/shared/stores/model-store.ts:368-371, 398-409; test apps/web/shared/stores/model-store.test.ts).
- Mobile: label from the persisted model store through getShortDisplayName; an unknown id shows a fixed unknown label (apps/mobile/src/features/model-picker/service.ts:387-392).
- CLI: header model name follows the session after every switch through sync_stats (apps/cli/src/tui/tui_app.rs:1052-1059).
- VS Code: the model message updates the pill when the active model changes (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1214-1226).
- Chrome: badge and aria label are rebuilt from the selected model on every picker refresh (apps/extension/src/side_panel.ts:11376-11400).

**Incomplete**

- CLI header prints the session model id, not a display name (apps/cli/src/tui/tui_app.rs:1054, 2460-2463) [inferred].
- The local-model reassurance text is in the tooltip and screen-reader receipt only, not in the visible label (ComposerFooter.tsx:1274-1275, 1459-1460).
- The Web label is hidden when the composer is under 26rem wide (ComposerFooter.tsx:1520ish class list); only the accessible name remains [inferred from the @max-[26rem]:hidden classes at ComposerFooter.tsx:1480-1535].

**Present but disconnected or switched off**

- On Web the locked trigger variant is shown only when a parent passes lockModelSelector (ComposerFooter.tsx:826, 853, 1438); which pages pass it was not traced.

**Not available**

- Desktop built from the retained internal Tauri code was not checked; apps/desktop/src/features/v3/DesktopShellV3.tsx references a picker (unverified).

## 4. Required behaviour

**Established requirements**

- The composer always shows the name of the model the next message will use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.01)
- The model is chosen from the composer, and tapping the model name opens the picker. (source: doc: docs/decisions/2026-11-12-founder-decisions.md (D-2026-11-12-04))
- The selector shows display name, provider, runtime availability, plan lock and the Auto route profile and its resulting model; no surface owns a model list. (source: doc: docs/product/experience-contract.md section 7.3)
- When a local model is active the label names the local server and says nothing leaves the device. (source: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274-1275)

**Acceptance criteria**

1. After choosing a model, the trigger on Web, Desktop, Mobile, VS Code and Chrome shows that model's name, and the CLI header shows it after /model.
2. With a local model chosen on Desktop, the trigger shows its name with the badge Local and the tooltip says the answer stays on this computer.
3. With Auto chosen on Web with a paid plan, the tooltip shows 'Picks the best model for each message', or 'Stays on <name> for this chat' in a chat that already has a saved model.
4. Reloading the Web page keeps the label equal to the stored selection, and a retired stored model is replaced by a known one.
5. On Mobile with fast mode on and allowed, the button reads the name plus 'Fast'.
6. While a conversation model save is pending on Web, the trigger shows 'Saving…' and cannot be pressed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The visible label should name the data boundary on every surface, not only in a tooltip [inferred from doc: AGENTS.md section 6, visible provider label for any boundary move].
- The label should be the same model the request actually carries; no test compares the label to the request payload [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a short 'On this device' word beside a local model name on Web and Desktop, not only in the tooltip.
- [proposed] Show the model display name, not the id, in the CLI header.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFooter model trigger | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Builds the trigger label, badge, tooltip receipt and locked variant for Web and Desktop (lines 1274-1278, 1438-1535). |
| store | useModelStore | `apps/web/shared/stores/model-store.ts` | Holds selectedModelId and routingProfile; repairs stale ids on load (lines 331-412). |
| store | useLocalModelSelection | `apps/web/features/desktop-host/lib/local-model-selection.ts` | In-memory selected on-device model; not persisted by design. |
| hook | useLocalModels | `apps/web/features/desktop-host/hooks/use-local-models.ts` | Reads the local servers and models from the desktop host. |
| component | ModelSelectorButton | `apps/mobile/src/features/chat/components/ModelSelectorButton.tsx` | Mobile composer button with name, Fast token and accessibility text. |
| service | getShortDisplayName | `apps/mobile/src/features/model-picker/service.ts` | Maps the stored model id to the label (line 387). |
| store | Mobile useModelStore | `apps/mobile/src/features/model-picker/store.ts` | Persisted selected model for Mobile (key model-store, line 316). |
| screen | CLI header and start panel | `apps/cli/src/tui/tui_app.rs` | Renders the model name in the header (2460-2470) and the start panel (2783-2791); sync_stats updates it (1052-1059). |
| component | VS Code model pill | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Pill button element modelPill (line 3361). |
| service | VS Code ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Posts the model message that updates the pill (lines 1199-1226). |
| component | Chrome model trigger | `apps/extension/src/side_panel.ts` | renderModelTrigger builds badge, effort badge and aria label (lines 11376-11395). |
| service | Chrome managedModelPicker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | getManagedModelBadgeLabel returns the label text (lines 289-292). |
| test | model-store tests | `apps/web/shared/stores/model-store.test.ts` | Covers rehydration repair of stale models. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web and Desktop read selectedModelId and routingProfile from the model store, which was loaded from browser storage. | device | apps/web/shared/stores/model-store.ts:376-384, 398-409 |
| The footer resolves the label, the badge, and the receipt text and draws the trigger. | device | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274-1278, 1459-1535 |
| On Desktop the local server list comes from the desktop host; the model names stay hidden until the person allows local models. | device | apps/web/features/desktop-host/hooks/use-local-models.ts (comment above useLocalModels) and ComposerFooter.tsx:1126-1131 |
| When the plan is not yet known the footer waits on the billing store; plan data comes from our servers. | our servers | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1033-1048 |
| Mobile reads the persisted store and draws the button; no network call. | device | apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:22-29 |
| CLI renders the session model in the header on every frame. | device | apps/cli/src/tui/tui_app.rs:2460-2463 |
| Chrome restores the stored selection from extension storage on load and draws the badge. | device | apps/extension/src/side_panel.ts:11487-11500 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected model id, selected provider, route id, routing profile (Web) | Browser local storage key agi-model-store, version 6 | No; per browser (apps/web/shared/stores/model-store.ts:376-384) | Stays until browser data is cleared; stale ids are repaired on load |
| Selected model (Mobile) | Device storage through MMKV, store name model-store | Not as a selection; only favourites sync, in Cloud mode (apps/mobile/src/features/model-picker/useFavouritesSync.ts:62-67) | Kept on device until the app data is cleared |
| Selected model (Chrome) | chrome.storage.local, key held in SELECTED_MODEL_STORAGE_KEY | No evidence of sync | Removed when the managed account owner changes (apps/extension/src/side_panel.ts:1991-1993) |

**Models and providers.** The label is read from the shared catalogue helpers (provider and name). It never calls a provider. A local model's label comes from the local server list, not the catalogue (apps/web/features/desktop-host/lib/local-model-selection.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is needed to see the label. Cloud models need sign-in to be usable; the label still shows. |
| Permissions | On Desktop, local model names appear only after the person allows local models ('Use models on this device', ComposerFooter.tsx:204-216 area and apps/web/features/desktop-host/hooks/use-local-models.ts). |
| Subscription | On Web, a Free plan sees a different set (free models) and cannot keep Auto selected: Auto is reset to the free default (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1346-1348). |
| Limits and metering | none found in the code for the label itself. |
| Feature flags | Web: useFreeLaneUiEnabled changes the locked-trigger text to a free-lane phrase (ComposerFooter.tsx:1196-1206 region); other flags none found. |
| Model compatibility | The label shows any selectable model; compatibility checks happen at switch time (F015-05). |
| Provider restrictions | Chrome shows only models the managed account admits (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:100-111). |
| Local mode | Web and Desktop: a local model shows its name, a Local badge and the tooltip 'nothing leaves this Mac'; the choice is not persisted (local-model-selection.ts). Mobile: the default model is an on-device model (apps/mobile/src/features/model-picker/store.ts:167-168). CLI: Local models are never plan-locked (apps/cli/src/tui/widgets/model_picker.rs:196-214). VS Code: local routes come from host models (apps/extension-vscode/src/core/commandSetup.ts:1311). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading before hydration (Web) | Uses an initial model until the store hydrates, so server and browser markup match. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1020-1023 (hydrated ? getSelectedModel() : initialSelectedModel()) |
| Unknown or retired stored model | Web repairs it on load; Mobile falls back to a selectable id; Chrome resets to Auto when the account does not admit it. | apps/web/shared/stores/model-store.ts:398-409; apps/mobile/src/features/model-picker/store.ts:317-345; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:275-287 |
| Saving a conversation model | Label 'Saving…' and button disabled. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1483-1505 |
| Narrow composer (Web) | Name and chevron are hidden; accessible name stays; no truncation tooltip beyond the standard one. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1480-1535 |
| Offline | not handled in the code for the label; it reads stored state. | apps/web/shared/stores/model-store.ts:376-384 |
| Screen reader | Web has an accessible name and a hidden receipt; Mobile has label and hint; VS Code and Chrome set aria labels. | ComposerFooter.tsx:1451-1455, 1483-1484; ModelSelectorButton.tsx:54-56; side_panel.ts:11394 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/stores/model-store.test.ts`: Rehydration repair of unknown or stale selected models and store boundary checks.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx`: Picker rows, check on the selected row, and badges for the Web composer footer.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.billing-readiness.test.tsx`: Footer behaviour while the plan is not yet known (name only; content not read in detail).
- `apps/extension/__tests__/model-selection-storage-key.test.ts`: Chrome persists the choice, restores it on load, and keeps it across New Chat.
- `apps/mobile/__tests__/NewChatModelChoice.test.tsx`: Which model shows on the new-chat screen after a conversation with another model.

**Test scenarios**

- **Label follows a pick (Web)**
  1. Sign in on a paid plan.
  2. Open the picker and pick another model.
  3. Read the trigger and reload the page.
  - Expected: The trigger shows the new name before and after reload.
- **Local model label (Desktop)**
  1. Run the Desktop app with a local server running.
  2. Allow local models, pick one from On this device.
  3. Hover the trigger.
  - Expected: Trigger shows the name and Local; tooltip names the server and says nothing leaves this computer.
- **Auto continuity**
  1. Open a saved chat with a saved model on a paid plan.
  2. Choose Auto.
  3. Hover the trigger.
  - Expected: Tooltip reads 'Stays on <saved model name> for this chat'.
- **Fast token (Mobile)**
  1. Choose a model that offers fast mode.
  2. Turn fast mode on.
  3. Read the button.
  - Expected: Name plus 'Fast'; accessibility label says fast mode on.
- **CLI header**
  1. Start the CLI.
  2. Run /model, choose a model, press Enter.
  3. Read the header.
  - Expected: Header shows the chosen model and a system line 'Model changed to ...' appears.

**Where to look when it fails**

- Web: browser storage key agi-model-store; React state in ComposerFooter.
- Mobile: MMKV store model-store.
- CLI: system chat line 'Model switch failed: ...' (apps/cli/src/tui/tui_app.rs:5099).
- Chrome: chrome.storage.local selected-model key.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **The local-model reassurance is only in the tooltip and hidden receipt, not in the visible label.** Affects: Web and Desktop users with a local model. Evidence: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274-1275, 1459-1460. Work needed: Decide whether the visible Local badge is enough, or add visible boundary text.
- **The CLI header shows the model id, not the display name.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:1054, 2460-2463. Work needed: Resolve the display name from the catalogue for the header.
- **No test compares the label to the model actually sent in the request.** Affects: All apps. Evidence: No such test found in the folders searched. Work needed: Add a test per app that reads the request model after a pick.
- **Desktop internal Tauri build was not inspected.** Affects: Retained internal Desktop. Evidence: apps/desktop/src/features/v3/DesktopShellV3.tsx lists a picker; behaviour not read. Work needed: Read it or mark it out of scope.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- F015-02
- F015-05
- store:agi-model-store
- store:model-store

## Unknown

- Which Web pages pass lockModelSelector and show the locked trigger.
- Whether the Tauri Desktop shell shows the model name on its composer.
- Exact visible label text of the Chrome trigger beyond the badge function (localised strings not read).
- Whether VS Code pill text is replaced with a display name or an id after the first model message.
