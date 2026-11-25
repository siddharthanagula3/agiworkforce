---
id: "F020-08"
type: "feature"
title: "Select, find and export"
aliases: ["Select, find and export", "Text selection across rendered blocks (S20.26)", "Find-in-answer highlighting (S20.27)", "Print and export rendering (S20.28)", "MessageSearch", "Search messages", "Export Chat History", "Select Text sheet", "Print conversation"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S20.26", "S20.27", "S20.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/features/chat/components/messages/MessageSearch.tsx", "file:apps/web/features/chat/services/document-export-service.ts", "file:apps/mobile/services/fileCreation.ts", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "F020-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-08 Select, find and export

Web and desktop let the reader press Ctrl or Cmd+F to search the open chat, step through messages that match, see every match highlighted, and print or export the chat as Markdown, PDF, Word, HTML or JSON. Mobile has text selection, PDF, print, text and Markdown export but no find. CLI exports source text only.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.26](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2026), [S20.27](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2027), [S20.28](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2028).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the reader copy part of an answer by selecting it, find a word inside the current conversation with highlighted matches, and take the conversation out of the app as a file or a paper print with formatting kept.

**Why it exists.** Long answers need quoting, searching and archiving. Print and export must keep headings, tables, code and maths or the file is hard to use. [inferred]

**Who uses it.** Anyone reading long chats: people quoting an answer, people checking what was said, people sending a chat to a colleague or keeping a record.

**Problems it solves**

- Finding a phrase in a long conversation.
- Keeping tables, code and maths in a PDF or Word copy.
- Printing a virtualized chat that normally only has some rows in the page.
- Quoting part of an answer on a phone.

**Use cases**

- Press Ctrl+F in a web chat, type 'invoice' and press Enter to jump between messages that mention it.
- Open the chat title menu, choose Print, and get the whole chat on paper (web).
- Export a chat as a Word document with tables and maths intact (web).
- On the phone, choose Export as PDF and share it through the system share sheet.

## 2. User experience

**Where to find it**

- Web chat: Ctrl or Cmd+F opens the bar labelled 'Search messages' (apps/web/features/chat/components/messages/ChatMessageList.tsx:1538-1543; MessageSearch.tsx:80-81).
- Web chat: conversation title menu items 'Print' and 'Export…' (apps/web/features/chat/components/ConversationTitleMenu.tsx:189-198).
- Web: the dialog titled 'Export Chat History' with formats Markdown, PDF, Word Document, HTML, JSON (EnhancedExportDialog.tsx:178; format names at :47-60 and following).
- Web: a link from global search opens a chat with the match highlighted (WebChatPage.tsx:1143; global-search-service.ts:39-45).
- Desktop: the same web screens in the Electron window (doc: AGENTS.md section 5).
- Mobile: message action 'Select Text' (apps/mobile/src/features/chat/components/MessageBubble.tsx:1691) opening a sheet titled 'Select Text' (SelectTextSheet.tsx:73); sheet 'Export Conversation' with 'Export as PDF', 'Print', 'Export as Text', 'Export as Markdown', 'Copy All Messages' (ConversationExportSheet.tsx:50-74, :179); per-message 'Export Message' (FileExportButton.tsx:181).
- CLI: slash command /export (apps/cli/src/tui/tui_app.rs:6033).
- VS Code: command 'Code: Export Conversation' (apps/extension-vscode/package.json:234-235).
- Chrome: artifact export only through the artifact panel (apps/extension/src/features/side-panel/artifactPanel.ts:385); no chat find, print or export found.

**Before you start**

- A conversation with messages. Web find needs a browser that supports the CSS highlight feature; otherwise no highlight is painted but the message count still works (use-text-match-highlight.ts:45-47, :93-95).
- Mobile export needs the system share sheet; if there are no messages the sheet shows 'Nothing to Export' (ConversationExportSheet.tsx, flow near :100-103).

**Screens and controls**

