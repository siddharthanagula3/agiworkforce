---
id: "F025-09"
type: "feature"
title: "Ask about a selected passage or the whole file"
aliases: ["Ask about this file", "Send Selection to a New Chat", "sendSelectionToNewSession", "Select text for a question", "Ask about selected page or range", "Citation-linked highlighting", "S25.20", "S25.21", "S25.22"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S25.20", "S25.21", "S25.22"]
depends_on: ["surface:web", "surface:desktop", "surface:vscode", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "F025-07", "F025-08", "F025-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-09 Ask about a selected passage or the whole file

Ask a question about a file. On web and the public Desktop, a bar under the open Library file ('Ask about this file') attaches the whole file to a new chat with your question as the draft. In VS Code, a command starts a new chat from the selected lines. Selected-passage questions elsewhere and cited-passage highlighting do not exist.

Area: [25. File previews and readers](README.md). Requirement items: [S25.20](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2520), [S25.21](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2521), [S25.22](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2522).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Moves a file, or a selected part of one, into a chat so the person can ask about it. Web and Desktop attach the whole Library file and stage the question. VS Code puts a reference to the file and the selected line range into a fresh chat composer.

**Why it exists.** People read a file and then want to question it without re-uploading or copy-pasting. Chat leaders let you ask about an open file.

**Who uses it.** Anyone reading a document in the Library; developers selecting code in VS Code.

**Problems it solves**

- No manual attach step after opening a file.
- A code selection becomes a precise line-range reference.

**Use cases**

- Open a quarterly report PDF and type 'What is the Q3 revenue?'.
- Select a function in VS Code and send it to a new chat.
- Open a citation from project sources and land on its page in the preview modal.

## 2. User experience

**Where to find it**

- Web and public Desktop: Library, open a file, the bar at the bottom of the viewer with placeholder 'Ask about this file' and a send button labelled 'Ask' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1328-1377). Shown only when the host passes askAboutFile (LibraryView.tsx:1328; apps/web/features/library/components/LibraryView.tsx:209).
- VS Code: command 'Code: Send Selection to a New Chat' in the Command Palette and in the editor context menu when text is selected (apps/extension-vscode/package.json:812-814, 1024-1027).
- Tauri desktop build: no ask bar (DesktopLibrary.tsx passes no askAboutFile, lines 157-207).
- Mobile, CLI, Chrome: not available.

**Before you start**

- Web and Desktop: signed in, a previewable file open.
- VS Code: an active editor with a non-empty selection.

**Screens and controls**

- Ask bar: text input aria-label 'Ask about this file', disabled decorative plus and microphone buttons, a decorative 'Auto' label, send button 'Ask' disabled while the text is empty (LibraryView.tsx:1328-1377).
- VS Code warning 'select the code you want the new chat to start from.' when nothing is selected (commandSetup.ts:882-886).
- VS Code modal 'Start a new chat with this selection?' with detail 'The reply still being written will stop and will not be recoverable.' and button 'Start new chat' (commandSetup.ts:888-898).
- Project modal: opened by a citation with a page number, the PDF opens at that page (FilePreviewModal.tsx PDF iframe '#page=').

**Journey**

1. Web: open a file in the Library viewer.
2. Type a question in the bar and press Enter or click 'Ask'.
3. The app reads the file, stages it as an attachment and the question as the new-chat draft, then routes to the new chat page.
4. Review and send the staged message; the chat answers with the file attached.
5. VS Code: select code, run the command, confirm the warning if a reply is running, then see '@path#Lx-Ly' in a new chat composer.

**What the person sees and gets**

- Web: navigation to the new chat with the draft and attachment (apps/web/features/library/components/LibraryView.tsx:209-214).
- Web failure toast: 'That file could not be attached. Download it and attach it instead.' (same lines).
- VS Code: composer prefilled with '@<relative path>#L<start>-L<end> ' and a file-range reference (commandSetup.ts:274-310, 899-902).
- The question is not sent automatically in either app: the draft is staged or prefilled [inferred from stageNewChatDraft and prefillComposer, which set text only].

**Settings**

- Model choice: the 'Auto' label in the ask bar is decorative and aria-hidden (LibraryView.tsx:1360-1366); the model is whatever the new chat uses.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web shared viewer ask bar calls transport.askAboutFile(item, question) and clears the input (LibraryView.tsx:1190-1196).
- Web host stages the Library file as the new-chat attachment, sets work mode chat and stages the question as the draft, then routes to the new-chat path (apps/web/features/library/components/LibraryView.tsx:209-214; apps/web/features/library/lib/library-chat-handoff.ts:56-65).
- VS Code starts a new chat from the selection with a line-range reference, after a modal when a reply is in flight (apps/extension-vscode/src/core/commandSetup.ts:880-903).
- Citation to page: project sources read ?page= from the link and the modal opens the PDF at that page (apps/web/features/projects/components/SourcesPanel.tsx:167-170, 846; FilePreviewModal.tsx PDF iframe).
- Mobile file viewer accepts a page and shows 'Page N' in its header (FileViewerScreen.tsx:98-104).

**Incomplete**

- Citation-linked highlighting jumps to a page only for PDFs in the web project modal; it does not highlight the cited passage (FilePreviewModal.tsx interface comment 'only paginated previews can honour it', lines 15-19).
- VS Code selection reference carries line numbers but the selected text is not copied into the message by this command (commandSetup.ts:274-310) [inferred that the chat resolves the reference later; not read].

**Present but disconnected or switched off**

- The plus and microphone buttons in the ask bar are rendered disabled and aria-hidden (LibraryView.tsx:1337-1347, 1366-1377).
- Tauri desktop Library passes no askAboutFile, so the bar is hidden there.

**Not available**

- Selected-text question on web, Desktop, mobile, Chrome and CLI: no selection capture code found.
- Ask about a page or range of a document on web, Desktop, mobile, CLI, Chrome.
- Citation highlight of the passage on every app; the brief lists mobile, CLI, VS Code, Chrome missing.

## 4. Required behaviour

**Established requirements**

- Users can select text in a file and ask a question about it (S25.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.20)
- Users can ask about a selected page or range of a file (S25.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.21)
- Opening a citation highlights the cited passage in the file (S25.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.22)
- Anything that stops a reply and cannot be undone names what is lost before it happens. (source: doc: AGENTS.md section 9)
- packages/ui/unified-chat must not assume one surface's routing, billing or account model. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. Web: with a file open, typing a question and clicking 'Ask' lands on a new chat with the file attached and the question in the composer.
2. Web: when the file cannot be read, the toast about attaching is shown and the person stays in the viewer.
3. The ask bar is absent when the host provides no askAboutFile.
4. VS Code: no selection gives the 'select the code' warning and starts nothing.
5. VS Code: with a reply running, declining the modal leaves the current chat and reply untouched.
6. VS Code: accepting starts a new chat whose composer holds the file and line range.
7. A citation link with a page opens the PDF at that page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A selected passage in the web viewer should be sendable with the question [inferred from S25.20].
- The ask bar should say what it attaches (the whole file) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Capture the browser selection in the text preview and offer 'Ask about selection'.
- [proposed] Add a page or range field for documents.
- [proposed] Highlight the cited passage using the quoted text in the citation.
- [proposed] Hide or remove the disabled plus, 'Auto' and microphone decorations or make them work.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay ask form | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Ask bar and submitQuestion (lines 1190-1196, 1328-1377). |
| other | LibraryTransport.askAboutFile | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Host hook for the question (line 273). |
| service | askAboutFile host | `apps/web/features/library/components/LibraryView.tsx` | Stages file and draft then routes to new chat (lines 209-214). |
| service | stageLibraryItemForNewChat | `apps/web/features/library/lib/library-chat-handoff.ts` | Reads the file, stores it as staged attachment, parks the draft (lines 24-65). |
| store | chat store draft and composer toggles | `apps/web/features/library/lib/library-chat-handoff.ts` | useChatStore draft for the pending conversation (lines 35-40, 62-64). |
| command | agi-workforce.sendSelectionToNewSession | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code handler (lines 880-906). |
| service | buildSidebarReferenceDraft | `apps/extension-vscode/src/core/commandSetup.ts` | Builds @path#Lx-Ly text and range reference (lines 274-310). |
| config | VS Code command and menu | `apps/extension-vscode/package.json` | Title and editor context menu when editorHasSelection (lines 812-814, 1024-1027). |
| component | FilePreviewModal page prop | `apps/web/features/projects/components/FilePreviewModal.tsx` | Opens PDFs at a cited page. |
| component | SourcesPanel citation open | `apps/web/features/projects/components/SourcesPanel.tsx` | Reads ?page= and passes page (lines 84, 167-170, 846). |
| component | FileViewerScreen page | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Shows 'Page N' for a cited page (lines 98-104). |
| component | PdfFileView | `apps/mobile/src/features/chat/components/artifact-viewers/PdfFileView.tsx` | Mobile PDF page caption (line 197). |
| service | readLibraryItemFile | `apps/web/features/library/lib/library-chat-handoff.ts` | Fetches the file bytes into a File; maps 'too large' (lines 24-33). |
| screen | DesktopLibrary (Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Shared Library without askAboutFile. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types a question and submits; the viewer calls askAboutFile with the item and the trimmed text. | device | LibraryView.tsx:1190-1196 |
| The host fetches the file through the library file route to build an attachment File in memory. | device and our servers | apps/web/features/library/lib/library-chat-handoff.ts:24-33 (readLibraryItemFile); libraryItemToFile not opened |
| The file is held in a module variable and the question in the chat store draft; the router moves to the new chat page. | device | library-chat-handoff.ts:56-65; apps/web/features/library/components/LibraryView.tsx:209-214 |
| When the person sends, the normal chat turn pipeline uploads the attachment and runs the chosen model. | our servers | [inferred] not read; see SYS-chat-turn-pipeline |
| VS Code builds the reference locally, resets the sidebar conversation and prefills the composer. | device | commandSetup.ts:899-902 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Staged attachment (file bytes in memory) | Module variable stagedAttachments in the web page | No until the chat is sent | Taken once by takeStagedLibraryAttachments (library-chat-handoff.ts:94-97) |
| Draft question | Chat store draft for the pending conversation (and a persisted draft read) | Not until sent | Until sent or edited |
| VS Code reference (path and range) | Sidebar composer state | No until sent | Until sent or cleared |

**Models and providers.** The ask bar does not choose a model; the 'Auto' label is decoration (LibraryView.tsx:1360-1366). The answer comes from the model the new chat uses, per the chat turn pipeline, and depends on that chat's mode (Cloud, own key). Not read here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on web and Desktop; the VS Code chat needs the extension's own sign-in or runtime [not read]. |
| Permissions | VS Code validates workspace context files before referencing them in the other file-reference command (commandSetup.ts:868-872); the selection command references the active editor document. |
| Subscription | The ask itself is free; sending the resulting chat counts against the plan's chat usage under SYS-subscriptions-entitlements-and-usage. File attach size limits apply: a file too large to read gives the 'too large' message (library-chat-handoff.ts:28-30). |
| Limits and metering | none found in the code for the ask bar itself. Chat-turn metering applies on send. |
| Feature flags | none found in the code; the bar shows only when the host provides askAboutFile. |
| Model compatibility | not determined here; depends on the chat's model and its file support (see SYS-model-catalog-and-routing). |
| Provider restrictions | none found in the code for the ask bar. |
| Local mode | Public Desktop chat is managed-cloud-only (doc: docs/architecture/byok-provider-strategy.md:16), so the Library ask flow runs in Cloud. The VS Code selection command itself runs locally and sends nothing until the person sends the chat. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| empty question | Send button disabled; submit ignored. | LibraryView.tsx:1190-1192, 1370 |
| file cannot be read or is too large | Toast 'That file could not be attached. Download it and attach it instead.' | apps/web/features/library/components/LibraryView.tsx:209-214 |
| host without askAboutFile | No bar rendered; tested. | LibraryView.tsx:1328; LibraryView.test.tsx:1407 |
| VS Code no selection | Warning, nothing started. | commandSetup.ts:881-887 |
| VS Code reply in flight | Modal; choosing anything but 'Start new chat' cancels. | commandSetup.ts:888-898 |
| cited page missing or not a number | Opens at the start (page ignored). | SourcesPanel.tsx:168-170 |
| offline, timeout, retry | not handled in the code for the ask bar beyond the toast. | searched LibraryView.tsx ask form and apps/web/features/library/components/LibraryView.tsx:209-214 |
| accessibility | Input and send button have accessible names; decorative controls are aria-hidden and not focusable. | LibraryView.tsx:1337-1377 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: 'hands the typed question and the file to askAboutFile, then clears the composer' (1389), 'omits the ask composer entirely when the host offers no askAboutFile' (1407), 'shows the ask pill in the composer shape' (1456).
- `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts`: 'starts a new chat from the selection, carrying the lines it came from' (144), 'names what a new chat would lose while a reply is still being written, and stops on no' (162), 'asks for a selection rather than opening an empty new chat' (294).
- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Mentions FilePreviewModal; content not read, so cited-page behaviour is unconfirmed.

**Test scenarios**

- **Ask about a PDF**
  1. Web, open a PDF in the Library.
  2. Type 'What is the Q3 revenue?' and click 'Ask'.
  - Expected: New chat opens with the PDF attached and the question in the composer.
- **Too-large file**
  1. Open a file above the chat attachment limit and ask.
  - Expected: Toast telling you to download and attach it.
- **VS Code selection**
  1. Select lines 10 to 20 in a file.
  2. Run 'Code: Send Selection to a New Chat'.
  - Expected: New chat, composer shows @path#L11-L21 style reference.
- **VS Code reply in flight**
  1. Start a long reply.
  2. Run the command and choose Cancel on the modal.
  - Expected: Reply continues; no new chat.
- **Citation page**
  1. Open a project source link with ?page=3.
  - Expected: Preview modal PDF opens at page 3.
- **Selected text on web**
  1. Select a sentence in a text preview.
  - Expected: Today: no 'ask about selection' control appears (gap).

**Where to look when it fails**

- Web toast text above; console errors from stageLibraryItemForNewChat.
- VS Code output channel; the command id agi-workforce.sendSelectionToNewSession.
- Network: GET /api/files/{id} during file read.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- VS Code: [70-qa/test-plans/vscode/025-file-previews-and-readers.md](../../70-qa/test-plans/vscode/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **No question about selected text on web, Desktop, mobile, Chrome** Affects: Web, Desktop, mobile, Chrome. Evidence: brief S25.20; no selection code in LibraryView.tsx. Work needed: Capture the selection in the shared viewer and attach it to the staged draft.
- **No page or range question** Affects: All except VS Code line ranges. Evidence: brief S25.21. Work needed: Page or range input for documents.
- **No passage highlight from a citation** Affects: All apps. Evidence: brief S25.22; FilePreviewModal page comment lines 15-19. Work needed: Search for the quoted text and highlight it; needs F025-08.
- **Decorative disabled controls in the ask bar** Affects: Web, Desktop. Evidence: LibraryView.tsx:1337-1377. Work needed: Remove or wire them (AGENTS.md section 9 forbids dead controls).
- **Mobile library has no ask-about-file** Affects: Mobile. Evidence: No askAboutFile in apps/mobile/src/features/library/index.tsx; FileViewerScreen only has an 'Open chat' button when the file names its chat (lines 150-160). Work needed: Add an ask entry or decide to rely on Open chat.
- **Tauri Library lacks the ask bar** Affects: Tauri build. Evidence: DesktopLibrary.tsx:157-207. Work needed: None unless Tauri becomes public.
- Not built on: Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:vscode
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- F025-07
- F025-08
- F025-10

## Unknown

- Whether the VS Code chat expands the @path#Lx-Ly reference into the selected text on send (not read).
- How the new-chat page consumes takeStagedLibraryAttachments and uploads it.
- Whether the Electron Desktop shows the ask bar exactly as web (assumed from doc: AGENTS.md section 5, not run).
- Notebook.test.tsx content for citation page behaviour was not opened.
- The model used for the resulting chat turn.
