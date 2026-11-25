---
id: "F020-02"
type: "feature"
title: "Code blocks"
aliases: ["Code blocks", "Fenced code", "S20.11", "CodeBlock", "CodeCard", "code card", "syntax highlighting"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S20.11"]
depends_on: ["SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-02 Code blocks

Shows text between triple backticks as a monospace block that keeps spaces and line breaks. Web and desktop add a language label and Copy, Download, Expand and Edit buttons, and colour the code with Shiki after the block finishes streaming. Other apps draw their own blocks. If colouring fails, plain code still shows.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.11](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2011).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws fenced and indented code as a distinct, scrollable monospace block so whitespace is preserved and code can be copied.

**Why it exists.** Models answer programming and command-line questions with code. Readers need exact characters, a quick copy, and a visual break from prose (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md S20.11).

**Who uses it.** Developers and anyone following commands or snippets in an answer, on all six apps.

**Problems it solves**

- Spaces and line breaks in code are kept.
- One click copies the whole block (web, VS Code, Chrome, mobile).
- Unknown languages and highlight failures still show readable code.
- Shell commands are labelled as examples that have not run (web).

**Use cases**

- Copy a Python snippet from a web answer.
- Download a block as a file named for its language on web or mobile.
- Read a diff with green and red lines.
- Read a bash block in the CLI with a framed header.

## 2. User experience

**Where to find it**

- Web and Desktop (Tauri): inside any assistant message with a fenced block; header shows the language and buttons 'Copy', 'Edit' (when an editor is attached), 'Download <file name>', 'Expand code' (packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:176-207).
- Mobile: a code card with accessibility labels '<language> code block', 'Preview HTML', 'Edit code', 'Expand code', 'Show more code', 'Show less code' (apps/mobile/src/features/chat/components/CodeCard.tsx:431, 505, 524, 542, 555).
- CLI: a framed block with a header '┌─ <lang> ─' and a '│' gutter (apps/cli/src/tui/markdown_renderer.rs:175-203).
- VS Code: block with buttons 'Copy', 'Explain', 'Apply' (apps/extension-vscode/src/webview/render.ts:44-57).
- Chrome side panel: block with a copy button titled 'Copy code' and the language label (apps/extension/src/features/side-panel/markdown.ts:314-348; _locales/en/messages.json spCodeCopy).

**Before you start**

- A reply that contains a fenced or indented code block.

**Screens and controls**

- Web copy button shows 'Copy', then 'Copied' for 2 seconds, or 'Copy failed' for 4 seconds (CodeBlock.tsx:33-34, 93-125).
- Web 'Download' saves a file whose name comes from the language (codeFileName.ts:3-40; CodeBlock.tsx:108-112).
- Web 'Expand code' opens a full-screen dialog with Copy, Download and 'Close expanded code' (CodeBlock.tsx:240-277).
- Web html blocks show a preview once complete; while streaming a status line says the preview will appear when the block is complete (CodeBlock.tsx:208-222).
- Web shell blocks (bash, sh, shell, zsh) show 'These commands are examples only; they have not been executed.' (CodeBlock.tsx:229-239).
- Web diff blocks colour added and removed lines (CodeBlock.tsx:36-59).

**Journey**

1. The reply contains a fence.
2. The renderer finds the language from the fence label.
3. While the block is still streaming the code shows as plain text; when it settles, Shiki colours it.
4. The reader scrolls, copies, downloads or expands.

**What the person sees and gets**

- Coloured tokens after highlight; plain text before it or when it fails (HighlightedCode.tsx:57).
- Copy confirmation text and a check icon.
- A downloaded file with the language extension (txt for unknown).

**Settings**

- Web code theme choice among six themes: GitHub, GitHub dimmed, GitHub high contrast, Catppuccin, Dracula soft, Everforest (shikiHighlighter.ts:57-68). Where the user picks it is not read here.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop: MarkdownPre routes fences to CodeBlock; a multi-line fence with no language is drawn as a 'text' block (MarkdownContent.tsx:731-736). Inline code without a language class is a small monospace chip (CodeBlock.tsx:318-324).
- Highlighting is skipped for the streaming tail (CodeBlock.tsx:166-173 enabled={!isStreamTail}) and keeps plain text if the grammar is missing or the highlighter rejects (HighlightedCode.tsx:44-57; tests HighlightedCode.test.tsx:152, 166).
- Shiki supports 48 named languages loaded on demand (shikiHighlighter.ts:6-56).
- Download passes through spreadsheetSafeExport (CodeBlock.tsx:110).
- Mobile CodeCard: download through share sheet with alert 'Download failed' on error (CodeCard.tsx:141-165); highlighting is optional per call (MessageContentRenderer.tsx:1636 highlightCode).
- CLI: syntect highlighting with a palette theme; unknown language falls back to plain text; a failing line falls back to plain (markdown_renderer.rs:592-640).
- VS Code: block is escaped HTML, with diff line classes; no colouring (render.ts:36-57).
- Chrome: highlight is applied asynchronously with Shiki for languages it knows; failure leaves plain text (markdown.ts:352-385).

**Incomplete**

- VS Code gives no syntax colours, only diff colours (render.ts:36-42).
- Chrome and VS Code have no Expand or Download for code; mobile has Expand and Download; CLI none.

**Present but disconnected or switched off**

- Edit button on web only appears when a code-block editor context is supplied and the block is not streaming (CodeBlock.tsx:181-193); the editor context is passed for assistant messages only (MessageBubble.tsx:2894).

**Not available**

- CLI: no copy button (terminal).
- Brief line 'Failure to highlight must not hide the code (not verified in code)' is verified for web by HighlightedCode.tsx:44-57 and test HighlightedCode.test.tsx:166.

## 4. Required behaviour

**Established requirements**

- Fenced code blocks render as a monospace block preserving whitespace. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.11)
- A block the renderer cannot draw (unknown language) degrades to a readable fallback instead of vanishing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.30)
- An unclosed fence mid-stream renders as a code block until the closing fence arrives. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.23)

