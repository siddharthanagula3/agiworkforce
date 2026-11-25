---
id: "F015-12"
type: "feature"
title: "Switch safety, fallback and substitution notices"
aliases: ["Model-switch incompatibility dialog", "Switch anyway", "Compatibility notice", "Preserve or remove attachments", "Use Auto / Remove attachments / Choose a compatible model", "Fallback disclosure", "Substitution notice", "Falling back banner", "Auto chose <model>", "Prompt cache note"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S15.32", "S15.33", "S15.34", "S15.35"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:POST /api/llm/v1/chat/completions", "file:packages/contracts/types/src/chat-fallback-reason.ts", "file:packages/ai/routing/src/model-switch-cache.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-12 Switch safety, fallback and substitution notices

Protects a person from silent surprises when the model changes. Web and Desktop warn before a switch that would lose images, tools or context, offer Use Auto, Remove attachments or Choose a compatible model for unreadable files, note the prompt-cache reset, and say when another model answered. VS Code has a switch dialog. Mobile and CLI disclose fallbacks.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.32](../../10-requirements/capabilities/015-model-selector-interface.md#s1532), [S15.33](../../10-requirements/capabilities/015-model-selector-interface.md#s1533), [S15.34](../../10-requirements/capabilities/015-model-selector-interface.md#s1534), [S15.35](../../10-requirements/capabilities/015-model-selector-interface.md#s1535).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Checks whether the next model can handle the current chat, asks before a lossy switch, blocks sending attachments the model cannot read until the person chooses, and tells the person which model actually answered and why.

**Why it exists.** Switching models can drop images, disable tools or trim history; fallbacks can put a different model behind an answer. The shared rule is that a substitution is disclosed, never silent (packages/contracts/types/src/chat-fallback-reason.ts:23-28), and the selector must show provider and routing provenance (doc: docs/product/experience-contract.md sections 7.3 and 8.1).

**Who uses it.** Anyone switching models in a long chat or sending files; anyone whose preferred model failed.

**Problems it solves**

- Losing images or tools after a switch without knowing.
- Sending a file to a model that cannot read it.
- Not knowing which model produced an answer after a failure or limit.
- Unexpected extra cost when the prompt cache resets.

**Use cases**

- Switch a chat with pasted images to a text-only model: Web shows 'Switch to <model>?' with reasons and 'Switch anyway'.
- Attach a PDF to a model that cannot read it: Web shows 'Use Auto', 'Remove attachments', 'Choose a compatible model'.
- The chosen model is down: the reply says it came from a backup model and why.
- In VS Code, switching to a model with a smaller window shows a modal listing what is lost.

## 2. User experience

**Where to find it**

- Web and Desktop switch panel inside the model menu: 'Switch to <model>?' and 'Switch anyway' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:878-881,1540-1565); notice area 'Model compatibility' (ModelCompatibilityNotice.tsx:3,19-39; ComposerFooter.tsx:1756-1760); cache hint 'Switching models here starts a new prompt cache' (157,1761-1765).
- Web attachment conflict card in the composer with 'Use Auto' (or 'Use Free Auto'), 'Remove attachments', 'Choose a compatible model' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1554-1593,5434-5500).
- Web message notice with 'Dismiss' under an answer (apps/web/features/chat/components/messages/MessageBubble.tsx:837-840,3515-3535); an 'Auto chose <model>' label and the model name in the message menu (2397-2415,3973-3975).
- Mobile: notice above the composer when images cannot be read (apps/mobile/src/features/chat/components/ChatInput.tsx:544,1749-1760); dismissible notice under an answer (MessageBubble.tsx:1036-1041,3011-3025); 'Auto chose <model>' (MessageBubble.tsx:820).
- CLI: 5 second banner ' ↘ Falling back: <from> → <to> (<reason>)' (apps/cli/src/tui/tui_app.rs:639-646,1018-1040,3324-3352); 'Auto chose <model> for this message' (apps/cli/src/agent/chat.rs:938).
- VS Code: modal 'Switch to <model>?' with 'Switch anyway' (apps/extension-vscode/src/core/commandSetup.ts:246,1359-1371).

