---
id: "F021-05"
type: "feature"
title: "Explain, edit beside chat, and open in coding workspace"
aliases: ["Edit beside chat", "Edit in Canvas", "Edit this code beside the chat", "Explain this code", "Open in coding workspace", "S21.24", "S21.25", "S21.26", "Edit code"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.24", "S21.25", "S21.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "F021-02", "file:packages/ui/unified-chat/src/components/markdown/codeBlockEditor.ts", "file:apps/web/features/chat/utils/artifact-detector.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-05 Explain, edit beside chat, and open in coding workspace

Web and hosted Desktop have an Edit button that opens a code block as an editable artifact beside the chat, once the reply is complete. Mobile has an Edit code button that opens a full-screen editor. VS Code has Explain, which sends the code to chat. Web Explain and a separate open-in-workspace action were not found.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.24](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2124), [S21.25](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2125), [S21.26](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2126).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Sends one code block somewhere else: into an editable side panel, an editor screen, or a new chat message that asks for an explanation.

**Why it exists.** Brief items S21.24 to S21.26: people want to change or understand a block without copying it out.

**Who uses it.** Users who want to adjust generated code or ask what it does.

**Problems it solves**

- Copy, paste and re-prompt is slow.
- Editing inside a chat bubble is not possible.

**Use cases**

- Click Edit under a web code block to change it in the artifact panel.
- Tap Edit code on mobile to change a block full screen.
- Click Explain in VS Code to ask the model what the code does.

## 2. User experience

**Where to find it**

- Web and hosted Desktop: 'Edit' button (accessible name 'Edit this code beside the chat') in the code block header, only in assistant messages and only when complete (CodeBlock.tsx:181-193; MessageBubble.tsx:2894).
- Mobile: pencil icon labelled 'Edit code' (CodeCard.tsx:524).
- VS Code: 'Explain' button, label 'Explain this code', shown on hover or focus (apps/extension-vscode/src/webview/render.ts:36-41; webviewContent.ts:1447-1448).
- CLI and Chrome: none.

**Before you start**

- Web: the host supplies an editor handler (CodeBlockEditorContext) and the reply is not streaming. Assistant messages only; user messages get null (MessageBubble.tsx:2894).
- Mobile: draft scope exists, the block is finished, not mermaid (CodeCard.tsx:400-405).
- VS Code: a reply with a code block.

**Screens and controls**

- Edit button with pencil icon and text 'Edit'.
- Artifact panel opens in edit mode (useArtifactsStore.openArtifactForEditing).
- VS Code Explain button.
- Mobile ArtifactFullScreen in edit mode.

**Journey**

1. Wait for the reply to finish.
2. Click Edit (web) or tap Edit code (mobile).
3. The code opens as an editable artifact.
4. Or in VS Code click Explain; a new user message 'Explain this code:' plus the fenced code is sent.

**What the person sees and gets**

- Web: artifact panel opens with the code.
- Mobile: alert 'Edit failed' with 'Could not open this code for editing. Try again.' on failure (CodeCard.tsx:411-412; codeCardEdit.ts:10).
- VS Code: the explanation arrives as a normal chat answer.

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Edit calls openInEditor(code); the handler finds the matching block in the message, builds an artifact with codeBlockEditorArtifact, adds it for the message and opens it for editing (apps/web/features/chat/components/messages/MessageBubble.tsx:1456-1470; apps/web/features/chat/utils/artifact-detector.ts:59-75). Test MarkdownContent.render.test.tsx:176-185 clicks Edit and expects the code passed; synthetic fallback source gets no Edit (lines 165-174).
- Web: hidden while streaming (CodeBlock.tsx:181).
- Mobile: Edit code stores the block for editing and opens ArtifactFullScreen with initialMode edit (CodeCard.tsx:400-415,340-352; services/codeCardEdit.ts:120). Tests CodeCard.previewEdit.test.tsx and MessageContentRenderer.codeCardActions.test.tsx exist (contents not read). This corrects the first draft, which said mobile Edit was missing.
- VS Code: Explain sends 'Explain this code:' with a fenced copy of the block, using the code language, through sendMessage (webviewContent.ts:5477-5481). Test codeBlockActions.webview.test.ts:175 checks it leaves the typed draft and staged files alone.

**Incomplete**

- Failure of the VS Code Explain send is not handled in this click handler beyond whatever sendMessage does; not read.
- Web Edit does nothing silently if no block matches the code (MessageBubble.tsx:1458-1459 return).

