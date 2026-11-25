---
id: "PLAN-mobile-020"
type: "test-plan"
title: "Mobile · 20. Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "20"
---
# Mobile · 20. Markdown and text rendering

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S20.01 Paragraphs.

- **Expected:** Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:440 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that asks for several paragraphs, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Write three short paragraphs about the water cycle, with a blank line between each.
  3. Look at the reply: each paragraph should be a separate block with space between them, matching Expected.

## S20.02 Headings.

- **Expected:** ATX headings (# to ######) render as styled headings, not literal hash marks.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:254 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that asks for headings, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Answer with a # heading, a ## heading and a ### heading, each followed by one sentence.
  3. Look at the reply: the three headings should show as styled headings, with no # marks showing.

## S20.03 Bold, italic, and strikethrough.

- **Expected:** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:104 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that uses bold, italic and strikethrough, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Reply with one sentence in bold, one in italic, and one with strikethrough text.
  3. Look at the reply: bold, italic and struck-through text should show, with no asterisk or tilde marks.

## S20.04 Ordered lists.

- **Expected:** Numbered lists render with their numbers (respecting the start value) and list indentation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:182 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt for a numbered list, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Give a numbered list of four steps for making tea, starting the list at 5.
  3. Look at the reply: the list should show numbers that are indented, starting at 5 as the prompt asked.

## S20.05 Unordered lists.

- **Expected:** Bulleted lists render with bullet markers and indentation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:153 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt for a bulleted list, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Give a bulleted list of three fruits.
  3. Look at the reply: each item should show a bullet marker and be indented.

## S20.06 Nested lists.

- **Expected:** Indented sub-lists render nested under their parent item with deeper indentation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1215
- **Where to find it:** Chat: start a new chat, send a prompt for a nested list, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Give a bulleted list of two fruits, and under the first fruit add two indented sub-items.
  3. Look at the reply: the sub-items should sit under their parent, indented further than the parent.

## S20.07 Task lists.

- **Expected:** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:386 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:705
- **Where to find it:** Chat: start a new chat, send a prompt for a task list, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Make a task list with one unchecked item (- [ ]) and one checked item (- [x]).
  3. Look at the reply: each item should show a checkbox, and the checked one should show as ticked.

## S20.08 Blockquotes.

- **Expected:** Lines starting with > render as an indented, visually distinct quotation block.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:228 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that starts with a quote mark, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Reply with a two-line quotation written with > at the start of each line.
  3. Look at the reply: the quotation should show as an indented block that looks different from normal text.

## S20.09 Horizontal rules.

- **Expected:** A thematic break (---, ***) renders as a horizontal divider.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:422 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that asks for a divider line, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Write one sentence, then a line with three dashes (---), then one more sentence.
  3. Look at the reply: a horizontal divider line should sit between the two sentences, with no dashes showing.

## S20.10 Inline code.

- **Expected:** `inline code` renders in a monospace style distinct from prose.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:112 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that uses inline code, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Write a sentence that includes the word `print` in backticks.
  3. Look at the reply: the word should show in a monospace style with a background, and differ from the text around it.

## S20.11 Fenced code blocks.

- **Expected:** Fenced code blocks render as a monospace block preserving whitespace.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:500 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that asks for a code block, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Show a short Python function inside a fenced code block with three indented lines.
  3. Look at the reply: the code should show in a monospace block, keep its indentation and line breaks, and show a copy control.

## S20.12 Links.

- **Expected:** [text](url) renders as a link the reader can see and follow.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:133 (quoted code not found in the file now)
- **Where to find it:** Chat: an answer containing a link. Tap the link to open it; long-press the link for the menu with Open, Copy Link and Share Link (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Reply with one sentence that includes the link [example site](https://example.com).
  3. Look at the reply: the link text should show underlined and in the link colour.
  4. Tap the link and look at the page that opens; long-press the link to see the menu.

## S20.13 Autolinks.

- **Expected:** A bare URL in the answer (https://…, www.…) becomes a clickable link.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MarkdownInline.tsx:156 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MarkdownInline.tsx:261 (quoted code not found in the file now)
- **Where to find it:** Chat: an answer containing a bare web address. Tap the address (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Reply with one sentence that includes the bare address https://example.com with no brackets.
  3. Look at the reply: the address should show as a link, and tapping it should open the page.

## S20.15 Tables.

- **Expected:** GFM pipe tables render as a grid with a header row and aligned cells.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:306 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that asks for a table, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Make a table with columns Name, Age and City and three rows.
  3. Look at the reply: the table should show a header row and aligned cells in a grid.

## S20.16 Wide-table scrolling.

- **Expected:** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:575
- **Where to find it:** Chat: start a new chat, send a prompt that asks for a wide table, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account, phone width
- **Steps:**
  1. Start a new chat.
  2. Send: Make a table with 12 columns named Col 1 to Col 12 and two rows of values.
  3. Look at the reply on a phone-width screen: the table should scroll sideways rather than being cut off.

## S20.19 Inline mathematical notation.

- **Expected:** Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:38 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MathBlock.tsx:13 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt with an inline formula, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Write one sentence that includes the formula $E = mc^2$ inside the sentence.
  3. Look at the reply: the formula should show as typeset maths within the sentence, not as raw LaTeX.

## S20.20 Block mathematical notation.

- **Expected:** Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:489 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt with a display formula, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Show the formula $$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$$ on its own line.
  3. Look at the reply: the formula should show as a centred block of typeset maths.

## S20.21 Escaped delimiters.

- **Expected:** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:42 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:28 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:248 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt that uses escaped symbols, read the reply (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Write the text \*not italic\*, the price \$5 and the name my\_file.
  3. Look at the reply: the asterisks, dollar sign and underscore should show as plain characters with no backslashes.

## S20.22 Partially streamed Markdown.

- **Expected:** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:2113; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:473 (quoted code not found in the file now)
- **Where to find it:** Chat: start a new chat, send a prompt for a long answer, and watch the reply while it is still being written (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Write a long answer with a heading, a bulleted list and a bold word.
  3. Watch the reply while it types: the heading, list and bold text should show formatted before the reply finishes, not as raw # or * marks.

## S20.23 Incomplete code-fence handling.

- **Expected:** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); packages/platform/utils/src/markdownSource.ts:230
- **Where to find it:** Chat: start a new chat, send a prompt for a code block, and watch the reply while it is still being written (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Show a long Python script inside a fenced code block.
  3. Watch the reply while it types: the code should show in a code block as soon as the opening fence arrives, before the closing fence.

## S20.24 Sanitized embedded markup.

- **Expected:** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MathBlock.tsx:20 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Raw HTML blocks are dropped by dropHiddenHtmlBlocks in apps/mobile/src/features/chat/utils/markdownHiddenHtml.ts; the tester may see the HTML text removed rather than shown.
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Include this exact text in your reply: <script>alert(1)</script> and <b>bold</b>.
  3. Look at the reply: no alert should appear, and raw HTML blocks should not run or show as live content.

## S20.25 Safe external-link handling.

- **Expected:** External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:26 (quoted code not found in the file now)
- **Where to find it:** Chat: tap a link in an answer; long-press a link for Open, Copy Link and Share Link (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat.
  2. Send: Reply with one link [example site](https://example.com) and one email link [mail us](mailto:test@example.com).
  3. Tap the web link: it should open in the in-app browser, not in the chat.
  4. Tap the mail link: it should open the mail app; compare with Expected.

## S20.26 Text selection across rendered blocks.

- **Expected:** A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:1691
- **Where to find it:** Chat: long-press an answer, then tap Select Text. Drag-select across the text in the sheet (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a new chat and get an answer with a heading, a list and a code block.
  2. Long-press the answer bubble.
  3. Tap Select Text.
  4. Drag from the heading down through the list and the code block; compare what is highlighted with Expected.

## S20.28 Print and export rendering.

- **Expected:** Printing or exporting an answer/conversation keeps the rendered formatting (headings, lists, tables, code, math).
- **Code:** done. Evidence moved: apps/mobile/services/fileCreation.ts:65 (quoted code not found in the file now); apps/mobile/services/exportMarkdownHtml.ts:202; apps/mobile/services/exportMarkdownHtml.ts:161; apps/mobile/services/exportMarkdownHtml.ts:112 (quoted code not found in the file now); apps/mobile/services/exportMarkdownHtml.ts:338 (quoted code not found in the file now)
- **Where to find it:** Chat: long-press an answer, then tap Export Message, then Export as PDF. Or open the chat's actions menu, tap Export, then Export as PDF or Print (labels found in the code)
- **Needs:** a device with a share or print option
- **Steps:**
  1. Get an answer with a heading, a table, a code block and a formula.
  2. Long-press the answer, tap Export Message, then tap Export as PDF.
  3. Open the PDF or print preview and compare the headings, table, code and formula with the answer on screen.
  4. Optionally open the chat's Export sheet and tap Print to compare.

## S20.29 Right-to-left content.

- **Expected:** Right-to-left text (Arabic, Hebrew) renders right-aligned in the correct direction.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** no screen of its own. The direction rule is in apps/mobile/src/features/chat/components/MessageContentRenderer.tsx (directionStyle, applied to headings, list items and paragraphs), so the Code line that said unverified is now backed by code.
- **Needs:** a signed-in account, and a prompt that asks for Arabic or Hebrew text
- **Steps:**
  1. Start a new chat.
  2. Send: Reply in Arabic with a heading, a bulleted list of two items, and one paragraph.
  3. Look at the reply: the Arabic text should read right to left and line up to the right.

## S20.30 Fallback rendering for unsupported blocks.

- **Expected:** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1095; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:494 (quoted code not found in the file now)
- **Where to find it:** Chat > ask the assistant for a flowchart or diagram; a Mermaid block that fails to draw shows the message below it (labels found in the code)
- **Needs:** a Free account or a paid account; the failure depends on the model output, so a tester may need several tries
- **Steps:**
  1. Sign in and open a chat.
  2. Send a message asking for a diagram, such as a flowchart of a simple process (the model decides the output, so this may need a retry).
  3. If the diagram cannot be drawn, look for the text "This diagram could not be drawn." followed by "Its source is kept below." with the diagram source as readable text under it.
  4. Compare with Expected: the block should show a readable fallback, not disappear or break the message.
  5. Also check that an assistant reply with a fenced block in an unknown language (for example a language name the app does not know) shows the raw text in a plain box, instead of vanishing.
