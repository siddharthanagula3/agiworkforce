---
id: "PLAN-desktop-020"
type: "test-plan"
title: "Desktop · 20. Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "20"
---
# Desktop · 20. Markdown and text rendering

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S20.01 Paragraphs.

- **Expected:** Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:392
- **Where to find it:** Chat > type "Write two short paragraphs about the sea" in the box that shows "How can I help you today?" > send (labels found in the code)
- **Steps:**
  1. Sign in and open Chat.
  2. Click the box that shows "How can I help you today?", type "Write two short paragraphs about the sea", and send.
  3. Wait for the reply to finish.
  4. Compare: the two paragraphs are separate blocks with a gap between them.

## S20.02 Headings.

- **Expected:** ATX headings (# to ######) render as styled headings, not literal hash marks.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:775
- **Where to find it:** Chat > type "Answer with a heading and a smaller sub-heading" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Answer with a title using # and a sub-heading using ##" and send.
  3. Wait for the reply to finish.
  4. Compare: the title and sub-heading appear larger and bolder, with no # marks shown.

## S20.03 Bold, italic, and strikethrough.

- **Expected:** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72
- **Where to find it:** Chat > type "Write one sentence with **bold**, *italic* and ~~strikethrough~~ words" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type the sentence with **bold**, *italic* and ~~strikethrough~~ and send.
  3. Wait for the reply to finish.
  4. Compare: bold text is heavier, italic is slanted, and the struck text has a line through it.

## S20.04 Ordered lists.

- **Expected:** Numbered lists render with their numbers (respecting the start value) and list indentation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:473
- **Where to find it:** Chat > type "List 3 tips as a numbered list starting at 3" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "List 3 tips as a numbered list starting at 3" and send.
  3. Wait for the reply to finish.
  4. Compare: the list shows numbers 3, 4, 5 with indentation.

## S20.05 Unordered lists.

- **Expected:** Bulleted lists render with bullet markers and indentation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:456
- **Where to find it:** Chat > type "List 3 fruits using dash bullets" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "List 3 fruits using dash bullets" and send.
  3. Wait for the reply to finish.
  4. Compare: each item has a bullet marker and is indented.

## S20.06 Nested lists.

- **Expected:** Indented sub-lists render nested under their parent item with deeper indentation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:349 (quoted code not found in the file now)
- **Where to find it:** Chat > type "Give a list with one sub-list nested under an item" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Give a list with one sub-list nested under an item" and send.
  3. Wait for the reply to finish.
  4. Compare: the sub-list sits under its parent item with deeper indentation.

## S20.07 Task lists.

- **Expected:** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:419
- **Where to find it:** Chat > type "Make a checklist with - [ ] and - [x] items" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Make a checklist with one unchecked and one checked item" and send.
  3. Wait for the reply to finish.
  4. Compare: the items show empty and ticked checkboxes that match their state.

## S20.08 Blockquotes.

- **Expected:** Lines starting with > render as an indented, visually distinct quotation block.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:796
- **Where to find it:** Chat > type "Quote a short line of a poem using >" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Quote a short line of a poem using > at the start" and send.
  3. Wait for the reply to finish.
  4. Compare: the quoted line sits in an indented block that looks different from normal text.

## S20.09 Horizontal rules.

- **Expected:** A thematic break (---, ***) renders as a horizontal divider.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2029 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:943
- **Where to find it:** Chat > type "Write one line, then a line of three dashes, then one more line" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Write one line, then a line of three dashes, then one more line" and send.
  3. Wait for the reply to finish.
  4. Compare: a thin horizontal divider appears between the two lines.

## S20.10 Inline code.

- **Expected:** `inline code` renders in a monospace style distinct from prose.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:71 (quoted code not found in the file now)
- **Where to find it:** Chat > type "Use the word `inline code` in one sentence" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Use the word `inline code` in one sentence" and send.
  3. Wait for the reply to finish.
  4. Compare: the code words appear in a monospace style that differs from the sentence text.

## S20.11 Fenced code blocks.

- **Expected:** Fenced code blocks render as a monospace block preserving whitespace.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:78 (quoted code not found in the file now)
- **Where to find it:** Chat > type "Show a short Python function in a code block" in the chat box > send (labels found in the code)
- **Steps:**
  1. Open Chat.
  2. Type "Show a short Python function in a fenced code block with indentation" and send.
  3. Wait for the reply to finish.
  4. Compare: the code is in a monospace block with its indentation kept and a "Copy" button at the top right.

## S20.12 Links.

- **Expected:** [text](url) renders as a link the reader can see and follow.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:345
- **Where to find it:** Chat > type "Give me a link to the Wikipedia page on the sea, with the link text 'Sea'" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type the request for a link and send.
  3. Wait for the reply to finish.
  4. Compare: "Sea" appears as blue underlined text with a small arrow icon.
  5. Click it and see that it opens outside the chat, in a new window or tab.

## S20.13 Autolinks.

- **Expected:** A bare URL in the answer (https://…, www.…) becomes a clickable link.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72
- **Where to find it:** Chat > type "Include the full web address https://example.com in your reply" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type "Include the full web address https://example.com in your reply" and send.
  3. Wait for the reply to finish.
  4. Compare: the bare web address appears as a link that can be clicked.

## S20.14 Footnotes where supported.

- **Expected:** Footnote references ([^1]) render as superscript markers linked to a footnotes section.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72; packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:22
- **Where to find it:** Chat > type "Answer with one footnote reference and its footnote at the end" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type the footnote request and send.
  3. Wait for the reply to finish.
  4. Compare: the reference shows as a small raised marker.
  5. Click the marker and check that it jumps to the matching footnote at the bottom.

## S20.15 Tables.

- **Expected:** GFM pipe tables render as a grid with a header row and aligned cells.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:549
- **Where to find it:** Chat > type "Make a table comparing 3 fruits by price and colour" in the chat box > send (labels found in the code)
- **Steps:**
  1. Open Chat.
  2. Type the table request and send.
  3. Wait for the reply to finish.
  4. Compare: the table has a header row, a grid of cells and aligned columns.
  5. Hover over the table to see its buttons.

## S20.16 Wide-table scrolling.

- **Expected:** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:460 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Rule is in packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx (markdownTableWrapClass comment). Code audit did not confirm the exact scroll behaviour.
- **Needs:** a wide table in an answer
- **Steps:**
  1. Ask in Chat for a table with 10 or more columns and send.
  2. Make the app window narrow by dragging its edge.
  3. Compare: the table scrolls sideways inside its own area and the rest of the page does not scroll sideways or get cut off.

## S20.18 Download-table action.

- **Expected:** A rendered table offers a download (CSV/XLSX) of its contents.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:122; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:801
- **Where to find it:** Chat > answer with a table > hover over the table > Download as CSV (labels found in the code)
- **Steps:**
  1. Ask in Chat for a table and send.
  2. Move the mouse over the table so its buttons show.
  3. Click "Download as CSV".
  4. Compare: a CSV file with the table contents is saved to the computer.

## S20.19 Inline mathematical notation.

- **Expected:** Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:73; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822
- **Where to find it:** Chat > type "Write the formula $E=mc^2$ inside a sentence" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type the request with the inline formula in $...$ and send.
  3. Wait for the reply to finish.
  4. Compare: the formula appears typeset as maths inside the sentence, not as raw $ signs.

## S20.20 Block mathematical notation.

- **Expected:** Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:6; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822
- **Where to find it:** Chat > type "Show the formula $$E=mc^2$$ on its own line" in the chat box > send (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open Chat.
  2. Type the request with the display formula in $$...$$ and send.
  3. Wait for the reply to finish.
  4. Compare: the formula appears centred on its own line as typeset maths.

## S20.21 Escaped delimiters.

- **Expected:** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/platform/utils/src/markdownSource.ts:216; packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:10
- **Where to find it:** no screen of its own. Code is in packages/platform/utils/src/markdownSource.ts and preprocessMath.ts; whether the model keeps the backslashes is not controlled by the app.
- **Steps:**
  1. Send in Chat: "Repeat this exactly: 5 \$ 3 and \*not italic\*".
  2. Wait for the reply.
  3. Compare: the characters show without the backslashes and the text is not turned into italic.

## S20.22 Partially streamed Markdown.

- **Expected:** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:106
- **Where to find it:** no screen of its own. Streaming renderer is in packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx; the reply is only partial for a short time.
- **Steps:**
  1. Send in Chat a request for a long answer with a heading and a list, such as "Write a 300-word guide with headings and bullet points".
  2. Watch the answer while it is still arriving.
  3. Compare: headings and bullets appear as formatted text as they come in, not as # or - symbols.

## S20.23 Incomplete code-fence handling.

- **Expected:** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts:37
- **Where to find it:** no screen of its own. Hard to time by hand; the completion code is in packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts.
- **Steps:**
  1. Send in Chat "Write a long Python script in one code block".
  2. Watch the answer while it is still arriving, before the code block is closed.
  3. Compare: the unfinished code shows inside a code block box, not as plain text, until the block closes.

## S20.24 Sanitized embedded markup.

- **Expected:** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2900; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:821
- **Where to find it:** no screen of its own. Sanitizing is in packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx and the message code in MessageBubble.tsx.
- **Steps:**
  1. Send in Chat: "Write this exact text: <script>alert('x')</script> and <b>bold html</b>".
  2. Wait for the reply.
  3. Compare: no pop-up or script runs; the tags show as inert text or are removed, and nothing executes.

## S20.25 Safe external-link handling.

- **Expected:** External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:378
- **Where to find it:** Chat > click a link in an answer, such as the one from "Give me a link to the Wikipedia page on the sea" (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Get an answer with a web link in Chat.
  2. Hover the link and read its address in the status bar at the bottom of the window.
  3. Click the link.
  4. Compare: it opens outside the app in the browser, and the app stays on the chat.

## S20.26 Text selection across rendered blocks.

- **Expected:** A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2029 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:943
- **Where to find it:** Chat > in one answer, drag the mouse from the first paragraph down through a list and a code block (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Get an answer with a paragraph, a list and a code block in Chat.
  2. Press the mouse button at the start of the first paragraph.
  3. Drag down through the list and the code block.
  4. Compare: the whole run of text across all blocks is highlighted in one selection.
  5. Press Command+C and paste into a text field to check the copied text.

## S20.27 Find-in-answer highlighting.

- **Expected:** Searching finds text inside an answer and highlights the matching words in the rendered answer.
- **Code:** done. Evidence present: apps/web/features/chat/hooks/use-text-match-highlight.ts:90; apps/web/features/chat/components/messages/MessageSearch.tsx:32; apps/web/features/chat/services/global-search-service.ts:47; apps/web/features/chat/pages/WebChatPage.tsx:1143
- **Where to find it:** Open a conversation with answers > press Cmd+F > the "Search messages..." bar opens at the top of the messages. On the desktop app, Edit > Find > Find… opens the "Find in page" bar instead (the desktop find bar also highlights text in answers). (labels found in the code)
- **Needs:** a conversation with answers that contain the searched word
- **Steps:**
  1. Open a conversation that has several assistant answers containing a common word.
  2. Press Cmd+F (or choose Edit > Find > Find… in the desktop app).
  3. Type the word in the "Search messages..." box (or the "Find in page" box).
  4. Look for the matching words highlighted in the answers and the count such as "1 of 3 matches"; press Return to jump to the next match and Shift+Return for the previous one.

## S20.28 Print and export rendering.

- **Expected:** Printing or exporting an answer/conversation keeps the rendered formatting (headings, lists, tables, code, math).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/markdownDocument.ts:295 (quoted code not found in the file now); apps/web/features/chat/services/export-pdf.ts:379; apps/web/features/chat/services/export-pdf.ts:295; apps/web/features/chat/services/export-docx.ts:84
- **Where to find it:** Open a conversation > click the "Conversation options" button > Print (prints the whole transcript, expanded). Or "Conversation options" > Export… > Export Chat History > choose PDF or Word Document > Export. (labels found in the code)
- **Needs:** a conversation with formatted answers (headings, lists, a table, code, math)
- **Steps:**
  1. Open a conversation that has headings, a list, a table and a code block in an answer.
  2. Click the "Conversation options" button and choose Print; in the print dialog check the preview keeps headings, lists, tables and code.
  3. Or click "Conversation options" and choose Export…, then pick PDF or Word Document under "Export Format" and download the file.
  4. Open the saved file and compare headings, lists, tables, code and math with the on-screen answer.

## S20.29 Right-to-left content.

- **Expected:** Right-to-left text (Arabic, Hebrew) renders right-aligned in the correct direction.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2839; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:943
- **Where to find it:** no screen of its own. Direction comes from the browser's dir="auto" on the message text, not from a visible setting. Per-paragraph direction was not found in MarkdownContent.tsx; a mixed-language answer may take its direction from the whole message. Not verified by running the app.
- **Needs:** none (a keyboard that can type Arabic or Hebrew helps)
- **Steps:**
  1. Type a sentence in Arabic or Hebrew in the message box and send it.
  2. Look at the sent bubble: the text should start on the right and read right to left.
  3. Ask for a reply in Arabic or Hebrew and check the assistant bubble is also right-aligned, with punctuation at the correct end of the line.

## S20.30 Fallback rendering for unsupported blocks.

- **Expected:** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:229; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:368
- **Where to find it:** New chat > ask the assistant for a Mermaid diagram (a ```mermaid block). If the diagram fails to draw, the message shows "This diagram could not be drawn" with the source kept below. (labels found in the code)
- **Needs:** none; a failed diagram depends on the assistant's output and cannot be forced from the UI
- **Steps:**
  1. Start a new chat and ask the assistant for a flowchart as a Mermaid diagram.
  2. If the drawing fails, look for the message "This diagram could not be drawn" with a reason line.
  3. Check that the source text is still shown below the message with a copy control, and that the rest of the answer is still visible.
  4. Optionally ask for an unknown code language block and check it still shows as readable text.