- Web find bar: text box (placeholder 'Search messages...'), match label ('N of M matches' or 'No matches'), previous and next buttons ('Go to previous match', 'Go to next match'), close button ('Close search'); Enter = next, Shift+Enter = previous, Escape = close (MessageSearch.tsx:42-61, :63-68, :116-147).
- Web export dialog: format cards, optional filename, checkboxes 'Include metadata (title, date, message count)' (Markdown only) and 'Include message timestamps' (EnhancedExportDialog.tsx; shown except for JSON).
- Mobile Select Text sheet: a read-only text area where the person selects words; the sheet can quote the selection into the reply (SelectTextSheet.tsx:42-45, :87-95).
- Mobile export sheet rows and a progress state per row (ConversationExportSheet.tsx:226-282).

**Journey**

1. Find (web): 1. Press Ctrl/Cmd+F; the bar opens and focuses. 2. Type a word. 3. The label shows how many messages match and the matches are painted in the text. 4. Press Enter or the next arrow to scroll the list to the next matching message. 5. Escape or the close button clears the query.
2. Print (web): 1. Open the title menu, choose Print. 2. The app marks the page for print, expands the list and opens the browser print dialog. 3. After printing, the mark is removed (print-conversation.ts:1-31).
3. Export (web): 1. Choose 'Export…'. 2. Pick a format and options. 3. Press the export button. 4. A file downloads and a toast says 'Exported as <format>' (EnhancedExportDialog.tsx:161); on error 'Export failed. Please try again.'.
4. Export (mobile): 1. Open the conversation export sheet. 2. Pick PDF, Print, Text or Markdown. 3. The app writes a file in its exports folder and opens the share sheet; Print opens the system print dialog (fileCreation.ts:804-830; ConversationExportSheet.tsx:104-140).
5. Select (mobile): 1. Long-press or use the message action 'Select Text'. 2. Select words in the sheet.

**What the person sees and gets**

- Highlighted matches coloured by the warning fill, with a system 'Mark' colour in forced-colour mode (text-match-highlight.css).
- Match count label read as a polite status (MessageSearch.tsx:104-110).
- Files: .md, .pdf, .docx, .html, .json (web); .pdf, .txt, .md (mobile); .md or .json or the last answer (CLI).
- Toasts and alerts: 'Export failed. Please try again.' (web); 'Export Failed' and 'Print Failed' alerts (mobile).

**Settings**

- Web export dialog options: metadata and timestamps, filename.
- No find or print settings found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web find: matching message groups are found against the rendered text of each message (markdownRenderedText), case-insensitive (apps/web/features/chat/lib/message-search.ts:9-37). Next and previous wrap around and scroll the virtual list to the row (ChatMessageList.tsx:1518-1535).
- Web highlight: all matches in mounted messages are painted using the browser's CSS highlight registry, not by changing the DOM, capped at 500 matches (use-text-match-highlight.ts:14, :45-47, :84, :96-117). It re-paints on page changes with a MutationObserver (:111). It skips buttons, inputs, hidden and screen-reader-only text (:9-11).
- Web jump from global search: the query and message id in the address highlight matches until the next click (use-text-match-highlight.ts:126-145; global-search-service.ts:39-45).
- Web print: printConversation sets data-print-scope='transcript', expands the virtual list, calls window.print and removes the mark afterwards (print-conversation.ts:1-31; ChatMessageList.tsx:1172-1186, :2110). The print style hides side bars and composer, forces black on white, avoids breaking messages and prints link addresses (apps/web/app/globals.css:1862-1930).
- Web export: five formats. PDF and Word are built from parsed Markdown blocks (document-export-service.ts:30-54). Text direction is kept in PDF (export-pdf.ts:295, :383) and Word (export-docx.ts:82). Maths is exported (export-math.ts).
- Mobile export: HTML from Markdown with safe links and MathML, printed to PDF, moved into an exports folder with a random folder name, stale files swept after a day (exportMarkdownHtml.ts:17, :353; fileCreation.ts:43-53, :63-72, :181-199). Print uses the system dialog and ignores a cancel (fileCreation.ts:821-830). Word export exists (fileCreation.ts:749).
- Mobile selection: bubble draws text non-selectable, and a 'Select Text' sheet provides selection (MessageBubble.tsx:2115, :1691; SelectTextSheet.tsx).
- CLI: /export writes Markdown, JSON or only the last answer to a new file and refuses to overwrite (apps/cli/src/repl/registry.rs:440-471, :579-623).
- VS Code: 'Code: Export Conversation' offers Copy as Markdown or Save as a Markdown file (ChatStateManager.ts:4070-4115).

