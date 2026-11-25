---
id: "PLAN-web-020"
type: "test-plan"
title: "Web · 20. Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "20"
---
# Web · 20. Markdown and text rendering

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S20.01 Paragraphs.

- **Expected:** Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:392
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box on the chat screen.
  2. Type: Write three short paragraphs about the sea. Leave a blank line between each paragraph.
  3. Click 'Send message'.
  4. When the answer finishes, check that each paragraph is separate with space between them, as Expected says.

## S20.02 Headings.

- **Expected:** ATX headings (# to ######) render as styled headings, not literal hash marks.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:775
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a short guide with a # heading, a ## heading and a ### heading, one line under each.
  3. Click 'Send message'.
  4. Check that the three lines show as headings of different sizes and no # signs appear, as Expected says.

## S20.03 Bold, italic, and strikethrough.

- **Expected:** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72
- **Earlier check in the running app:** PARTIAL: E041 [PARTIAL; bold and italic only]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write three sentences: one with **bold** words, one with *italic* words, one with ~~strikethrough~~ words.
  3. Click 'Send message'.
  4. Check that bold, italic and struck-through text show with the right style and no asterisks or tildes remain.

## S20.04 Ordered lists.

- **Expected:** Numbered lists render with their numbers (respecting the start value) and list indentation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:473
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a numbered list of four steps to make tea, starting the numbering at 3.
  3. Click 'Send message'.
  4. Check that the list is numbered and the first item shows the number 3, with indented items, as Expected says.

## S20.05 Unordered lists.

- **Expected:** Bulleted lists render with bullet markers and indentation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:456
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a bulleted list of four fruits.
  3. Click 'Send message'.
  4. Check that each fruit has a bullet marker and is indented, as Expected says.

## S20.06 Nested lists.

- **Expected:** Indented sub-lists render nested under their parent item with deeper indentation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:349 (quoted code not found in the file now)
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a bulleted list of three countries. Under the second country add a nested bulleted list of two cities.
  3. Click 'Send message'.
  4. Check that the two cities sit one level deeper than their country, with more indent, as Expected says.

## S20.07 Task lists.

- **Expected:** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:419
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a to-do list in Markdown with one item done using - [x] and one item not done using - [ ].
  3. Click 'Send message'.
  4. Check that the first item shows a ticked box and the second an empty box, as Expected says.

## S20.08 Blockquotes.

- **Expected:** Lines starting with > render as an indented, visually distinct quotation block.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:796
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Quote one famous line from a book, written as a Markdown blockquote starting with >.
  3. Click 'Send message'.
  4. Check that the quote is indented with a vertical bar at its left and looks different from normal text, as Expected says.

## S20.09 Horizontal rules.

- **Expected:** A thematic break (---, ***) renders as a horizontal divider.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2029 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:943
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one paragraph, then a line with only three dashes, then one more paragraph.
  3. Click 'Send message'.
  4. Check that a horizontal divider line appears between the two paragraphs, as Expected says.

## S20.10 Inline code.

- **Expected:** `inline code` renders in a monospace style distinct from prose.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:71 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence that names the command `ls -la` in backticks.
  3. Click 'Send message'.
  4. Check that the command shows in a monospace font, different from the sentence, as Expected says.

## S20.11 Fenced code blocks.

- **Expected:** Fenced code blocks render as a monospace block preserving whitespace.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:78 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > hover the code block (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a Python function in a fenced code block that prints hello, with normal indentation.
  3. Click 'Send message'.
  4. Hover the code block and check the monospace text keeps its indentation and the 'Copy code' button is there, as Expected says.

## S20.12 Links.

- **Expected:** [text](url) renders as a link the reader can see and follow.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:345
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > click the link in the answer (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence with the link [example site](https://example.com) in it.
  3. Click 'Send message'.
  4. Click the link and check it opens in a new browser tab, with the link text underlined and an arrow icon after it, as Expected says.

## S20.13 Autolinks.

- **Expected:** A bare URL in the answer (https://…, www.…) becomes a clickable link.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > click the address in the answer (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence that ends with the bare address https://example.com, with no brackets.
  3. Click 'Send message'.
  4. Check the address shows as an underlined link, click it and see it open in a new tab, as Expected says.

## S20.14 Footnotes where supported.

- **Expected:** Footnote references ([^1]) render as superscript markers linked to a footnotes section.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:72; packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:22
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > click the footnote marker (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence and put the footnote marker [^1] after it, then end the answer with the note [^1]: a short source note.
  3. Click 'Send message'.
  4. Click the marker and check it jumps to the note at the bottom, and that the note links back, as Expected says.

## S20.15 Tables.

- **Expected:** GFM pipe tables render as a grid with a header row and aligned cells.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:549
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write a table with columns Name, Colour and Price, three rows of fruit, and right-align the Price column using ---:.
  3. Click 'Send message'.
  4. Check the table has a header row, grid cells, and the Price values sit on the right, as Expected says.

## S20.16 Wide-table scrolling.

- **Expected:** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:460 (quoted code not found in the file now)
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > scroll the table sideways (labels found in the code)
- **Needs:** a signed-in account; phone width optional
- **Steps:**
  1. Click the message box.
  2. Type: Write a table with 12 columns named C1 to C12 and two rows of short values.
  3. Click 'Send message'.
  4. Scroll the table sideways inside the answer (or swipe on a phone width) and check the page does not overflow and the last columns can be reached, as Expected says.

## S20.18 Download-table action.

- **Expected:** A rendered table offers a download (CSV/XLSX) of its contents.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:122; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:801
- **Where to find it:** Chat screen > hover over a table in an answer (on touch screens the buttons always show) > click the 'Download as CSV' button at the top right of the table (labels found in the code)
- **Needs:** a signed-in account and a table in an answer
- **Steps:**
  1. Get an answer with a table, as in S20.15.
  2. Hover over the table so its buttons appear.
  3. Click the 'Download as CSV' button (icon only).
  4. Open the downloaded table.csv and check its rows match the table, as Expected says.

## S20.19 Inline mathematical notation.

- **Expected:** Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:73; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence that includes the formula $E = mc^2$ in the middle of it.
  3. Click 'Send message'.
  4. Check the formula shows as typeset maths inside the sentence, not as raw dollar signs, as Expected says.

## S20.20 Block mathematical notation.

- **Expected:** Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:6; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence, then put $$ on its own line, the formula \int_0^1 x^2 dx = 1/3, $$ on its own line, then one more sentence.
  3. Click 'Send message'.
  4. Check the formula is on its own centred line, typeset, as Expected says.

## S20.21 Escaped delimiters.

- **Expected:** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/platform/utils/src/markdownSource.ts:216; packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:10
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence with \$5, \*stars\* and snake\_case in it.
  3. Click 'Send message'.
  4. Check the answer shows $5, *stars* and snake_case with no backslashes left, as Expected says.

## S20.22 Partially streamed Markdown.

- **Expected:** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx:106
- **Where to find it:** no screen of its own. Streaming rendering is shown only while the reply streams; it has no control of its own.
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box and type: Write a 300-word article with a heading, some bold words and a bulleted list.
  2. Click 'Send message'.
  3. Watch the answer while it types: headings and bold text should show as formatted, not as raw # or ** marks.
  4. When it finishes, compare with the same text in the final answer, as Expected says.

## S20.23 Incomplete code-fence handling.

- **Expected:** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; packages/ui/unified-chat/src/components/markdown/completeInlineTokens.ts:37
- **Where to find it:** no screen of its own. The fence closing is handled in packages/platform/utils/src/markdownSource.ts (closeUnterminatedCodeFence); a streaming-only effect.
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box and type: Write a 20-line Python script in a fenced code block.
  2. Click 'Send message'.
  3. Watch while the answer streams: the code should appear inside a code box as soon as the opening fence arrives, before the closing fence.
  4. When it finishes, check the code box stays whole, as Expected says.

## S20.24 Sanitized embedded markup.

- **Expected:** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2900; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:821
- **Where to find it:** no screen of its own. The model decides whether HTML appears; the sanitizer runs in packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx around line 821, and user messages show tags as plain text.
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box and type: Reply with exactly this text: <b>bold</b> and <script>alert('x')</script>
  2. Click 'Send message'.
  3. Check no alert box or popup appears and no script runs.
  4. Check the tags show as text or are removed, not as active page content, as Expected says.

## S20.25 Safe external-link handling.

- **Expected:** External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:378
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > click the link in the answer (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the message box.
  2. Type: Write one sentence with the link [example](https://example.com) in it.
  3. Click 'Send message'.
  4. Click the link and check a new browser tab opens, and the app tab stays where it was, as Expected says.

## S20.26 Text selection across rendered blocks.

- **Expected:** A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2029 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:943
- **Where to find it:** Chat screen > type in the box 'Ask anything. Type / for commands' > click 'Send message' > drag-select in the answer (labels found in the code)
- **Needs:** a signed-in account, a mouse or trackpad
- **Steps:**
  1. Click the message box and type: Write a heading, a paragraph, a bulleted list and a short Python code block.
  2. Click 'Send message'.
  3. Press the mouse at the start of the heading and drag down past the list and into the code block.
  4. Check the selection stays continuous across all the blocks, with no gaps, as Expected says. Then click 'Copy message' to see the copied text.

## S20.27 Find-in-answer highlighting.

- **Expected:** Searching finds text inside an answer and highlights the matching words in the rendered answer.
- **Code:** done. Evidence present: apps/web/features/chat/hooks/use-text-match-highlight.ts:90; apps/web/features/chat/components/messages/MessageSearch.tsx:32; apps/web/features/chat/services/global-search-service.ts:47; apps/web/features/chat/pages/WebChatPage.tsx:1143
- **Where to find it:** Open a conversation with an answer > press Command+F (Ctrl+F also works) > the "Search messages..." field at the top of the message list (labels found in the code)
- **Needs:** a conversation with an answer (any signed-in account that has one)
- **Steps:**
  1. Open a conversation whose answer has several paragraphs and repeated words.
  2. Press Command+F. The "Search messages..." field opens and is selected.
  3. Type a word that appears in the answer.
  4. Look at the rendered answer: the matching words should be highlighted in the text itself, not only in the search field.
  5. Press Enter for the next match and Shift+Enter for the previous one, or use "Go to next match" and "Go to previous match"; check that the view moves to each match.
  6. Press Escape or click "Close search" to end the search.

## S20.28 Print and export rendering.

- **Expected:** Printing or exporting an answer/conversation keeps the rendered formatting (headings, lists, tables, code, math).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/markdownDocument.ts:295 (quoted code not found in the file now); apps/web/features/chat/services/export-pdf.ts:379; apps/web/features/chat/services/export-pdf.ts:295; apps/web/features/chat/services/export-docx.ts:84
- **Where to find it:** Open a conversation > the Conversation options button at the top of the chat (icon button, no visible text) > Print, or Export… > Export Chat History dialog > Export PDF (labels found in the code)
- **Needs:** a conversation with a formatted answer (heading, list, table, code, math)
- **Steps:**
  1. Open a conversation with an answer that has a heading, a list, a table, a code block and a math formula.
  2. Click the Conversation options button at the top of the chat, then click Print.
  3. In the print preview, compare the headings, lists, table, code and math with the screen.
  4. Cancel the print. Click the Conversation options button, then click Export….
  5. Choose PDF in Export Chat History, click the Export PDF button, open the downloaded file and compare its headings, lists, table, code and math with the screen.

## S20.29 Right-to-left content.

- **Expected:** Right-to-left text (Arabic, Hebrew) renders right-aligned in the correct direction.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2839; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:943
- **Where to find it:** no screen of its own. No control exists; the message text sets dir="auto" (apps/web/features/chat/components/messages/MessageBubble.tsx:2839), so direction follows each message's text.
- **Needs:** a keyboard that types Arabic or Hebrew
- **Steps:**
  1. Type a message in Arabic or Hebrew in the message box and send it.
  2. Ask the assistant for a short answer written in Arabic or Hebrew.
  3. Look at the user and assistant bubbles: the text should start from the right edge and be right-aligned, with the direction following the text.

## S20.30 Fallback rendering for unsupported blocks.

- **Expected:** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:229; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:368
- **Where to find it:** no screen of its own. Unknown code languages fall back to plain text (apps/web/features/chat/components/messages/MessageBubble.tsx and packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:677), and unknown interactive cards show a fallback headline (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:229); no tester-facing trigger for those was confirmed.
- **Needs:** a diagram that fails to draw (hard to force from the app; the tester may not be able to produce one)
- **Steps:**
  1. Ask the assistant for a Mermaid flowchart diagram in an answer.
  2. If the diagram fails to draw, look inside the answer for the text "This diagram could not be drawn".
  3. Check that the diagram source is still shown below that text and that the rest of the message is still readable.