**Before you start**

- Web: a chat with history, staged images or files, or armed tools gives the check something to compare (ComposerFooter.tsx:1060-1105).
- A catalogue entry for the target model; unknown models cannot be checked (model-compatibility.ts:158-172).

**Screens and controls**

- Web findings: context overflow, cannot read images, cannot call tools, no attachments (model-compatibility.ts:55-61).
- Web attachment card text names image, document or both (ChatComposerNew.tsx:5441-5450).
- VS Code lists losses: cannot use tools, cannot read images, smaller context (modelConstants.ts:347-372).

**Journey**

1. Choose a different model or attach a file.
2. Web: if findings exist, read the panel and press 'Switch anyway' or leave the menu; for files, choose Use Auto, Remove attachments or a compatible model.
3. Send.
4. If the server used another model, read the notice under the answer; Dismiss hides it for that message.

**What the person sees and gets**

- Web notice texts come from describeFallbackReason, for example 'The model you picked was unavailable, so this reply came from <model>.' (packages/contracts/types/src/chat-fallback-reason.ts:135-177).
- Web disclosure is repeated in the picker for the last served turn (ComposerFooter.tsx:1114-1127; test ComposerFooter.modelSwitch.test.tsx:197).
- CLI shows the banner for 5 seconds.

**Settings**

- none found for these notices; Dismiss is per message.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web check of context budget, vision, tools and attachments with blocking findings except unknown model (model-compatibility.ts:97-207; ComposerFooter.tsx:1171-1190).
- Web 'Switch anyway' commits; leaving the menu keeps the current model (ComposerFooter.tsx:1540-1565; test ComposerFooter.modelSwitch.test.tsx:153-168).
- Web attachment conflict blocks send until resolved (ChatComposerNew.tsx:3593) with Use Auto, Remove, Choose compatible model (5434-5500).
- Web cache note appears only when a completed assistant turn exists, and the switch is not blocked (ComposerFooter.tsx:1061-1075,1761-1765; routing/src/model-switch-cache.ts:21-26; test ComposerFooter.model-switch-note.test.tsx).
- Server sets X-AGI-Resolved-Model and the fallback reason header (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:960-968); Web stores the reason on the message (lib/hooks/useChatStream.ts:1991-2062) and renders it (MessageBubble.tsx:3515-3535).
- Mobile reads the same headers and shows a dismissible notice (services/streaming.ts:746; src/features/chat/utils/fallbackNotice.ts:14-34).
- Mobile pre-send image notice, naming the model that will answer when Auto reroutes (unreadableImagesNotice.ts:14-36).
- CLI fallback banner and Auto choice message (tui_app.rs:1018-1040,3324-3352; agent/chat.rs:938).
- VS Code compares the old and new model's tools, vision and context and asks first (modelConstants.ts:347-372; commandSetup.ts:1359-1371); also offers unlock, refuses boundary crossing (commandSetup.ts:1334-1357).

**Incomplete**

- VS Code compares model against model, not against this conversation's real contents, so it can warn about a loss that does not apply or miss one that does (modelConstants.ts:347-372) [inferred].
- Mobile has no switch dialog and no attachment keep-or-remove choice; it warns about images only (ChatInput.tsx:1749-1760).
- CLI switches with a one-line banner and no check (tui_app.rs:5073-5100).
- Web 'keep them on a capable model' is offered as Use Auto or Choose a compatible model, and Remove attachments, not as a single combined step.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Chrome: no switch dialog, no attachment choice; fallback disclosure not found. Its selection reset to Auto when a model is no longer admitted happens without a message found (managedModelPicker.ts:275-287).
- VS Code: no fallback disclosure found; Mobile: no cache-reset note; CLI: no cache note or compatibility check found.

## 4. Required behaviour

**Established requirements**