**Present but disconnected or switched off**

- The brief says VS Code open-in-workspace is at ChatStateManager.ts:1324 and render.ts:18. Those lines are the reasoning effort picker and an import, so the citation is wrong. The nearest real action is Apply (see F021-06). No separate 'open in workspace' control was found.
- The web Edit button needs a provider of CodeBlockEditorContext; MarkdownContent clears it for read-only sources (MarkdownContent.tsx:700).

**Not available**

- Web and Desktop Explain: none found.
- CLI and Chrome Edit and Explain: none found.
- Mobile Explain: none found.
- Tauri desktop Edit: not established; unknown.

## 4. Required behaviour

**Established requirements**

- A code block offers an Explain action that asks for an explanation of that code. (source: S21.24 brief (done only on VS Code))
- A code block can be opened in an editable canvas next to the chat. (source: S21.25 brief)
- A code block can be sent to or opened in the coding workspace. (source: S21.26 brief)
- Edit is hidden while the reply is streaming. (source: CodeBlock.tsx:181)

**Acceptance criteria**

1. On web, a completed assistant code block shows Edit; clicking opens the artifact panel in edit mode with that code.
2. While the reply streams, no Edit button shows.
3. Messages written by the user show no Edit button.
4. Mobile Edit code opens a full-screen editor with the block; a mermaid block has no Edit code.
5. VS Code Explain sends one message that contains the code and does not change the draft or staged files.
6. If Edit cannot open on mobile, an alert 'Edit failed' appears.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Explain on VS Code is counted as a normal chat turn under the user's mode and plan [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Explain to web, mobile and Chrome.
- [proposed] Tell the web user when Edit finds no matching block.
- [proposed] Correct brief item S21.26 or add the missing action.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FencedCodeBlock Edit button | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Shows Edit when a handler exists and not streaming. |
| hook | CodeBlockEditorContext / useCodeBlockEditor | `packages/ui/unified-chat/src/components/markdown/codeBlockEditor.ts` | Lets a host supply the open-in-editor function. |
| component | MessageBubble openCodeBlockInEditor | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Finds the block, builds the artifact, opens it; provides the context. |
| service | codeBlockEditorArtifact | `apps/web/features/chat/utils/artifact-detector.ts` | Derives the artifact for one block. |
| store | artifacts store | `apps/web/features/chat/stores/artifacts-store.ts` | openArtifactForEditing and message artifacts. |
| component | MarkdownPre editor scope | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Clears the editor handler for read-only sources. |
| component | CodeCard edit | `apps/mobile/src/features/chat/components/CodeCard.tsx` | canEdit, startEditing, CodeEditorScreen. |
| service | codeCardEdit | `apps/mobile/src/features/chat/services/codeCardEdit.ts` | storeCodeCardForEditing, savedCodeCardEdit, failure text. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Edit screen opened in edit mode. |
| component | renderCodeBlock Explain button | `apps/extension-vscode/src/webview/render.ts` | Emits the Explain button. |
| component | bindCodeBlockActions | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Explain click sends the chat message. |
| config | explain button styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Lines 1447-1449 hover reveal. |
| test | codeBlockActions webview test | `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts` | Explain and Apply click behaviour. |
| test | MarkdownContent render test | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx` | Edit button behaviour. |
| test | CodeCard previewEdit test | `apps/mobile/src/features/chat/components/__tests__/CodeCard.previewEdit.test.tsx` | Mobile preview and edit. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Edit click calls the host handler with the block text. | device | CodeBlock.tsx:186 |
| The handler matches the text to a block of the message and creates an artifact object, adds it to the artifact store and opens it for editing. | device | MessageBubble.tsx:1456-1469 |
| Whether the edited artifact is saved to our servers depends on the artifact panel's save flow (not read in this pass). | our servers | unknown; ArtifactPreview.cloudSave.test.tsx exists at apps/web/features/chat/components/artifacts/ |
| VS Code Explain sends a chat message that goes through the normal chat turn to the chosen model. | device and our servers | webviewContent.ts:5479; destination depends on mode (see SYS-chat-turn-pipeline) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Derived artifact for the block | web artifacts store (client); persistence not read | unknown | unknown |
| Mobile edited block | codeCardEdit service in the message record (storeCodeCardForEditing) | unknown | unknown |
| Explain message | conversation history | as the chat system does | as the conversation |

**Models and providers.** Edit uses no model. VS Code Explain uses whichever model and provider the session has selected; the request text is fixed English.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for Edit or Explain buttons; chat send in VS Code needs whatever the extension needs for chat (see SYS-authentication-and-identity). |
| Permissions | none found in the code. |
| Subscription | none found in the code for Edit; Explain counts as a normal message against the active plan [inferred]. |
| Limits and metering | none found for Edit. Explain is metered as any message [inferred]. |
| Feature flags | none found in the code. |
| Model compatibility | Edit is model independent. Explain works with any chat model. |
| Provider restrictions | none found in the code. |
| Local mode | Edit is local. In VS Code a local model can answer Explain if selected [inferred from _localModelProviders at ChatStateManager.ts:1368]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming reply | Web Edit hidden. | CodeBlock.tsx:181 |
| No matching block | Web: nothing happens, no message. | MessageBubble.tsx:1458-1459 |
| Mobile edit failure | Alert 'Edit failed'. | CodeCard.tsx:411-412 |
| User message | No editor context, no Edit button. | MessageBubble.tsx:2894 |
| Mermaid on mobile | No Edit code (separate editor). | CodeCard.tsx SEPARATE_EDITOR_LANGUAGES and canEdit at line 400 |
| Explain failure or cancel | not handled in this click handler; not established. | webviewContent.ts:5477-5481 sends and returns with no failure branch |
| Accessibility | Buttons labelled 'Edit this code beside the chat' and 'Explain this code'. | CodeBlock.tsx:130; render.ts:36 |
| Offline | Edit works locally; Explain needs the chat connection; not otherwise handled. | no offline branch found in the Edit or Explain handlers |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Edit absent for synthetic fallback; present and called with source for a real markdown fence.
- `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts`: Explain leaves draft and staged files alone.
- `apps/mobile/src/features/chat/components/__tests__/CodeCard.previewEdit.test.tsx`: Mobile preview and edit (title level).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCardActions.test.tsx`: Mobile code card actions (title level).
- `apps/web/features/chat/components/artifacts/ArtifactPreview.openForEditing.test.tsx`: Opening an artifact for editing.

