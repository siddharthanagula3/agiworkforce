---
id: "AREA-020"
type: "area"
title: "Markdown and text rendering"
features: ["F020-01", "F020-02", "F020-03", "F020-04", "F020-05", "F020-06", "F020-07", "F020-08", "F020-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 20. Markdown and text rendering

Answers from the assistant arrive as Markdown, a plain-text format with symbols for headings, lists, bold, links, tables and code. This area turns that text into the formatted page a person reads, so headings, lists, tables, code and maths look right instead of showing raw symbols. It also keeps the text safe: raw HTML and unsafe links must not run or open dangerously. It works while the answer is still streaming in, so the reader sees formatted text growing rather than raw symbols until the end.

**Who uses it.** Every user of every app who reads an answer, and every user who sends a message (user messages use the same renderer, but raw HTML in them is shown as plain text, MessageBubble.tsx:2900). The code shows no plan gate on rendering. Table copy and download are plain UI actions with no plan check seen. Developers change the renderer. Workspace admins and paid plans are not involved in this area as far as the code shows.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F020-01](F020-01-text-formatting.md) | Text formatting | built | built | built | built | built | built |
| [F020-02](F020-02-code-blocks.md) | Code blocks | built | built | built | built | built | built |
| [F020-03](F020-03-links-images-and-link-safety.md) | Links, images and link safety | built | built | built | partly | built | built |
| [F020-04](F020-04-footnotes.md) | Footnotes | built | built | built | no | no | built |
| [F020-05](F020-05-tables-and-table-actions.md) | Tables and table actions | partly | partly | partly | partly | partly | partly |
| [F020-06](F020-06-math-formulas.md) | Math formulas | built | built | built | no | built | built |
| [F020-07](F020-07-live-rendering-while-the-answer-streams-in.md) | Live rendering while the answer streams in | built | built | built | built | built | built |
| [F020-08](F020-08-select-find-and-export.md) | Select, find and export | built | built | partly | partly | partly | partly |
| [F020-09](F020-09-right-to-left-text-and-fallback-blocks.md) | Right-to-left text and fallback blocks | built | built | partly | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/020-markdown-and-text-rendering.md](../../10-requirements/capabilities/020-markdown-and-text-rendering.md).

## How this area works in the code