- Each answer shows which model actually produced it. (source: brief S15.32 (web, desktop, mobile, cli, api done; vscode, chrome missing))
- When a different model answered because the chosen one failed or was unavailable, the answer says so and why. (source: brief S15.33 (web, desktop, cli, api done; mobile missing in the brief but code has it))
- Switching to a model that cannot handle the conversation asks for confirmation and explains what is lost. (source: brief S15.34 (web, desktop, vscode done; mobile, cli, chrome missing))
- When the chosen model cannot read attached files, the user can keep them (switching to a model that can) or remove them. (source: brief S15.35 (web, desktop done; others missing))
- A substitution must be disclosed with a reason; an unlabelled fallback still carries a code. (source: packages/contracts/types/src/chat-fallback-reason.ts:23-28)
- Provider, model and routing provenance are shown in transcripts. (source: doc: docs/product/experience-contract.md section 8.1)

**Acceptance criteria**

1. Switching a chat that holds images to a model without vision shows a panel naming that images will be ignored, and 'Switch anyway' commits while leaving the menu does not.
2. A conversation larger than the target model's budget shows the context-overflow finding with both sizes.
3. An unknown target model shows no blocking panel.
4. With staged attachments the model cannot read, Send is blocked until one of Use Auto, Remove attachments or a compatible choice is taken.
5. After a server fallback, the answer carries a notice naming the served model and reason, and the picker repeats it.
6. The CLI banner shows both model names and the reason and disappears after about 5 seconds.
7. In VS Code, switching from a tool-capable to a tool-less model shows a modal that lists the loss and requires 'Switch anyway'.
8. The notice text never names a supplier or route id.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and CLI should offer a switch check to meet the brief's S15.34 intent [inferred].
- Chrome's silent reset to Auto should say so [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share one compatibility function across apps instead of Web's message-aware check and VS Code's model-to-model check.
- [proposed] Add a cache-reset note to Mobile and CLI, using routing/src/model-switch-cache.ts.
- [proposed] Add a one-time notice when Chrome resets a stale selection.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | evaluateModelCompatibility | `apps/web/features/chat/components/Composer/model-compatibility.ts` | Findings and context budget (42-207). |
| component | ComposerFooter switch flow | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | handleSelectModel (1171), pendingSwitch panel (878,1540-1565), substitution notice (1114), cache hint (1761). |
| component | ModelCompatibilityNotice | `apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx` | Status region with findings and substitution text. |
| component | Attachment conflict card | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Detection (1554-1593), send block (3593), UI (5434-5500). |
| service | model switch cache policy | `packages/ai/routing/src/model-switch-cache.ts` | priorTurnsHoldCache and assessModelSwitchCache. |
| service | fallback reason codes and text | `packages/contracts/types/src/chat-fallback-reason.ts` | Headers, reason codes, describeFallbackReason, step labels. |
| service | Web re-export | `apps/web/lib/chat-fallback-reason.ts` | Re-exports the shared module. |
| service | server header writer | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Resolved-model, fallback and escalation headers (960-968). |
| hook | useChatStream header reader | `apps/web/lib/hooks/useChatStream.ts` | Reads fallback and moved headers, saves on the message (1988-2062). |
| component | MessageBubble notice | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Fallback notice, escalation receipt, answered-by label (829-840,2397-2415,3510-3535). |
| hook | useLeaveLocalModel | `apps/web/features/chat/hooks/useLeaveLocalModel.tsx` | Fork consent when leaving a local model. |
| service | Mobile fallbackNotice | `apps/mobile/src/features/chat/utils/fallbackNotice.ts` | Reads headers and builds notice text. |
| service | Mobile unreadableImagesNotice | `apps/mobile/src/features/chat/utils/unreadableImagesNotice.ts` | Pre-send image notice. |
| component | CLI fallback banner | `apps/cli/src/tui/tui_app.rs` | FallbackBanner struct and rendering (639-646,1018-1040,3324-3352). |
| service | VS Code describeModelSwitchLosses | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Loss list (347-372). |
| command | VS Code selectModel dialog | `apps/extension-vscode/src/core/commandSetup.ts` | Modal with Switch anyway (1359-1371). |
| test | model-compatibility test | `apps/web/features/chat/components/Composer/model-compatibility.test.ts` | Budget, image parts, free-model messages. |
| test | fallback reason test | `apps/web/lib/chat-fallback-reason.test.ts` | Header values and wording. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a model; Web estimates the chat's tokens and checks vision, tools and attachments against the catalogue entry. | device | model-compatibility.ts:97-207; ComposerFooter.tsx:1171-1190 |
| If blocking findings exist, the panel waits for 'Switch anyway'; otherwise the switch is saved for the chat. | device and our servers | ComposerFooter.tsx:1143-1170 (commitModel calls onModelChange) |
| On send, the server may trim history and may answer from another model; it writes resolved-model and fallback-reason headers. | our servers | stream-transform.ts:960-968; request-processor.model-compatibility.test.ts exists for the server check |
| Client reads headers, stores the reason on the message and shows the notice; the picker repeats the last served turn's reason. | device | useChatStream.ts:1991-2062; ComposerFooter.tsx:1114-1127 |
| CLI receives a fallback callback from the send loop and shows the banner. | device | tui_app.rs:1018-1031 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Fallback reason and served model | On the message record (Web message metadata fallbackReason; Mobile message metadata) | Web conversation messages sync with the account; Mobile local conversation store (sync not traced) | Kept with the message; Dismiss hides it in the view only |