**Incomplete**

- Web find counts and steps through messages, not individual matches; the label '2 of 5 matches' means message number 2 of 5 (ChatMessageList.tsx:1499-1535; MessageSearch.tsx:66). [inferred from code]
- Web highlight only covers messages that are mounted; the chat list is virtualised, so matches in far-away messages are painted only after the list scrolls to them. [inferred from ChatMessageList.tsx:2110 and the print-scope comment]
- Web dialog PDF and Word are built from a Markdown transcript with emoji role headings (conversation-export.ts:93-97), so the exported headings include those emoji.
- Mobile PDF text is drawn without any right-to-left handling; exportMarkdownHtml.ts has no direction code (rg found none).
- Mobile exports a conversation as a whole; per-answer export is through FileExportButton (FileExportButton.tsx:39-68).

**Present but disconnected or switched off**

- The comment above the search state in ChatMessageList.tsx:1493 is cut off mid-sentence and mentions MessageSearch 'was complete but never exported or mounted'; it is mounted now at ChatMessageList.tsx:2092-2102.

**Not available**

- Mobile: find in a conversation (no match found by search for find or in-chat search in apps/mobile/src).
- CLI: find; export is source Markdown or JSON, not a rendered print.
- VS Code: find, print, rendered export; only Markdown copy or save.
- Chrome: find, print, chat export (artifact export only).
- Per-answer export on web chat: not established in the code read.

## 4. Required behaviour

**Established requirements**

