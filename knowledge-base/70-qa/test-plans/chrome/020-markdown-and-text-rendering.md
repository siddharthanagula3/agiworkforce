---
id: "PLAN-chrome-020"
type: "test-plan"
title: "Chrome · 20. Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "20"
---
# Chrome · 20. Markdown and text rendering

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S20.01 Paragraphs.

- **Expected:** Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:138 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome and sign in if asked.
  2. Click the box "How can I help you today?", type: Write two short paragraphs about the weather, with a blank line between them.
  3. Click "Send message" (the send button).
  4. When the answer finishes, look for two separate blocks of text with space between them, as in Expected.

## S20.02 Headings.

- **Expected:** ATX headings (# to ######) render as styled headings, not literal hash marks.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:141; apps/extension/src/side_panel.ts:2942
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Answer with a # heading, a ## heading and a ### heading, each over one line of text.
  3. Click "Send message".
  4. Check that the heading lines are shown as larger, bold headings and that no # symbols are visible.

## S20.03 Bold, italic, and strikethrough.

- **Expected:** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:141; apps/extension/src/features/side-panel/markdown.ts:81
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Reply with one line containing **bold**, *italic* and ~~strikethrough~~ words.
  3. Click "Send message".
  4. Check that bold text is heavier, italic text is slanted and the struck text has a line through it, with no asterisks or tildes showing.

## S20.04 Ordered lists.

- **Expected:** Numbered lists render with their numbers (respecting the start value) and list indentation.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/markdown.ts:141; apps/extension/src/features/side-panel/markdown.ts:55 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: List three steps for making tea as a numbered list, then ask for the list to start at 4 in a second message.
  3. Click "Send message" each time.
  4. Check that the numbers appear, that the second list starts at 4, and that the items are indented.

## S20.05 Unordered lists.

- **Expected:** Bulleted lists render with bullet markers and indentation.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:117 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Give me four bullet points about cycling.
  3. Click "Send message".
  4. Check for bullet markers, indented items, and no literal dash or star at the start of lines.

## S20.06 Nested lists.

- **Expected:** Indented sub-lists render nested under their parent item with deeper indentation.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:141
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Give a list of fruits where citrus has two indented sub-items: oranges and lemons.
  3. Click "Send message".
  4. Check that the sub-items sit under their parent item with a deeper indent.

## S20.07 Task lists.

- **Expected:** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/markdownItTaskLists.ts:3; apps/extension/src/features/side-panel/markdown.ts:249; apps/extension/__tests__/side-panel-markdown-parity.test.ts:58
- **Earlier check in the running app:** PASS: A 320-pixel browser preview of the Chrome production renderer showed the checked item and two open items with correct nesting. The accessibility tree exposed all three checked states.
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Make a packing checklist as task items: one ticked item and two unticked items.
  3. Click "Send message".
  4. Check that each item shows a checkbox, that ticked items show as checked, and that the list is indented correctly.

## S20.08 Blockquotes.

- **Expected:** Lines starting with > render as an indented, visually distinct quotation block.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:112 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Quote a short saying as a blockquote, with a line starting with > .
  3. Click "Send message".
  4. Check that the quote has a left bar, is indented and looks different from normal text.

## S20.09 Horizontal rules.

- **Expected:** A thematic break (---, ***) renders as a horizontal divider.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:141
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Write one sentence, then a line with three dashes (---), then one more sentence.
  3. Click "Send message".
  4. Check that a thin divider line appears between the two sentences and that no dashes are shown.

## S20.10 Inline code.

- **Expected:** `inline code` renders in a monospace style distinct from prose.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:141; apps/extension/src/features/side-panel/markdown.ts:253
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Use the word `npm install` in a sentence.
  3. Click "Send message".
  4. Check that the words in backticks use a monospace font and a different background from the prose.

## S20.11 Fenced code blocks.

- **Expected:** Fenced code blocks render as a monospace block preserving whitespace.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/markdown.ts:126 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:199
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Show a short Python function in a fenced code block, with indented lines.
  3. Click "Send message".
  4. Check that the code shows in a monospace block with its indentation kept, a language label, and a "Copy code" button at the top right of the block.

## S20.12 Links.

- **Expected:** [text](url) renders as a link the reader can see and follow.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:128 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Give one link to the Chrome Web Store written as [Chrome Web Store](https://chromewebstore.google.com).
  3. Click "Send message".
  4. Check that "Chrome Web Store" shows as link text, then click it and see that it opens in a new tab.

## S20.13 Autolinks.

- **Expected:** A bare URL in the answer (https://…, www.…) becomes a clickable link.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:143
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Give the address https://example.com as plain text in a sentence.
  3. Click "Send message".
  4. Check that the bare address shows as a link and that clicking it opens in a new tab.

## S20.15 Tables.

- **Expected:** GFM pipe tables render as a grid with a header row and aligned cells.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/markdown.ts:141; apps/extension/src/features/side-panel/markdown.ts:55 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Make a table of three cities with columns Name, Population and Country.
  3. Click "Send message".
  4. Check that the table has a header row, that columns line up, and that cells are separated by lines.

## S20.16 Wide-table scrolling.

- **Expected:** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2965
- **Earlier check in the running app:** PASS: At 320 pixels, the Chrome renderer preview kept numbers and text readable. A horizontal scroll revealed Wait time and Notes.
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a narrow side panel
- **Steps:**
  1. Narrow the side panel by dragging its edge, or use a narrow Chrome window.
  2. Click the box "How can I help you today?", type: Make a table with six columns and three rows of data, including a column called Notes with long text.
  3. Click "Send message".
  4. Scroll the table sideways and check that the cells are still readable and that the hidden columns can be reached.

## S20.19 Inline mathematical notation.

- **Expected:** Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:248; apps/extension/__tests__/side-panel-markdown-parity.test.ts:162
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Explain that $E = mc^2$ is an equation, using an inline formula in the sentence.
  3. Click "Send message".
  4. Check that the formula shows as typeset maths inside the sentence, not as raw dollar signs or LaTeX.

## S20.20 Block mathematical notation.

- **Expected:** Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:248; apps/extension/__tests__/side-panel-markdown-parity.test.ts:119
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Show the quadratic formula as a display equation on its own line, using double dollar signs.
  3. Click "Send message".
  4. Check that the formula appears as a centred block, typeset, on its own line.

## S20.21 Escaped delimiters.

- **Expected:** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:255; apps/extension/__tests__/side-panel-markdown-parity.test.ts:83
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Write the text 2 \* 3 \$ 5 with escaped stars and dollar signs, and a word with an escaped underscore such as snake\_case.
  3. Click "Send message".
  4. Check that the characters appear without the backslashes and that no italic or maths formatting is applied.

## S20.22 Partially streamed Markdown.

- **Expected:** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:4463 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:89 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Write a long answer with a heading, bold words and a bullet list.
  3. Click "Send message" and watch the answer while it is being written.
  4. Check that headings, bold text and list bullets appear as formatted text during the stream, not as raw # or ** symbols.

## S20.23 Incomplete code-fence handling.

- **Expected:** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:89 (quoted code not found in the file now)
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Show a Python code example in a fenced code block, and make the answer long enough to stream for several seconds.
  3. Click "Send message" and watch while the code is written.
  4. Click "Stop response" while the code is still open and check that it stays as a code block, not as normal text.

## S20.24 Sanitized embedded markup.

- **Expected:** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:109
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Reply with exactly this text: <script>alert('x')</script> and <img src=x onerror=alert('y')>
  3. Click "Send message".
  4. Check that no alert box appears, and that the tags show as plain text or are removed, with nothing running.

## S20.25 Safe external-link handling.

- **Expected:** External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/markdown.ts:41; apps/extension/src/features/side-panel/markdown.ts:150
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Give a link to https://example.com written as [Example](https://example.com), and a second link written as [Bad](javascript:alert(1)).
  3. Click "Send message".
  4. Click the Example link and check it opens in a new tab; click the Bad link and check nothing runs.

## S20.26 Text selection across rendered blocks.

- **Expected:** A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:687 (quoted code not found in the file now); apps/extension/src/features/side-panel/markdown.ts:253
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Write a heading, two paragraphs, a bullet list and a short code block.
  3. Click "Send message".
  4. Drag the mouse from the first paragraph down through the list and into the code block, then check that the whole range is highlighted and copies together.

## S20.30 Fallback rendering for unsupported blocks.

- **Expected:** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:69 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:138
- **Where to find it:** Side panel (signed in) > type in "How can I help you today?" > Send message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click the box "How can I help you today?".
  2. Type: Show a code block in a made-up language, for example a fenced block labelled foo, with two lines of text inside.
  3. Click "Send message".
  4. Check that the block still shows its text in a readable code block and the rest of the message is intact.