**Test scenarios**

- **Edit on web**
  1. Get a reply with a javascript block.
  2. After it completes, click Edit.
  3. Change a line.
  - Expected: Artifact panel opens in edit mode with the block; changes stay in the artifact.
- **Edit hidden while streaming**
  1. Start a long code reply and look at the header.
  - Expected: No Edit button until the block completes.
- **Mobile edit**
  1. Tap Edit code on a finished block.
  - Expected: Full-screen editor opens; a failure shows 'Edit failed'.
- **VS Code Explain**
  1. Type a draft, hover a code block, click Explain.
  - Expected: A message beginning 'Explain this code:' is sent; the draft is untouched.
- **User message code**
  1. Send a message with a code fence on web.
  - Expected: No Edit button on the user's own block.

**Where to look when it fails**

- Mobile alert 'Edit failed'.
- VS Code output channel for chat errors; not read; unknown.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **Explain exists only on VS Code.** Affects: Web, Desktop, Mobile, CLI, Chrome. Evidence: brief S21.24; no Explain control in CodeBlock.tsx or CodeCard.tsx. Work needed: Add an Explain action that sends the block as a chat message.
- **Open in coding workspace: no real code found behind the brief's citation.** Affects: VS Code, Web, Desktop. Evidence: ChatStateManager.ts:1324 is effort-picker code; render.ts:18 is an import. Work needed: Decide what the action is; fix or remove the brief claim.
- **Web Edit fails silently when no block matches.** Affects: Web, Desktop. Evidence: MessageBubble.tsx:1458-1459. Work needed: Show a notice.
- **The brief says mobile Edit is missing, but it exists.** Affects: Documentation. Evidence: CodeCard.tsx:400-415,524. Work needed: Update the brief.
- **Explain failure behaviour unknown.** Affects: VS Code. Evidence: webviewContent.ts:5477-5481. Work needed: Read sendMessage failure path and add a test.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- F021-02
- file:packages/ui/unified-chat/src/components/markdown/codeBlockEditor.ts
- file:apps/web/features/chat/utils/artifact-detector.ts

## Unknown

- Whether web artifact edits are saved to our servers.
- What S21.26 'open in coding workspace' is meant to do in VS Code.
- How Explain failures show.
- Whether the Tauri desktop provides CodeBlockEditorContext.
- Contents of the mobile edit tests.