- A reader can drag-select text continuously across paragraphs, lists and code in one answer (web, desktop, mobile, VS Code, Chrome done; CLI unverified). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.26)
- Searching finds text inside an answer and highlights matching words in the rendered answer (web and desktop done; mobile, CLI, VS Code, Chrome missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.27)
- Printing or exporting an answer or conversation keeps rendered formatting: headings, lists, tables, code, maths (web, desktop, mobile, CLI done; VS Code, Chrome missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.28)
- An action a user cannot undo asks first; an agent never destroys user data. Export must not overwrite existing files silently. (source: doc: AGENTS.md section 9)
- Desktop is a real app but its chat shows the hosted web app, so web find and export reach Desktop. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. Web: Ctrl/Cmd+F opens the bar, focuses it, and Escape closes it and clears highlights.
2. Web: typing a word that appears 3 times in one answer paints 3 highlights and does not change the text of the message.
3. Web: with more than 500 matches only the first 500 are painted and the page stays responsive.
4. Web: Print produces every message of a long chat, not only the mounted rows; page background is white.
5. Web: export a chat with a table, a code block and a formula as PDF and Word; each keeps its structure.
6. Mobile: Export as PDF writes a file in the exports folder and opens the share sheet; a cancel leaves no error alert.
7. Mobile: Select Text lets the person select across the whole answer text.
8. CLI: /export notes.md refuses to overwrite an existing file and says so.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Find should count matches, not only messages, to agree with the brief's wording 'highlights the matching words'. [inferred]
- Mobile should offer find if parity with web is required (the brief marks it missing). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the real match number (word level) in the find label.
- [proposed] Add chat find to mobile using the same rendered-text matcher (markdownRenderedText).
- [proposed] Give VS Code and Chrome a rendered export (HTML or PDF) or mark the brief item 'not planned'.
- [proposed] Add direction handling to the mobile export HTML.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageSearch | `apps/web/features/chat/components/messages/MessageSearch.tsx` | Find bar UI with keyboard handling and match label. |
| hook | useTextMatchHighlight / useSearchJumpHighlight | `apps/web/features/chat/hooks/use-text-match-highlight.ts` | Paints matches with the browser highlight registry, 500 cap, MutationObserver. |
| config | text-match-highlight.css | `apps/web/features/chat/hooks/text-match-highlight.css` | Highlight colours and forced-colour fallback. |
| service | matchingGroupIndexes | `apps/web/features/chat/lib/message-search.ts` | Finds message groups whose rendered text contains the query. |
| component | ChatMessageList (find state, keyboard, print scope) | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Opens find with Ctrl/Cmd+F; steps matches; expands list for print. |
| service | printConversation | `apps/web/features/chat/lib/print-conversation.ts` | Sets the print scope, waits, calls window.print, cleans up. |
| config | print stylesheet | `apps/web/app/globals.css` | @media print rules for the transcript (line 1862 onward). |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Menu items Print and Export…. |
| component | EnhancedExportDialog | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` | Export Chat History dialog and format switch. |
| service | ChatExportService | `apps/web/features/chat/services/conversation-export.ts` | Builds Markdown, HTML and JSON from a chat. |
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | downloadAsPDF, downloadAsDOCX, downloadAsMarkdown from parsed blocks. |
| service | export-pdf / export-docx / export-math | `apps/web/features/chat/services/export-pdf.ts` | PDF drawing (direction-aware); sibling export-docx.ts and export-math.ts do Word and maths. |
| service | markdownDocument | `packages/ui/unified-chat/src/components/markdown/markdownDocument.ts` | Parses Markdown into document blocks and plain rendered text used by find and export. |
| service | fileCreation | `apps/mobile/services/fileCreation.ts` | Mobile export, exports folder, share and print. |
| service | markdownToExportHtml | `apps/mobile/services/exportMarkdownHtml.ts` | Markdown to safe HTML for mobile PDF and print. |
| component | ConversationExportSheet / FileExportButton | `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx` | Mobile export sheet; FileExportButton.tsx is the per-message export. |
| component | SelectTextSheet | `apps/mobile/src/features/chat/components/SelectTextSheet.tsx` | Mobile text selection and quote. |
| command | /export | `apps/cli/src/repl/registry.rs` | CLI export to a new file; used from apps/cli/src/tui/tui_app.rs:6033. |
| command | agi-workforce.exportConversation | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code Markdown copy or save. |
| service | global search href with highlight | `apps/web/features/chat/services/global-search-service.ts` | Adds highlightMessage and highlightQuery to the chat link. |
| test | Export and find tests | `apps/web/features/chat/lib/message-search.test.ts` | Find matching; siblings print-conversation.test.ts, services/conversation-export.test.ts. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web find: the key handler opens the bar; the query matches rendered text of loaded messages; highlights are painted on the device. | device | ChatMessageList.tsx:1538-1543; message-search.ts:9-37; use-text-match-highlight.ts:96-117 |
| Web global search link: the search results come from the global search service (data source not traced here), then the chat opens with highlight parameters. | device and our servers | global-search-service.ts:39-45 builds the link; where results come from is unknown for this page |
| Web print: print scope is set on the page element, the list is expanded and the browser print dialog opens. | device | print-conversation.ts:1-31 |
| Web export: Markdown is built, parsed to blocks and drawn into PDF (jsPDF) or Word (docx) in the browser; the file is downloaded through a temporary link. | device | document-export-service.ts:30-66; EnhancedExportDialog.tsx:128-160 |
| Mobile export: Markdown to HTML, system print service makes a PDF, the file is moved into the cache exports folder, then the system share sheet opens. | device | fileCreation.ts:181-199, :63-72; ConversationExportSheet.tsx:104-140 |
| CLI export: the session is turned into Markdown or JSON and written to a new file under the workspace. | device | apps/cli/src/repl/registry.rs:440-471 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Find query | React state in ChatMessageList (memory); the jump query lives in the page address | no (jump link is a URL) | Cleared when the bar closes (ChatMessageList.tsx:1507-1511) |
| Rendered-text cache for find | A Map in memory, trimmed to messages in use (message-search.ts:36-38) | no | Emptied when the query is empty |
| Exported files | Web: the browser download folder. Mobile: cache exports folder, then wherever the person shares it. CLI: workspace file. | no | Mobile sweeps exports older than 24 hours (fileCreation.ts:38, :43-53); web and CLI files are kept by the person |
| Export contents | The chat messages, including source lists and attachment names (conversation-export.ts:101-118) | no | Expiring links are replaced by '[expiring link removed from export]' (conversation-export.ts:15) |

**Models and providers.** No model or provider is called. Find and export read stored message text. The model that wrote the text only matters through the Markdown it produced. (apps/web/features/chat/lib/message-search.ts:9-37)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code in the find, print and export code. Reaching a chat needs sign-in as usual (see SYS-authentication-and-identity). |
| Permissions | Browser print and download permissions; mobile share sheet; CLI writes inside the workspace root (registry.rs:447-450). Web find uses no permissions. |
| Subscription | None found in the code; no plan check in MessageSearch, EnhancedExportDialog or ConversationExportSheet. |
| Limits and metering | 500 highlighted matches (use-text-match-highlight.ts:14). Mobile exports swept after 24 hours (fileCreation.ts:38). No metering found. |
| Feature flags | None found in the code for this feature. |
| Model compatibility | Any model. |
| Provider restrictions | None found in the code. |
| Local mode | Find, print and export work on stored text and run on the device in every mode; nothing is sent to Cloud or a provider by these actions in the code read. Electron desktop has no Local mode (apps/desktop/electron/config.ts:8-11). Whether the mobile Local conversations use the same export sheet: the sheet reads the chat's messages and has no mode branch in lines 100-140. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty query or no matches | No label for empty query; 'No matches' for none; previous and next disabled. | MessageSearch.tsx:63-68, :119, :129 |
| Browser has no highlight API | No highlight painted; message jump still works. | use-text-match-highlight.ts:45-47, :93-95 |
| Typing with an IME composition | Enter and Escape ignored while composing. | MessageSearch.tsx:44 |
| Export fails (web) | Toast 'Export failed. Please try again.'; error logged. | EnhancedExportDialog.tsx (catch after :161) |
| No session selected (web) | Toast 'No session selected'. | EnhancedExportDialog.tsx:102-105 |
| Empty conversation (mobile) | Alert 'Nothing to Export'; empty content throws 'Cannot export empty content'. | ConversationExportSheet.tsx:100-103; fileCreation.ts:188-190 |
| Print cancelled (mobile) | Silently ignored. | fileCreation.ts:825-828 |
| Existing file (CLI) | Warns and writes nothing. | registry.rs:461-466 |
| Print with a virtual list (web) | List expands first so all rows exist; scope removed after print or after 1 s. | print-conversation.ts:6-30 |
| Forced-colour mode | Highlights use system Mark colours. | text-match-highlight.css |
| Offline, retry, timeout | Not handled in the code for find; exports are local so need no network. | services above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/message-search.test.ts`: Matching message groups against rendered text.
- `apps/web/features/chat/lib/print-conversation.test.ts`: Print scope set, expand callback, cleanup, error propagation.
- `apps/web/features/chat/services/conversation-export.test.ts`: Markdown, HTML and JSON export of a chat.
- `apps/web/features/chat/services/__tests__/document-export-service.test.ts`: Markdown to document blocks (kinds, marks, fences, tables, lists, maths, paragraphs).
- `apps/web/features/chat/services/export-math.test.ts`: Maths conversion for export.
- `packages/ui/unified-chat/src/components/markdown/markdownDocument.test.ts`: Document model used by export.
- `packages/ui/unified-chat/src/components/markdown/markdownRenderedText.test.ts`: Rendered plain text used by find.
- `apps/web/features/chat/services/__tests__/global-search-service.test.ts`: Global search results and links.
- `apps/mobile/__tests__/export-markdown-html.test.ts`: Mobile export HTML: destinations, emphasis, safe links, MathML, bad TeX.
- `apps/mobile/__tests__/docx-export-table.test.ts`: Mobile Word export tables.
- `apps/mobile/__tests__/ConversationExportSheet.test.tsx`: Mobile export sheet.
- `apps/mobile/__tests__/SelectTextQuote.test.tsx`: Mobile Select Text and quote.