**Acceptance criteria**

1. A fenced block with indented lines keeps every space and line break on all six apps.
2. A block labelled with an unknown language shows as a plain monospace block, not an error.
3. On web, Copy puts the exact source on the clipboard and shows 'Copied' then resets after about 2 seconds.
4. On web, a failed clipboard write shows 'Copy failed'.
5. On web, a bash block shows the 'examples only' notice.
6. While a block is still streaming on web, it is not coloured and an html block shows the waiting notice.
7. If the highlighter rejects, the code remains visible (web).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The language label shown is the fence label as written, lower-cased [inferred from CodeBlock.tsx:291].
- Copy must copy the code without the trailing newline [inferred from CodeBlock.tsx:292].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add syntax colours to VS Code blocks using the shared highlighter.
- [proposed] Give Chrome and VS Code an Expand action for long blocks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeBlock / FencedCodeBlock | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Web and desktop block with header, copy, download, expand, edit, diff, html preview (79-340). |
| component | MarkdownPre | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Decides plain pre, text block, rich block or answer surface for each fence (692-739). |
| component | HighlightedCode | `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Paints plain text first, then Shiki tokens; keeps plain on failure (22-73). |
| service | shikiHighlighter | `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts` | Language loaders, themes, highlightToLines, cache (6-80). |
| config | highlightLanguages | `packages/ui/unified-chat/src/components/markdown/highlightLanguages.ts` | Maps a fence label to a supported language id (imported at shikiHighlighter.ts:3). |
| service | codeFileName | `packages/ui/unified-chat/src/components/markdown/codeFileName.ts` | Chooses the download file name and extension (3-40). |
| service | downloadTextFile | `packages/ui/unified-chat/src/components/markdown/downloadTextFile.ts` | Saves text through a temporary blob link (3-12). |
| service | closeUnterminatedCodeFence | `packages/platform/utils/src/markdownSource.ts` | Closes an open fence for markdown-it renderers (230-244). |
| component | CodeCard | `apps/mobile/src/features/chat/components/CodeCard.tsx` | Mobile code card with copy, download, expand, edit, preview (141-555). |
| component | renderCodeCard | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Builds a CodeCard for each fence (1366-1400). |
| service | highlight_code | `apps/cli/src/tui/markdown_renderer.rs` | syntect highlighting with plain fallback (592-640). |
| service | renderCodeBlock | `apps/extension-vscode/src/webview/render.ts` | Escaped code with Copy, Explain, Apply buttons (36-57, 59-70). |
| service | Chrome code copy and highlight | `apps/extension/src/features/side-panel/markdown.ts` | renderCode, addCodeCopyButtons, highlightCodeBlocks (185-199, 314-385). |
| test | CodeBlock tests | `packages/ui/unified-chat/src/components/markdown/__tests__/CodeBlock.test.tsx` | Header, copy states, 200-line block, inline code, mermaid hand-off. |
| service | spreadsheetSafeExport | `packages/ui/unified-chat/src/lib/tabular.ts` | Neutralises spreadsheet formulas in downloaded code (476). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Parser marks a fence with its language label. | device | MarkdownContent.tsx:616-625 |
| Web draws plain code at once, then asks Shiki to colour it (loads grammar on demand from the app bundle). | device | HighlightedCode.tsx:33-55; shikiHighlighter.ts:6-56 |
| Copy writes the code to the clipboard; Download builds a file in the browser. | device | CodeBlock.tsx:93-112; downloadTextFile.ts:3-12 |
| Mobile download writes a file then opens the share sheet. | device | CodeCard.tsx:157-161 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Highlight cache and copied text | In memory (cache) and the system clipboard | No | Cache lives for the page session; clipboard is the OS's |
| Downloaded code file | User's Downloads or share target | No | Kept by the user |

**Models and providers.** No model or provider call. Code text comes from any model. The 'Explain' and 'Apply' buttons in VS Code send actions to the extension host; what they call is not read here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | Clipboard write permission may be denied by the browser; web handles it with 'Copy failed' and a client-failure report (CodeBlock.tsx:99-103). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. Code theme is a user choice (shikiHighlighter.ts:57-68). |
| Model compatibility | Any model. |
| Provider restrictions | none found in the code. |
| Local mode | Works offline in Local mode; highlighting grammars ship in the app bundle (dynamic imports, shikiHighlighter.ts:6-56). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Block drawn plain; highlight off for the tail; html preview waits. | CodeBlock.tsx:166-173, 208-222 |
| Unknown language | Plain monospace block kept. | HighlightedCode.tsx:57; test HighlightedCode.test.tsx:152 |
| Highlighter fails | Plain text stays; a failure is reported to the sink. | HighlightedCode.tsx:44-50, 57 |
| Clipboard denied | 'Copy failed' for 4 seconds on web; Chrome shows retry label. | CodeBlock.tsx:99-103; markdown.ts:326-331 |
| Empty fence | A fence with only whitespace is not drawn as a code block with a label (hasFenceBody check). | MarkdownContent.tsx:609-614, 731 |
| Mobile download fails | Alert 'Download failed'. | CodeCard.tsx:161 |
| Keyboard and screen reader | Web pre is focusable with an aria-label '<language> code block'; mobile labels the card. | CodeBlock.tsx:224; CodeCard.tsx:431 |
| Offline, timeout, cancel | not handled in the code (no network step in code display). | Searched CodeBlock.tsx and HighlightedCode.tsx; grammars are bundled dynamic imports (shikiHighlighter.ts:6-56). |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/CodeBlock.test.tsx`: Header with language and copy, copy success and failure, 200-line block, inline code, mermaid hand-off, hyphenated language.
- `packages/ui/unified-chat/src/components/markdown/__tests__/HighlightedCode.test.tsx`: Plain text when disabled, paint before resolve, token spans after resolve, plain on missing grammar and on rejection, cache hits, theme change.
- `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.test.ts`: Highlighter helper (file name only).
- `packages/ui/unified-chat/src/components/markdown/__tests__/codeFileName.test.ts`: Download file names (name only).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCard.test.tsx`: Mobile code card (name only). Siblings: codeCardActions, fences, CodeCard.extraction, CodeCard.previewEdit.
- `apps/extension-vscode/src/__tests__/codeBlockActions.webview.test.ts`: Code block action buttons in the webview.
- `apps/extension/__tests__/side-panel-markdown-fence.test.ts`: Chrome fence rendering (2 tests).
- `apps/cli/src/tui/markdown_renderer.rs`: Escape sequences stripped inside code blocks (test at line 677).

**Test scenarios**

- **Whitespace kept**
  1. Reply with a fenced Python block with nested indentation.
  2. View on each app.
  - Expected: Indentation and blank lines identical to source.
- **Copy**
  1. On web click 'Copy' on a block.
  2. Paste elsewhere.
  - Expected: Exact source pasted; button shows 'Copied' then resets.
- **Unknown language**
  1. Reply with a fence labelled 'qqq'.
  - Expected: Plain monospace block; label shows the fence label; no error.
- **Highlight failure**
  1. In a test, make the highlighter reject.
  - Expected: Code stays visible as plain text.
- **Streaming fence**
  1. Stream a reply and stop before the closing fence.
  - Expected: Open block shows as a code block, uncoloured, until the close arrives.

**Where to look when it fails**

- Client failure class markdown_render with detail render (HighlightedCode.tsx:49) and code_copy with permission_denied (CodeBlock.tsx:100).
- Chrome: no log line found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **VS Code has no syntax colours.** Affects: VS Code users. Evidence: render.ts:36-57 only escapes and colours diff lines. Work needed: Use the shared highlighter or document the choice.
- **Chrome and VS Code lack Download and Expand for code.** Affects: Chrome, VS Code. Evidence: render.ts:44-57; markdown.ts:314-348. Work needed: Decide parity target with web.
- **Brief says highlight failure not verified; code and test show it is handled on web. Other apps have no test named for it.** Affects: Mobile, Chrome, VS Code. Evidence: HighlightedCode.tsx:57; markdown.ts:352-385. Work needed: Add failure tests per app.

**Depends on**

- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx

## Unknown

- Where the user picks the web code theme.
- What the VS Code Explain and Apply buttons call.
- Whether mobile highlights during streaming.
- Contents of mobile code card tests beyond names.
- Whether the Tauri desktop shows the Edit button (editor context source not read).