**Models and providers.** The check uses catalogue capability and limits; fallback reasons are codes (managed failover, route failover, insufficient credits, free limit, free capacity, free-model handoffs, unspecified) that are written as text with the served model's display name. The text never names a supplier.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web check needs no account beyond the catalogue; the server fallback applies to managed cloud turns. |
| Permissions | none found in the code. |
| Subscription | Fallback reasons 'insufficient_credits', 'free_limit_reached' and 'free_capacity_unavailable' come from plan and credit rules (chat-fallback-reason.ts:43-52,152-167). The attachment card changes its Auto label to 'Use Free Auto' on the free promotional model (ChatComposerNew.tsx:5456-5460). |
| Limits and metering | Switching models resets the prompt cache and re-bills prior context at the new model's input rate (ComposerFooter.tsx:1050-1058 comment); the note shows when a completed turn exists. |
| Feature flags | none found in the code for these notices. |
| Model compatibility | Findings come from catalogue vision, tools, context window and max output (model-compatibility.ts:175-198). Free promotional models use route-specific limits (model-compatibility.ts:101-146). |
| Provider restrictions | Notices avoid supplier names; a route failover is described as 'a backup route' (chat-fallback-reason.ts:148-151). |
| Local mode | Leaving a local model after local turns forks the chat with consent (useLeaveLocalModel.tsx). The compatibility check treats a local selection by forking first (ComposerFooter.tsx:1172-1175). CLI fallback in Local mode: the banner appears for any fallback sink call; the provider list is not checked. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown model | Finding 'unknown_model' is shown but does not block. | model-compatibility.ts:158-172; ComposerFooter.tsx:1182-1183 |
| Auto selected | No findings; Auto resolves per message. | model-compatibility.ts:147-155 |
| Save of the new model fails | Toast 'Could not save the model for this conversation. The previous model remains active.' | ComposerFooter.tsx:1150-1165 |
| Switch already pending | A second change is ignored while saving; trigger reads 'Saving…'. | ComposerFooter.tsx:1156,1495 |
| Fallback with no recorded cause | Notice says the reason was not recorded. | chat-fallback-reason.ts:168-172 |
| Notice dismissed | Hidden for that message in the view. | MessageBubble.tsx:3515-3535 |
| Accessibility | Notices use role status with an aria-label; Dismiss has a label. | ModelCompatibilityNotice.tsx:19-24; MessageBubble.tsx:3531 |
| Cancel | Closing the menu drops the pending switch (closeModelPopover sets pendingSwitch null). | ComposerFooter.tsx:880-885,934-940 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerFooter.modelSwitch.test.tsx`: Gate on a window too small, commit after warning, decline keeps current, no gate when it fits, substitution disclosure in the picker.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.model-switch-note.test.tsx`: Cache hint appears with a completed turn, none otherwise, no confirmation dialog for it.
- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Context budget, image part cost, free-model attachment and tool messages.
- `apps/web/lib/chat-fallback-reason.test.ts`: Header values, silent ordinary turn, research downgrade, unrecorded cause, requested versus served.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Server side compatibility handling (titles not read).
- `apps/mobile/src/features/chat/utils/__tests__/fallbackNotice.test.ts`: Header reading and notice text on Mobile.
- `apps/mobile/src/features/chat/utils/__tests__/unreadableImagesNotice.test.ts`: Pre-send image notice.
- `apps/cli/src/tui/tui_app.rs`: Inline test that banner frames strip escape sequences (line 12918).
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Composer behaviour; attachment-conflict coverage not confirmed.