**Test scenarios**

- **Find and step (web)**
  1. Open a chat with at least 3 messages containing the word 'plan'.
  2. Press Ctrl/Cmd+F, type 'plan'.
  3. Press Enter three times, then Shift+Enter once.
  - Expected: Label shows 'N of M matches', list scrolls to each matching message and wraps; every 'plan' is highlighted; Escape clears.
- **500 match cap**
  1. Open or create a chat with over 500 occurrences of a one-letter word.
  2. Search for it.
  - Expected: At most 500 highlights; the page stays responsive.
- **Print long chat (web)**
  1. Open a chat with 60 messages.
  2. Title menu, Print.
  3. Check the print preview.
  - Expected: All 60 messages present, black on white, no side bar or composer, links followed by their address.
- **Export with structure (web)**
  1. Use a chat with a table, a code block and a formula.
  2. Export as PDF and as Word Document.
  3. Open both files.
  - Expected: Headings, table, code and formula appear; an Arabic paragraph is right-aligned.
- **Mobile export and share**
  1. Open the export sheet.
  2. Choose Export as PDF.
  3. Cancel the share sheet.
  4. Open the file from the share target on a second run.
  - Expected: PDF file with the chat formatting; no error alert after cancel.
- **CLI export refuses overwrite**
  1. Run /export notes.md twice.
  - Expected: First writes the file; second warns that it already exists and writes nothing.

