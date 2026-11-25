---
id: "F017-05"
type: "feature"
title: "Copy, read aloud, share, export and save"
aliases: ["Copy, read aloud, share, export and save", "Copy message", "Read message aloud", "Share answer", "Export Message", "Save as document", "Save to project", "S17.15", "S17.16", "S17.17", "S17.18", "S17.32", "S17.33", "S17.34", "S17.35"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S17.15", "S17.16", "S17.17", "S17.18", "S17.32", "S17.33", "S17.34", "S17.35"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "api:POST /api/voice/speech"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-05 Copy, read aloud, share, export and save

Gets an answer out of the app: copy as plain text, read aloud with a stop control, share, export to PDF or text on mobile, and on web and mobile save as a document (web also saves to a Project). Formatted copy is missing on every app. The CLI has /copy only in the TUI.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.15](../../10-requirements/capabilities/017-assistant-message-components.md#s1715), [S17.16](../../10-requirements/capabilities/017-assistant-message-components.md#s1716), [S17.17](../../10-requirements/capabilities/017-assistant-message-components.md#s1717), [S17.18](../../10-requirements/capabilities/017-assistant-message-components.md#s1718), [S17.32](../../10-requirements/capabilities/017-assistant-message-components.md#s1732), [S17.33](../../10-requirements/capabilities/017-assistant-message-components.md#s1733), [S17.34](../../10-requirements/capabilities/017-assistant-message-components.md#s1734), [S17.35](../../10-requirements/capabilities/017-assistant-message-components.md#s1735).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 4) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Copy the text of an answer, hear it, send it elsewhere, or keep it as a file or document.

**Why it exists.** Answers are work product people need to move into other tools.

**Who uses it.** Everyone; people with accessibility needs use read aloud.

**Problems it solves**

- Moving an answer into a document
- Listening hands-free
- Sharing without screenshots

**Use cases**

- Press Copy; get a check mark and a Copied to clipboard toast.
- Open More message actions and choose Read message aloud.
- Choose Export Message on mobile and pick PDF.
- Choose Save as document or Save to project on web.

## 2. User experience

**Where to find it**

- Web and Desktop: Copy message button (MessageBubble.tsx:3750); More message actions menu with Read message aloud (3978-3991), Share answer (4017), Save to project (4026), Save as document (4035).
- Mobile: action row buttons Copy and Read aloud (apps/mobile/src/features/chat/components/MessageBubble.tsx:3150-3175); long-press or More sheet has Copy Message, Export Message…, Save as document (1684-1705).
- CLI TUI: /copy, /copy code, /copy diff (apps/cli/src/tui/tui_app.rs:5915-5946); REPL /copy prints help only (apps/cli/src/claude_parity.rs:1117-1119); /export for the conversation (apps/cli/src/repl/registry.rs:473).
- VS Code: copy button in the answer action row (webviewContent.ts:4795-4812).
- Chrome: copy and read aloud buttons in the bubble action row (apps/extension/src/features/side-panel/bubbles.ts:482, 536, 608-620).

**Before you start**

- The answer has readable text (web hasReadableTurn, MessageBubble.tsx:2392).
- Save to project needs the chat to belong to a Project the person can write to (WebChatPage.tsx:6156-6164).
- Mobile Save as document asks for sign-in in Cloud mode (mobile MessageBubble.tsx:1567-1571).

**Screens and controls**

- Web read aloud is a checkbox menu item; disabled with a reason when the reply was Local or own-key (MessageBubble.tsx:3979-3990; apps/web/lib/read-aloud-policy.ts:16-30).
- Mobile export sheet: Export as PDF, Export as Text, Copy to Clipboard, Share Text, Share... (apps/mobile/src/features/chat/components/FileExportButton.tsx:34-69).
- Chrome copy shows a failed state and a status line (bubbles.ts:482-513).

**Journey**

1. Person finds the answer.
2. Presses the control.
3. Web copy writes plain text to the clipboard and shows a toast (MessageBubble.tsx:2273-2280).
4. Read aloud streams audio from the voice endpoint or device speech; pressing again stops it.
5. Share uses the system share sheet when present, otherwise copies (MessageBubble.tsx:2287-2306).

**What the person sees and gets**

- Toast Copied to clipboard; check icon for two seconds (MessageBubble.tsx:2278-2284).
- Mobile Export Failed alert (FileExportButton.tsx catch block).
- Toast Saved to <project> (MessageBubble.tsx:1152).

**Settings**

- Web voice and speed settings feed read aloud (apps/web/lib/hooks/useTTS.ts imports voice speed rates).
- Chrome read aloud reads saved settings (bubbles.ts:549).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: plain-text copy, share, read aloud and stop, save to project, save as document (MessageBubble.tsx:2273-2306, 3978-4049).
- Mobile: copy, read aloud and stop, export to PDF or text, share text, save as document (mobile MessageBubble.tsx:1684-1705, 3150-3175; FileExportButton.tsx).
- CLI TUI: copy last response, last code block or last diff (tui_app.rs:5915-5946); export of the whole conversation (registry.rs:440-470).
- VS Code: copy (webviewContent.ts:4795).
- Chrome: copy and read aloud (bubbles.ts).

**Incomplete**

- Chrome: conversation-level share link exists in history (apps/extension/src/features/side-panel/historyShare.ts), not per-answer share in the action row.
- CLI /export writes the whole conversation, not one answer.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Formatted (rich text) copy: web writes writeText only (MessageBubble.tsx:2274); mobile copies answerClipboardText (FileExportButton.tsx copy case). Not available on any app.
- Read aloud in CLI and VS Code: none found.
- Share in CLI and VS Code: none found.
- Save to project on mobile, CLI, VS Code, Chrome: none found. Save as document on CLI, VS Code, Chrome: none found.
- Brief says web save is missing; the code has both (MessageBubble.tsx:4026-4049).

## 4. Required behaviour

**Established requirements**

- One action copies the whole answer's text. (source: brief S17.15)
- Copy places formatted content on the clipboard (missing on every app). (source: brief S17.16)
- An answer can be read aloud and stopped from the same place. (source: brief S17.17, S17.18)
- Share an answer or conversation by link or system share sheet. (source: brief S17.32)
- Save an answer to Project knowledge. (source: brief S17.33)
- Save an answer as an editable document. (source: brief S17.34)
- Export one answer to a file. (source: brief S17.35)
- Message actions include copy and retry at minimum and work after reload (M-CHAT-005). (source: doc: docs/product/requirements.md)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing silently routes a Local file or chat to the cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Copy puts the answer text on the clipboard and shows a confirmation on web, mobile and Chrome.
2. Read message aloud starts audio; the same item then reads Stop reading message and stops it.
3. On web, read aloud for a Local or own-key reply is disabled with a privacy reason.
4. Share uses the share sheet or copies when none exists.
5. Mobile export as PDF opens the share sheet with a PDF file.
6. Save as document on web opens the artifact panel with a Markdown document.
7. In the CLI TUI, /copy code copies only the last code block.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Read aloud of a Local reply should use device speech only [inferred from the web policy that blocks the server voice route for Local and own-key messages].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Write HTML and plain text to the clipboard together for formatted copy.
- [proposed] Add per-answer export to web and CLI.
- [proposed] Add save to Project on mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) actions | `apps/web/features/chat/components/messages/MessageBubble.tsx` | handleCopy 2273, handleShare 2287, menu items 3978-4049. |
| hook | useTTS | `apps/web/lib/hooks/useTTS.ts` | Read aloud engine: server speech endpoint with device speech fallback. |
| service | read-aloud-policy | `apps/web/lib/read-aloud-policy.ts` | Disables read aloud for Local and own-key replies. |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Metered text to speech. |
| hook | useSaveAnswerAsDocument | `apps/web/features/chat/components/artifacts/save-answer-as-document.ts` | Creates a Markdown document artifact and opens the panel. |
| service | project-answer-save | `apps/web/features/projects/components/project-answer-save.ts` | Context and file name for saving to a Project; upload in WebChatPage.tsx:6156-6170. |
| component | MessageBubble (mobile) actions | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Action list 1640-1735, read aloud 2002, row 3150-3190. |
| component | FileExportButton | `apps/mobile/src/features/chat/components/FileExportButton.tsx` | Export sheet: PDF, text, copy, share. |
| service | fileCreation | `apps/mobile/services/fileCreation.ts` | exportToPDF, exportToText, shareFile (imported FileExportButton.tsx:13); path inferred from the import. |
| command | /copy in TUI | `apps/cli/src/tui/tui_app.rs` | Clipboard write for response, code or diff (5915-5946). |
| command | CopyTarget | `apps/cli/src/claude_parity.rs` | Parses and extracts what to copy (1149). |
| command | /export | `apps/cli/src/repl/registry.rs` | Exports the conversation to display or a file (440-470, 473). |
| component | Chrome copy and read aloud | `apps/extension/src/features/side-panel/bubbles.ts` | buildCopyButton 482, buildReadAloudButton 536. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Copy writes text to the system clipboard in the app or browser. | device | MessageBubble.tsx:2274; FileExportButton.tsx copy case |
| Web read aloud sends the text, in chunks of up to 3,800 characters, to the speech endpoint, and plays the returned audio. | our servers | useTTS.ts:10-12, 44-60 |
| The speech route checks access, reserves managed usage, and calls a speech provider. | our servers | app/api/voice/speech/route.ts:144-172 |
| The provider returns audio. | outside service | route.ts uses model.provider in the reservation (line 160 area) |
| If the server voice is not used, the browser's own speech engine can read it. | device | useTTS.ts:220-226, 338 |
| Mobile read aloud uses device speech, and server voice only for Cloud-scoped owners. | device and our servers | mobile MessageBubble.tsx:2019-2021; apps/mobile/src/features/voice/services/voiceOutput.ts:102, 131 |
| Mobile PDF export renders on the device and opens the share sheet. | device | FileExportButton.tsx exportToPDF then shareFile |
| Web save to project uploads a Markdown file as project knowledge. | our servers | WebChatPage.tsx:6165-6170 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Copied or shared text | System clipboard or share target | No | Outside the app's control |
| Saved document artifact | Web artifacts store (useArtifactsStore); mobile local or cloud artifact with provenance (mobile MessageBubble.tsx:1563-1582) | Mobile cloud scope syncs [inferred]; web store persistence not studied | unknown |
| Project knowledge file named Answer from <title>.md | Project knowledge via uploadProjectKnowledgeFile | Server | Project rules |

