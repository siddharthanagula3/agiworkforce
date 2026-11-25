# Area 20. Markdown and text rendering

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S20.01 Paragraphs.
- Should: Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:293; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:440; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:179; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:114

## S20.02 Headings.
- Should: ATX headings (# to ######) render as styled headings, not literal hash marks.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:445; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:254; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:94; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5; apps/extension/src/features/side-panel/markdown.ts:87

## S20.03 Bold, italic, and strikethrough.
- Should: **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:27; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:104; apps/cli/src/tui/markdown_renderer.rs:311; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5; apps/extension/src/features/side-panel/markdown.ts:87

## S20.04 Ordered lists.
- Should: Numbered lists render with their numbers (respecting the start value) and list indentation.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:356; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:182; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:156; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1234; apps/extension/src/features/side-panel/markdown.ts:87

## S20.05 Unordered lists.
- Should: Bulleted lists render with bullet markers and indentation.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:339; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:153; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:160; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5

## S20.06 Nested lists.
- Should: Indented sub-lists render nested under their parent item with deeper indentation.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:349; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:274; apps/cli/src/tui/markdown_renderer.rs:223; apps/cli/src/tui/markdown_renderer.rs:235; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5

## S20.07 Task lists.
- Should: GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:318; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:386; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:593; apps/cli/src/tui/markdown_renderer.rs:325; apps/cli/src/tui/markdown_renderer.rs:687; packages/ui/unified-chat/src/components/markdown/markdownItTaskLists.ts:3; apps/extension-vscode/src/webview/render.ts:24

## S20.08 Blockquotes.
- Should: Lines starting with > render as an indented, visually distinct quotation block.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:453; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:228; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:167; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1083

## S20.09 Horizontal rules.
- Should: A thematic break (---, ***) renders as a horizontal divider.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2029; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:540; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:422; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:230; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5

## S20.10 Inline code.
- Should: `inline code` renders in a monospace style distinct from prose.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:71; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:112; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:132; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1075

## S20.11 Fenced code blocks.
- Should: Fenced code blocks render as a monospace block preserving whitespace.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:78; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:500; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:65; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:26

## S20.12 Links.
- Should: [text](url) renders as a link the reader can see and follow.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:133; apps/cli/src/tui/markdown_renderer.rs:203; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:124; apps/extension/src/features/side-panel/bubbles.ts:687

## S20.13 Autolinks.
- Should: A bare URL in the answer (https://…, www.…) becomes a clickable link.
- Status: web done, desktop done, mobile done, cli unverified, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:27; apps/mobile/src/features/chat/components/MarkdownInline.tsx:156; apps/mobile/src/features/chat/components/MarkdownInline.tsx:261; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:138; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:7

## S20.14 Footnotes where supported.
- Should: Footnote references ([^1]) render as superscript markers linked to a footnotes section.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:27; packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:21

## S20.15 Tables.
- Should: GFM pipe tables render as a grid with a header row and aligned cells.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:401; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:306; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:279; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5

## S20.16 Wide-table scrolling.
- Should: A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:460; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:362; apps/cli/src/tui/markdown_renderer.rs:448; apps/extension-vscode/src/webview/render.ts:72; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1325; apps/extension/src/side_panel.ts:2891

## S20.17 Copy-table action.
- Should: A rendered table offers a one-click action that copies the table (e.g. as TSV/CSV/Markdown).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S20.18 Download-table action.
- Should: A rendered table offers a download (CSV/XLSX) of its contents.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:122; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:406

## S20.19 Inline mathematical notation.
- Should: Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:28; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:478; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:38; apps/mobile/src/features/chat/components/MathBlock.tsx:13; packages/ui/unified-chat/src/components/markdown/markdownItMath.ts:14; apps/extension-vscode/src/webview/render.ts:199

## S20.20 Block mathematical notation.
- Should: Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:6; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:478; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:489; packages/ui/unified-chat/src/components/markdown/markdownItMath.ts:40; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1319; apps/extension/src/features/side-panel/markdown.ts:248

## S20.21 Escaped delimiters.
- Should: Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/platform/utils/src/markdownSource.ts:95; packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:10; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:42; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:28; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:248; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:40

## S20.22 Partially streamed Markdown.
- Should: While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2076; packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:171; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:473; apps/cli/src/tui/tui_app.rs:3959; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5048; apps/extension/src/side_panel.ts:4463

## S20.23 Incomplete code-fence handling.
- Should: An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2076; packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts:37; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; packages/platform/utils/src/markdownSource.ts:109; apps/cli/src/tui/tui_app.rs:3959; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:26; apps/extension/src/features/side-panel/bubbles.ts:687

## S20.24 Sanitized embedded markup.
- Should: Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2086; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:477; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MathBlock.tsx:20; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:39; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:115

## S20.25 Safe external-link handling.
- Should: External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:286; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:26; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:59; apps/extension/src/features/side-panel/markdown.ts:11; apps/extension/src/features/side-panel/markdown.ts:96

## S20.26 Text selection across rendered blocks.
- Should: A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- Status: web done, desktop done, mobile done, cli unverified, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2029; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:540; apps/mobile/src/features/chat/components/MessageBubble.tsx:867; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:114; apps/extension/src/features/side-panel/bubbles.ts:687; apps/extension/src/features/side-panel/markdown.ts:88

## S20.27 Find-in-answer highlighting.
- Should: Searching finds text inside an answer and highlights the matching words in the rendered answer.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/hooks/use-text-match-highlight.ts:90; apps/web/features/chat/components/messages/MessageSearch.tsx:31; apps/web/features/chat/services/global-search-service.ts:45; apps/web/features/chat/pages/WebChatPage.tsx:964

## S20.28 Print and export rendering.
- Should: Printing or exporting an answer/conversation keeps the rendered formatting (headings, lists, tables, code, math).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/markdownDocument.ts:295; apps/web/features/chat/services/export-pdf.ts:373; apps/web/features/chat/services/export-pdf.ts:1112; apps/web/features/chat/services/export-docx.ts:82; apps/mobile/services/fileCreation.ts:65; apps/mobile/services/exportMarkdownHtml.ts:177; apps/mobile/services/exportMarkdownHtml.ts:136; apps/mobile/services/exportMarkdownHtml.ts:112

## S20.29 Right-to-left content.
- Should: Right-to-left text (Arabic, Hebrew) renders right-aligned in the correct direction.
- Status: web done, desktop done, mobile unverified, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2026; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:540

## S20.30 Fallback rendering for unsupported blocks.
- Should: A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:170; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:272; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:388; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:494; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:356; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:26