**Where to look when it fails**

- Web: console error '[Export] Failed:' (EnhancedExportDialog.tsx catch).
- Web: highlight names 'agi-find-match' and 'agi-jump-match' in the page's highlight registry (use-text-match-highlight.ts:6-7).
- Mobile: alerts 'Export Failed', 'Print Failed' (ConversationExportSheet.tsx).
- CLI: messages 'Nothing to export, no messages in session yet.' and '... already exists, so nothing was written.' (registry.rs:604, :462).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **Mobile has no find in a conversation.** Affects: Mobile users. Evidence: S20.27 status missing in the brief; no find feature in apps/mobile/src chat components by search. Work needed: Add find using markdownRenderedText plus highlight in native text.
- **Web find counts messages not matches, and highlights only mounted rows.** Affects: Web and desktop users with long chats. Evidence: message-search.ts:9-37; ChatMessageList.tsx:1499-1535; use-text-match-highlight.ts:90-117. Work needed: Count matches; scroll to each match; paint after scroll.
- **No rendered export or print on VS Code and Chrome; CLI exports raw Markdown only.** Affects: VS Code, Chrome, CLI. Evidence: ChatStateManager.ts:4070-4115 (Markdown only); registry.rs:598-623; artifactPanel.ts:385. Work needed: Decide scope; add HTML or PDF export, or mark not planned.
- **Mobile export HTML has no right-to-left handling.** Affects: Mobile users with Arabic or Hebrew answers. Evidence: No direction code in apps/mobile/services/exportMarkdownHtml.ts or fileCreation.ts (rg). Work needed: Use textDirection per block in exportMarkdownHtml.ts.
- **Web PDF/DOCX export from the dialog adds emoji role headings.** Affects: Web users exporting to PDF or Word. Evidence: apps/web/features/chat/services/conversation-export.ts:93-97. Work needed: Use plain role labels for document exports.
- **No test for the highlight hook, MessageSearch, or the PDF and Word builders directly.** Affects: Web and desktop. Evidence: No test file referencing use-text-match-highlight or export-pdf found (rg over apps and packages tests). Work needed: Add unit and browser tests.
- **Brief says mobile export is done for 'conversation or answer' but per-message export is a separate button and web per-answer export is not established.** Affects: Web users wanting one answer. Evidence: FileExportButton.tsx:181; web per-answer export not found. Work needed: Check if per-answer export exists on web or add it.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/features/chat/components/messages/MessageSearch.tsx
- file:apps/web/features/chat/services/document-export-service.ts
- file:apps/mobile/services/fileCreation.ts
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- F020-09

## Unknown

- Whether web chat has a per-answer export or print button (only the title-menu items were found).
- Which tests, if any, drive the CSS highlight path in a real browser (none found).
- Where global-search results are fetched from (server or local) and whether that path sends the query to our servers.
- Whether CLI text selection works as a person expects in the terminal UI (brief says unverified; terminal-owned).
- How the Electron desktop handles window.print and file downloads (apps/desktop/electron not searched for print handlers; a search for printToPDF found nothing).
- Where the mobile 'Select Text' message action is surfaced (long-press menu or row) was not traced.