**Test scenarios**

- **Lossy switch on Web**
  1. Paste an image in a chat.
  2. Open the model menu and pick a model without vision.
  3. Read the panel; leave the menu; repeat and press 'Switch anyway'.
  - Expected: Panel names the image loss; leaving keeps the model; 'Switch anyway' switches.
- **Unreadable attachment**
  1. Pick a model without file support.
  2. Attach a document and press Send.
  - Expected: Send blocked; card offers Use Auto, Remove attachments, Choose a compatible model; each action clears the card.
- **Server fallback**
  1. Pick a model whose route is degraded.
  2. Send a message.
  - Expected: Answer shows a notice naming the served model and 'The model you picked was unavailable'; picker repeats it.
- **CLI fallback**
  1. Configure a fallback chain.
  2. Force the primary to fail.
  - Expected: Banner 'Falling back: A → B (reason)' for about 5 seconds.
- **VS Code switch**
  1. Pick a tool-capable model.
  2. Select a tool-less one.
  - Expected: Modal lists the loss; 'Switch anyway' required.
- **Cache note**
  1. Complete one turn.
  2. Open the model menu.
  - Expected: Text 'Switching models here starts a new prompt cache' is visible.

**Where to look when it fails**

- Response headers X-AGI-Fallback-Reason and X-AGI-Resolved-Model (chat-fallback-reason.ts:1-2).
- Message metadata fallbackReason in the conversation store.
- Web data attributes data-compatibility-code and data-testid fallback-reason-notice for automation.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **Mobile has no switch dialog or keep-or-remove attachment choice; CLI has no switch check.** Affects: Mobile, CLI. Evidence: ChatInput.tsx:1749-1760; tui_app.rs:5073-5100. Work needed: Decide the shape per surface and implement with shared findings.
- **VS Code compares models, not the real chat, and has no test for the dialog.** Affects: VS Code. Evidence: modelConstants.ts:347-372; no test file references describeModelSwitchLosses. Work needed: Add a test; feed real chat facts.
- **Chrome shows no switch dialog or fallback disclosure and resets stale selections silently.** Affects: Chrome. Evidence: managedModelPicker.ts:275-287. Work needed: Add disclosure.
- **No fallback disclosure found in VS Code; served-model label unverified for VS Code and Chrome.** Affects: VS Code, Chrome. Evidence: Searches of commandSetup.ts, modelConstants.ts, managedModelPicker.ts. Work needed: Verify the chat views; add the shared notice.
- **No test confirmed for the Web attachment conflict card.** Affects: Web, Desktop. Evidence: Test files listed do not name the card; ChatComposerNew.test.tsx not searched in full. Work needed: Add a test for the three actions.
- **Brief line cites are stale (ChatComposerNew.tsx:4017-4059, request-processor.ts, commandSetup.ts:1206).** Affects: Documentation readers. Evidence: Lines opened. Work needed: Refresh the brief.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:POST /api/llm/v1/chat/completions
- file:packages/contracts/types/src/chat-fallback-reason.ts
- file:packages/ai/routing/src/model-switch-cache.ts

## Unknown

- How the server trims history and whether it uses the same budget function as the composer (comment in model-compatibility.ts:42-47; server code not traced).
- Whether Web, Mobile and CLI sync the fallback reason across devices (message sync not traced).
- Whether VS Code and Chrome show the served model on an answer.
- What the CLI does on a fallback in Local mode beyond the shared callback.
- Whether the Web attachment conflict card has a test.
- How the Mobile 'Auto chose' line is shown relative to the fallback notice (only the helper at MessageBubble.tsx:820 was seen).