1. **Pick the renderer for the message.** The web message bubble decides what to draw. It streams the answer through StreamingMarkdownContent while it arrives, and uses MarkdownContent once finished. User messages are told to show raw HTML as text. (`apps/web/features/chat/components/messages/MessageBubble.tsx:2884-2900`, `apps/web/features/chat/components/messages/MessageBubble.tsx:157-165`)
2. **Split the streamed text.** While an answer streams, settled blocks are split off and drawn once. The unfinished tail is completed so an open bold, link or table still draws correctly. (`packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:64`, `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:106`, `packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts:148`)
3. **Prepare the text.** Math delimiters are normalised, single-line display maths is lifted onto its own lines, citation markers and answer badges are linked, and task-list labels are restored. (`packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:9-22`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:889-919`)
4. **Parse into a tree.** The Markdown is parsed with GFM (tables, task lists, strikethrough), maths, line breaks, a lossless-table guard and an assistant-fence identity step. User messages use a version that turns raw HTML into text. (`packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:17-44`, `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:56-63`, `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:71-82`)
5. **Sanitise and add maths.** Raw HTML is passed through, then cleaned by an allow-list. Maths is typeset by KaTeX last. (`packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:819-823`, `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts:7-36`)
6. **Draw each element.** Each Markdown element is mapped to a React component: headings, lists, tables, links, images and code blocks. Links and images pass through safety checks and the citation logic. (`packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:772-805`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:345-380`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:812-817`)
7. **Table actions.** A table is wrapped with its copy, download and expand buttons. Copy reads the table cells and writes tab-separated text. Download builds a CSV and saves it as table.csv. (`packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:35-85`, `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:91-125`, `packages/ui/unified-chat/src/lib/tabular.ts:327-331`)
8. **Find and export.** Find walks the message text nodes and sets browser highlights. Export converts the Markdown into a document model, then builds a PDF or DOCX file. (`apps/web/features/chat/hooks/use-text-match-highlight.ts:90-104`, `packages/ui/unified-chat/src/components/markdown/markdownDocument.ts:299-310`, `apps/web/features/chat/services/export-pdf.ts:373`, `apps/web/features/chat/services/export-docx.ts:82`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Main renderer shared by web and desktop: maps each Markdown element to a component and runs the sanitiser and maths. |
| `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` | Draws an answer while it streams: settled blocks once, the unfinished tail again each time. |
| `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | Lists the parser plugins (GFM, maths, breaks, lossless tables) and the literal-HTML variant used for user messages. |
| `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts` | The allow-list that decides which HTML tags, attributes and URL protocols survive. |
| `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx` | Table wrapper with copy (tab-separated), download (CSV) and full-screen expand. |
| `packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts` | Closes open bold, links, code and fences in the streaming tail so partial text draws correctly. |
| `packages/ui/unified-chat/src/components/markdown/markdownItMath.ts` | Maths parser for the markdown-it renderers used by the VS Code and Chrome extensions. |
| `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile renderer: headings, lists, tables with sort and copy, footnotes, right-to-left, fences and maths. |
| `apps/cli/src/tui/markdown_renderer.rs` | Terminal renderer for the CLI: pulldown-cmark events turned into coloured terminal lines. |
| `apps/extension-vscode/src/webview/render.ts` | VS Code sidebar renderer using markdown-it with raw HTML turned off. |
| `apps/extension/src/features/side-panel/markdown.ts` | Chrome side-panel renderer using markdown-it, footnotes, maths and DOMPurify. |
| `apps/web/features/chat/hooks/use-text-match-highlight.ts` | Find-in-answer highlighting using the browser highlight API. |

## What is stored

- Rendered answer text: no storage. The renderer reads message text that is stored by the chat service (not traced here).: Memory only, in the page while it is open.
- Math size cache (up to 256 entries), keyed by formula and font size.: Memory only, apps/mobile/src/features/chat/components/MathBlock.tsx (measuredSizes map).
- Image approvals for cross-site images, kept for the session.: Memory only, approvedImageKeys set in ImageTrust.tsx (imported by MarkdownContent.tsx).
- Exported PDF, DOCX or HTML files, one folder per export, swept when stale.: Device file storage, exports folder on mobile (apps/mobile/services/fileCreation.ts:60-68 and removeStaleExports).
- Table copy and download files are not stored; they are built on the fly.: Clipboard or a browser download (MarkdownTable.tsx:110, 122).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **literalHtml**: When on, raw HTML in the text is shown as plain text, not drawn. Used for user messages. (apps/web/features/chat/components/messages/MessageBubble.tsx:2900 passes literalHtml={isUser}; read in packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:944.)
- **isStreaming**: Switches to the streaming path: unfinished tables are held back, the tail is completed, and citation linking is turned off until the answer finishes. (StreamingMarkdownContent.tsx:106; MarkdownContent.tsx (linkifyNumericCitations and processedContent, around lines 905-915).)
- **finishedAnswer**: Settles the text once the answer is finished. (MarkdownContent.tsx (settledContent memo, around lines 895-900).)
- **trustedImageUrls**: Lists image sites the reader has already trusted, so their images load without a prompt. (MarkdownContent.tsx (trustedImages memo, around line 905-910); ImageTrust.tsx.)
- **onTaskToggle**: Makes task checkboxes clickable. When missing, they are read-only. (MarkdownContent.tsx (taskToggle memo).)
- **footnoteScope**: Adds a prefix to footnote ids so two answers on one page do not clash. (MarkdownContent.tsx (remarkRehypeOptions memo, around line 894-898).)

## Shared between apps

[{"what": "The main renderer, parsing, sanitiser, maths preprocessing, streaming split, tables, images, citations and the markdown-it task and maths plugins.", "where": "packages/ui/unified-chat/src/components/markdown/ (used by web and desktop, by mobile through @agiworkforce/unified-chat/* imports, and by VS Code through markdownItMath and markdownItTaskLists)."}, {"what": "Markdown source normalisation (normalizeMathDelimiters, codeRanges, markdownItFenceSource).", "where": "packages/platform/utils/src/markdownSource.ts."}, {"what": "Tabular CSV and TSV builders used by table copy and download.", "where": "packages/ui/unified-chat/src/lib/tabular.ts."}, {"what": "Separate per app: the mobile renderer (MessageContentRenderer.tsx, MarkdownInline.tsx, MathBlock.tsx), the CLI renderer (markdown_renderer.rs with pulldown-cmark), the VS Code renderer (render.ts), the Chrome renderer (markdown.ts with DOMPurify), and the export code (export-pdf.ts, export-docx.ts, mobile exportMarkdownHtml.ts).", "where": "apps/mobile, apps/cli, apps/extension-vscode, apps/extension and apps/web/features/chat/services."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief marks copy-table as missing on every app, but the shared table component has a copy button that writes tab-separated text, and mobile copies tables too. (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:60-74 and :110; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:436.)
- The brief marks mobile download-table as missing, but mobile exports CSV through the share sheet. Web and mobile export only CSV, while the brief says CSV or XLSX; no XLSX table export was found in the table code. (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:438-440; packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:80-81 (label says Download as CSV).)
- The brief marks footnotes as missing on mobile and Chrome, but both have footnote code. Only VS Code and CLI are missing footnotes as the brief says. (apps/mobile/src/features/chat/components/MarkdownInline.tsx:410-428; apps/extension/src/features/side-panel/markdown.ts:3 and :217-239.)
- Table download uses the cell text of the rendered table. If a cell holds a formula, the exported text may differ from the source. Not tested. (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:21-33.)
- Table copy writes tab-separated text while the download label says CSV. This is by design but may confuse a reader. (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:110 and :122.)
- The CLI parser turns on tables, strikethrough and task lists only. Maths, footnotes and bare-address links are not turned on, so those features are absent in the terminal. (apps/cli/src/tui/markdown_renderer.rs:149.)

## Not established

- Whether the brief's statuses for Chrome and VS Code print or export are right. Search found no print or export code in those two apps, but I did not read every file.
- Whether bare web addresses become clickable on mobile (MarkdownInline.tsx:156 and :261 were cited by the brief; not opened), and in the Chrome and VS Code renderers beyond the linkify setting.
- Whether right-to-left works on mobile; code exists (MessageContentRenderer.tsx:632-638) but no run was made.
- Where the web find bar is mounted: the brief cites WebChatPage.tsx:964, not opened in full. MessageSearch.tsx is the search bar component.
- What happens when a maths formula fails to draw on web and mobile: fallback text was not traced.
- Plan or feature-flag gates on any of these features: none were found in the renderer, but the app-level chat screens were not searched for gates.
- How task checkbox clicks are saved back to the message: the callback exists (onTaskToggle) but its caller was not traced.
- Whether the brief's line numbers are current: several cited lines differ from the code I opened (for example MessageBubble.tsx:2082 and MarkdownContent.tsx:293), so the brief's line numbers are probably stale.
- The relayed request asked for testing on localhost and one surface at a time. This task is a read-only code review with no builds, tests or servers, so nothing was run and no surface was tested.
