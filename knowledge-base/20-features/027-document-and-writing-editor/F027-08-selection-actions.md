---
id: "F027-08"
type: "feature"
title: "Selection actions"
aliases: ["Selection toolbar", "Selection actions", "Edit with AI", "Improve menu", "Rewrite / Make shorter / Make longer", "Change tone", "Adjust for (audience)", "Translate to", "Rewrite selection (Chrome)", "Translate this (Chrome)", "S27.15 to S27.21"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "partial", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S27.15", "S27.16", "S27.17", "S27.18", "S27.19", "S27.20", "S27.21"]
depends_on: ["surface:web", "surface:chrome", "surface:vscode", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "F027-07", "F027-09", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "file:packages/ui/unified-chat/src/lib/artifact-selection-request.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-08 Selection actions

Selection actions let a person select part of a document and ask the assistant to change only that part: rewrite, shorten, lengthen, change tone, adapt for an audience, translate, or describe a change in words. On web the toolbar builds a request and sends it through normal chat; the document changes only when the assistant's new version arrives. Other apps differ.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.15](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2715), [S27.16](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2716), [S27.17](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2717), [S27.18](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2718), [S27.19](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2719), [S27.20](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2720), [S27.21](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2721).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows a small toolbar over selected text in the web artifact side panel with Edit with AI, Improve and Comment. Improve opens a menu of preset instructions. The chosen instruction, the selected text, 400 characters of text on each side and the document title are packed into a chat message asking the assistant to change only that passage and reply with the full updated document (packages/ui/unified-chat/src/lib/artifact-selection-request.ts:103-165).

**Why it exists.** ChatGPT Canvas and Claude artifacts change files by prompt (doc: docs/decisions/2026-09-27-founder-decisions.md:119-122). Selecting a passage is the quickest way to aim that prompt at one place instead of the whole document.

**Who uses it.** Writers, students and professionals editing assistant-written documents and decks in the web app.

**Problems it solves**

- Rewriting a whole document to fix one paragraph
- Typing long instructions to point at a passage
- Keeping the rest of the text exactly as it was

**Use cases**

- Select a long paragraph, choose Improve then Make shorter.
- Select a sentence, choose Improve then Executives to make it lead with the point.
- Select a heading and choose Translate to a language from the supported-language list.
- Select a phrase, choose Edit with AI, type 'make this sound warmer', press the check button.

## 2. User experience

**Where to find it**

- Web (and the Electron desktop window, which shows the hosted web app): select text inside the artifact content area in the side panel. A toolbar labelled 'Selection actions' appears (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:22, 146).
- Chrome: right-click selected page text for 'Translate this'; right-click text in an editable field for 'Rewrite selection' (apps/extension/src/background.ts:7453-7460).
- VS Code: lightbulb code actions on a code selection: 'Refactor with', 'Explain with', 'Generate Tests with' the product's code name (apps/extension-vscode/src/providers/codeActionProvider.ts:37-70). These are for code, not documents.
- Mobile: no selection actions found. Whole-document 'Ask for changes' fills the composer instead (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:147, 328-334, 988-991).
- CLI: no document selection. Tauri desktop shared panel: no selection toolbar code found in packages/ui/unified-chat/src/components/ArtifactPanel.tsx.

**Before you start**

- Web: side-panel variant, a stored artifact, the latest version shown, not in 'Show changes', not in the pick-an-element mode, not PDF/Word/image, content not empty, and the chat must supply the send callback (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2165-2175).
- Chrome rewrite: a signed-in managed-cloud account (apps/extension/src/background.ts:7510-7513).
- The selection must be inside the content area; a collapsed selection shows nothing (ArtifactSelectionToolbar.tsx:43-50).

**Screens and controls**

- Toolbar buttons: 'Edit with AI', 'Improve' (with menu), 'Comment' (only when comments are available) (ArtifactSelectionToolbar.tsx:22-25, 146-348).
- Improve menu groups: 'Edit' (Rewrite, Make shorter, Make longer), 'Change tone' (Professional, Friendly, Confident, Casual, Empathetic), 'Adjust for' (Beginners, Experts, Executives, Students, Children), 'Translate to' (one item per supported language) (packages/ui/unified-chat/src/lib/artifact-selection-request.ts:26-100; apps/web/features/chat/components/artifacts/artifact-selection-request.ts:1-12).
- Edit with AI form: input 'Describe the change...', a check button named 'Send the change request', a 'Cancel' button (ArtifactSelectionToolbar.tsx:23-27, 270-300). Instruction is trimmed and cut at 2,000 characters (packages/ui/unified-chat/src/lib/artifact-edit-request.ts:9-13).
- Escape dismisses the toolbar (ArtifactSelectionToolbar.tsx:188-197).

**Journey**

1. 1. Open a document in the web side panel and select a passage.
2. 2. The toolbar appears above (or below if near the top) the selection.
3. 3. Pick an Improve item, or choose Edit with AI and type the change.
4. 4. The request is sent as a chat message; the side panel closes on small screens (ArtifactsPanel.tsx:655-661).
5. 5. The assistant replies with the full updated document, which arrives as a new version of the same artifact.
6. 6. The person reads it, can open Show changes or Review changes, and can restore an older version (F027-07).

**What the person sees and gets**

- If the message cannot be sent, a toast reads 'The change request was not sent. Try again.' and the toolbar stays (ArtifactPreview.tsx:2198; ArtifactPreview.selectionEdit.test.tsx:127).
- Nothing in the document changes until the assistant's reply makes a new version [inferred from: the request only goes to chat, ArtifactPreview.tsx:2185-2199].
- Chrome translate: the composer is filled with 'Translate the selected text into <browser language>. If it is already in that language, ask which language to use.' and the person presses send (apps/extension/src/side_panel.ts:16488-16497; apps/extension/_locales/en/messages.json:26-27).

**Settings**

- The language list comes from the shared supported-language list (packages/ui/i18n/src/languages.ts:9). No selection-specific setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: toolbar, Improve menu, Edit with AI form, request building with selection, 400-char context each side, optional current text up to 24,000 characters, slide scope for decks, and send through chat (ArtifactSelectionToolbar.tsx; artifact-selection-request.ts:103-165; ArtifactPreview.tsx:2177-2215; apps/web/features/chat/pages/WebChatPage.tsx:6097-6102, 7894).
- The selection is cut at 4,000 characters (artifact-selection-request.ts:16).
- Chrome: 'Translate this' context menu fills the side-panel composer (background.ts:7624-7640; side_panel.ts:16488-16497). 'Rewrite selection' captures text in an editable field and starts a managed-cloud turn (background.ts:7505-7545; side_panel.ts startSelectionRewrite).
- VS Code: three code-selection actions (codeActionProvider.ts:37-70).

**Incomplete**

- The result is a whole-document reply from the assistant, not an in-place edit; the brief's 'in place' wording is not met by design (artifact-selection-request.ts:150-163).
- Chrome 'Translate this' needs a second step (press send) and works on page text, not a document.
- The brief's code references for Chrome (side_panel.ts:14710, 14725) point at unrelated attachment-menu code now; the real lines are side_panel.ts:16488-16497 and background.ts:7624.

**Present but disconnected or switched off**

- On web the toolbar is hidden whenever the conditions in ArtifactPreview.tsx:2165-2175 fail, for example on an older version or a PDF.

**Not available**

- Mobile: no selection actions (searched mobile/src, services, app for the action labels; none found).
- CLI: not applicable.
- VS Code: no document selection actions; 'Rewrite' is recorded as not applicable in docs/decisions/2026-09-27-founder-decisions.md:408.
- Tauri desktop shared panel: none found.
- Chrome: no tone, audience, shorten or lengthen actions found.

## 4. Required behaviour

**Established requirements**

- Selecting text shows a toolbar of actions (S27.15); the user can rewrite, shorten, expand, change tone, adjust audience and translate a selection (S27.16 to S27.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.15, S27.16, S27.21)
- Chrome has no selection toolbar by decision; VS Code has no rewrite by decision. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:385, 408)
- The request names the artifact, the passage, its surroundings and the change, and the assistant replies with the complete updated document. (source: packages/ui/unified-chat/src/lib/artifact-selection-request.ts:122-165)
- If the request cannot be sent the person sees 'The change request was not sent. Try again.' (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2198)

**Acceptance criteria**

1. Selecting text in a latest-version document on web shows Edit with AI, Improve and Comment.
2. Improve lists Rewrite, Make shorter, Make longer, five tones, five audiences and one entry per supported language.
3. Choosing an item sends one chat message that contains the selected text, text before and after it, and the title; the document is unchanged until a reply arrives.
4. The toolbar does not appear on an older version, in 'Show changes', or for PDF, Word and image artifacts.
5. When the send guard refuses, the toast appears and the toolbar remains.
6. Pressing Escape dismisses the toolbar.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the request goes through the same send path as a typed message, it follows the active mode and the person's plan limits [inferred from WebChatPage.tsx:6097-6102].
- Mobile and Tauri desktop may be intended to stay prompt-only; the decision on phone document editing says editing goes to web or desktop (doc: docs/decisions/2026-09-27-founder-decisions.md:285-289) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief: web is built, not missing.
- [proposed] Add tone/audience presets to mobile 'Ask for changes' if parity is wanted.
- [proposed] Show an 'applying' state in the document while the assistant answers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactSelectionToolbar | `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Toolbar, Improve menu, Edit with AI form, anchor from selection. |
| service | SELECTION_ACTIONS | `apps/web/features/chat/components/artifacts/artifact-selection-request.ts` | Builds the action list from the supported languages. |
| service | selectionActionsFor / captureSelectionContext / buildArtifactSelectionRequest | `packages/ui/unified-chat/src/lib/artifact-selection-request.ts` | Action definitions (tones, audiences), selection and context capture, request text. |
| service | artifact-edit-request | `packages/ui/unified-chat/src/lib/artifact-edit-request.ts` | Instruction limit 2,000 (9), inline document limit 24,000 (10), reply format (47). |
| component | ArtifactPreview selection wiring | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canRequestSelectionEdits (2165), requestSelectionEdit (2177), toolbar mount (3166). |
| component | ArtifactsPanel requestEdits | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Passes the send callback and closes the overlay on small screens (655-661). |
| hook | handleArtifactEditRequest | `apps/web/features/chat/pages/WebChatPage.tsx` | Sends the prompt through handleSend (6097) and mounts ArtifactsPanel (7894). |
| hook | use-comment-highlights readRangeContext | `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.ts` | Reads the rendered surroundings used to pick the right occurrence. |
| service | language list | `packages/ui/i18n/src/languages.ts` | SUPPORTED_LANGUAGES feeding the Translate to group. |
| integration | Chrome context menus | `apps/extension/src/background.ts` | 'Translate this' and 'Rewrite selection' menu items and handlers (7453-7545, 7624). |
| screen | Chrome side panel composer prefill | `apps/extension/src/side_panel.ts` | Fills the translate prompt (16488-16497) and runs startSelectionRewrite. |
| service | EditableRewriteController | `apps/extension/src/features/side-panel/editableRewrite.ts` | Applies a rewrite back into an editable page field. |
| integration | VS Code code actions | `apps/extension-vscode/src/providers/codeActionProvider.ts` | Refactor, Explain, Generate Tests for a code selection. |
| screen | Mobile Ask for changes | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Whole-document change prefill (147, 328, 988). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person selects text; the toolbar reads the browser selection and its position. | device | ArtifactSelectionToolbar.tsx:43-64 |
| The client finds the selection in the document source, takes 400 characters before and after, and builds the request text. | device | packages/ui/unified-chat/src/lib/artifact-selection-request.ts:103-165 |
| The request is sent as an ordinary chat message through the web send path. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:6097-6102 |
| The chat model for the active conversation writes the full updated document in a marked fenced block. | our servers | artifact-edit-request.ts:47-55 reply format; server routing not read (unknown which route runs in Local or own-key mode) |
| The reply is derived into the same artifact (title links it to the versions), appending a new version. | device | artifact-edit-request.ts:16 comment; packages/platform/artifacts/src/artifact-store.ts:15-17 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Edit request message and the assistant's reply | The conversation's messages (browser store and, for managed-cloud chats, the account) | As any chat message in the current mode | As the conversation; deleting it removes derived artifacts (artifacts-store.ts:1002-1034). |

**Models and providers.** The selected text and its surroundings go to whatever model and provider the current chat uses (Local, own key or Cloud). The code does not pick a model for selection actions; routing is handled by the chat pipeline (SYS-chat-turn-pipeline, SYS-model-catalog-and-routing). Quality depends on the model following the reply-format instruction. Chrome rewrite runs on the managed cloud runtime (side_panel.ts startSelectionRewrite sets runtime 'managed-cloud').

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: whatever the chat requires; the selection UI itself has no account check. Chrome rewrite needs a signed-in managed-cloud account. |
| Permissions | Chrome rewrite refuses pages the person has blocked and a changed account (side_panel.ts startSelectionRewrite). |
| Subscription | No selection-specific entitlement found. Each request is a normal chat message so it counts against the plan like any message [inferred]. |
| Limits and metering | Selection 4,000 characters, instruction 2,000, context 400 each side, inline document 24,000 (artifact-selection-request.ts:16-17; artifact-edit-request.ts:9-10). Chat limits apply as for any send. |
| Feature flags | none found in the code. |
| Model compatibility | Any chat model; needs to follow the reply format. No capability check found. |
| Provider restrictions | none found in the code. |
| Local mode | The toolbar works in Local chats because it only creates a chat message; the message is answered by the on-device model if the chat is in Local mode [inferred]. Not confirmed by a Local-mode test. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Send refused or blocked | Toast 'The change request was not sent. Try again.'; toolbar stays open | ArtifactPreview.tsx:2198; ArtifactPreview.selectionEdit.test.tsx:127 |
| Empty instruction | Send button disabled | ArtifactSelectionToolbar.tsx:281-283 |
| Hand-edited or multi-version document | Current text is added to the request when it fits in 24,000 characters | ArtifactPreview.tsx:2182-2196; artifact-selection-request.ts:138-146 |
| Unsaved source edit | The edit is saved first, then the request is sent | ArtifactPreview.tsx:2183 |
| Selection text not found in source | Request carries the text with no surrounding context | artifact-selection-request.ts:103-120; artifact-selection-request.test.ts:25 |
| Deck slide | The request is scoped 'in slide N' | ArtifactPreview.tsx:2179-2189 |
| Small screens | Buttons are 44px high; panel closes after sending | ArtifactSelectionToolbar.tsx; ArtifactsPanel.tsx:655-661 |
| Offline, timeout, retry, cancel | not handled in the code for the toolbar itself; it relies on the chat send path. Cancel dismisses the toolbar. | ArtifactSelectionToolbar.tsx:188-197 (Escape and Cancel only); no network handling in that file |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.selectionEdit.test.tsx`: Toolbar over selected text sends a scoped shorten request; Edit with AI free text; current text included for hand-edited artifacts; toolbar stays on refusal.
- `packages/ui/unified-chat/src/lib/artifact-selection-request.test.ts`: Context capture and caps, occurrence choice, request wording, inline current text, action list with one translation per language.
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx`: The pick-an-element request layer (a related feature); cases not read.

**Test scenarios**

- **Shorten a paragraph**
  1. Open a document in the web side panel on its latest version.
  2. Select a paragraph.
  3. Choose Improve then Make shorter.
  - Expected: One chat message is sent holding the paragraph, its neighbours and the title; the document stays unchanged until the reply; the reply adds a version.
- **Hidden on older version**
  1. Open history and view version 1 of 3.
  2. Select text.
  - Expected: No toolbar appears.
- **Send blocked**
  1. Make the send path refuse (for example while a send is blocked).
  2. Choose an Improve item.
  - Expected: Toast 'The change request was not sent. Try again.' and the toolbar remains.
- **Chrome translate**
  1. On any page select text and right-click 'Translate this'.
  - Expected: Side panel opens with the translate prompt in the composer; nothing is sent until the person sends.
- **Mobile absence**
  1. Open a document full screen on mobile and long-press text.
  - Expected: No assistant selection toolbar; 'Ask for changes' is the only assistant edit entry.

**Where to look when it fails**

- Toast text 'The change request was not sent. Try again.'
- Chat message list shows the generated request text as a user message.
- Chrome: logger.warn 'Failed to store pending chat (translate)' (background.ts:7637).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- VS Code: [70-qa/test-plans/vscode/027-document-and-writing-editor.md](../../70-qa/test-plans/vscode/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **Brief marks web 'missing' but the toolbar is built and connected; the brief's 'in place' goal is replaced by a chat round trip.** Affects: Web and Electron users, planners. Evidence: ArtifactSelectionToolbar.tsx; WebChatPage.tsx:7894. Work needed: Correct the brief; decide if in-place preview of the change is wanted.
- **Mobile has no selection actions.** Affects: Mobile users. Evidence: No matches in apps/mobile for the action labels; decision on phone document editing at docs/decisions/2026-09-27-founder-decisions.md:285-289. Work needed: Decide; if wanted, build a selection menu feeding the existing composer prefill.
- **Tauri desktop shared panel has no selection toolbar.** Affects: Tauri desktop (internal). Evidence: packages/ui/unified-chat/src/components/ArtifactPanel.tsx has no selection code. Work needed: Decide if the Tauri build needs it.
- **Chrome only translates page text and rewrites editable fields; no tone, audience, shorten or lengthen.** Affects: Chrome users. Evidence: apps/extension/src/background.ts:7453-7460. Work needed: Decide if wanted; docs/decisions/2026-09-27-founder-decisions.md:385 lists S27.15 for Chrome as not built by design.
- **Stale brief code references for Chrome.** Affects: Docs. Evidence: apps/extension/src/side_panel.ts:14710 is attachment-menu code. Work needed: Update the brief.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:chrome
- surface:vscode
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- F027-07
- F027-09
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- file:packages/ui/unified-chat/src/lib/artifact-selection-request.ts

## Unknown

- Which server route and model run an edit request in Local and own-key modes (not traced).
- Whether the Tauri desktop main chat ever shows a selection toolbar (only the shared panel was searched).
- Exact English label of other Chrome context items.
- Whether the Chrome extension has tests for translate and rewrite (not searched).
- Whether the Comment button appears for artifacts whose id is not a UUID (it depends on canCommentOn).