**Models and providers.** Read aloud uses a speech model chosen by the voice route (model.id and provider in route.ts); not named. Copy, share and export use no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web speech route needs a signed-in account; copy and export need none beyond viewing. Mobile Save as document needs sign-in in Cloud mode (mobile MessageBubble.tsx:1567-1571). |
| Permissions | Save to project hidden when the project is org-shared without write access (WebChatPage.tsx:6158-6160). |
| Subscription | Web speech goes through entitlement resolution and managed compute access (route.ts:144-156); plan-specific limits unknown. |
| Limits and metering | Speech reserves managed usage with an idempotency key; rate limit voice-speech (route.ts:74). |
| Feature flags | none found in the code |
| Model compatibility | Read aloud is independent of the answering model, but blocked for Local and own-key replies on web (read-aloud-policy.ts:16-25). |
| Provider restrictions | Server voice uses the managed speech provider only. |
| Local mode | Web: read aloud disabled with Read-aloud is unavailable for this reply's privacy mode. Mobile: device speech can read local answers; server voice flag is true only for cloud scope. Copy, export and save work on-device for local mobile answers (provenance local, mobile MessageBubble.tsx:1564). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Clipboard unavailable | Chrome shows a failed state with retry label; VS Code settles with failure; web share falls back with an error toast. | bubbles.ts:487-513; webviewContent.ts:4801-4803; MessageBubble.tsx:2301-2305 |
| Share cancelled | AbortError ignored. | MessageBubble.tsx:2292-2296 |
| Read aloud fails | Mobile toast Read aloud could not play. Try again. | mobile MessageBubble.tsx:266, 2031-2032 |
| Streaming | Mobile Copy becomes Copy Partial Response; web share and save hidden until done. | mobile MessageBubble.tsx:1686; web MessageBubble.tsx:4017 |
| Turn with no text | Copy, ratings and read aloud hidden. | MessageBubble.tsx:2384-2392 |
| Voice mode active | Regenerate is hidden; copy is not changed by voice mode in the code read. | MessageBubble.tsx:3867 |
| Offline | not handled in the code for copy (no network check in the copy handler); server read aloud needs network [inferred]. | MessageBubble.tsx:2273-2284 has no offline branch |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/MessageBubble.copyRichBlocks.test.tsx`: Copy of rich blocks as plain text (from file name).
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.saveAsDocument.test.tsx`: Save as document (from file name).
- `apps/web/features/chat/components/artifacts/SaveAnswerAsDocument.test.tsx`: The save hook (from file name).
- `apps/web/features/chat/components/messages/__tests__/MessageLocalBoundary.test.tsx`: Local boundary label (from file name).
- `apps/mobile/__tests__/MessageBubbleAnswerControls.test.tsx`: Mobile answer controls (from file name).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactExportSheet.test.tsx`: Artifact export sheet (from file name).
- `apps/cli/src/claude_parity.rs`: In-file tests copy_code_takes_only_the_last_fenced_block, copy_diff_prefers_the_diff_over_a_later_code_block (lines 4525-4621).
- `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts`: Code block actions in the webview (from file name).

**Test scenarios**

- **Copy**
  1. Press Copy on a web answer with a table.
  2. Paste into a rich document.
  - Expected: Plain text pastes (documents the missing formatted copy).
- **Read aloud and stop**
  1. Open More message actions, choose Read message aloud.
  2. Reopen the menu.
  - Expected: Audio plays; the item reads Stop reading message and stops playback.
- **Local reply**
  1. Send in Local mode.
  2. Open the menu.
  - Expected: Read aloud shows the privacy-unavailable reason.
- **Mobile export**
  1. Long-press an answer, choose Export Message…, then Export as PDF.
  - Expected: A PDF file and share sheet appear.
- **Save to project**
  1. In a chat inside a Project choose Save to project.
  - Expected: Toast Saved to <project>; file Answer from <title>.md is in knowledge.
- **CLI /copy code**
  1. In the TUI ask for code then type /copy code.
  - Expected: Only the last code block is on the clipboard.

**Where to look when it fails**

- Speech failures settle with reason in route.ts finalize call.
- Toast and alert strings above identify the failing control.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- CLI: [70-qa/test-plans/cli/017-assistant-message-components.md](../../70-qa/test-plans/cli/017-assistant-message-components.md)
- VS Code: [70-qa/test-plans/vscode/017-assistant-message-components.md](../../70-qa/test-plans/vscode/017-assistant-message-components.md)
- Chrome: [70-qa/test-plans/chrome/017-assistant-message-components.md](../../70-qa/test-plans/chrome/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **Formatted copy missing on every app.** Affects: All six apps. Evidence: MessageBubble.tsx:2274 writeText only. Work needed: Write rich and plain flavours.
- **Brief says save to project and save as document missing on web; both exist.** Affects: Brief accuracy. Evidence: MessageBubble.tsx:4026-4049. Work needed: Update brief.
- **Mobile has save as document; brief says missing.** Affects: Brief accuracy. Evidence: mobile MessageBubble.tsx:1700-1705. Work needed: Update brief.
- **Chrome has read aloud; brief says missing.** Affects: Brief accuracy. Evidence: bubbles.ts:536. Work needed: Update brief.
- **CLI export is whole-conversation, not one answer; no read aloud or share.** Affects: CLI users. Evidence: registry.rs:440-470. Work needed: Add per-answer export if required.
- **Save to Project missing on mobile, CLI, VS Code, Chrome.** Affects: Those apps. Evidence: none found. Work needed: Add or document.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- api:POST /api/voice/speech

## Unknown

- Where saved web document artifacts persist.
- Whether web read aloud falls back to device speech in all cases (useTTS.ts only partly read).
- Per-plan limits for the speech endpoint.
- Whether the Electron Desktop adds share or save behaviour.
- The CLI share command (none found, not searched exhaustively).
