---
id: "PLAN-vscode-020"
type: "test-plan"
title: "VS Code · 20. Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "20"
---
# VS Code · 20. Markdown and text rendering

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S20.01 Paragraphs.

- **Expected:** Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:114 (quoted code not found in the file now)
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar and sign in if asked.
  2. Click the "Describe a task…" box, type "Write two short paragraphs about rain, separated by a blank line", press Enter.
  3. Wait for the reply to finish and look at the reply: the two paragraphs should be separate, with space between them.

## S20.02 Headings.

- **Expected:** ATX headings (# to ######) render as styled headings, not literal hash marks.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Answer with a # title, a ## section and a ### subsection", press Enter.
  3. Wait for the reply to finish and look: the title and sections should show as larger headings, with no # symbols visible.

## S20.03 Bold, italic, and strikethrough.

- **Expected:** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Write one sentence with **bold**, *italic* and ~~strikethrough~~ words", press Enter.
  3. Wait for the reply, then look: bold, italic and struck-through words should show their styles, with no asterisks or tildes.

## S20.04 Ordered lists.

- **Expected:** Numbered lists render with their numbers (respecting the start value) and list indentation.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1441
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Give a numbered list of 3 steps, starting at number 3", press Enter.
  3. Wait for the reply, then look: the list should show numbers starting at 3 with indented items.

## S20.05 Unordered lists.

- **Expected:** Bulleted lists render with bullet markers and indentation.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "List three fruits as a bulleted list", press Enter.
  3. Wait for the reply, then look: the items should show bullet markers and indent.

## S20.06 Nested lists.

- **Expected:** Indented sub-lists render nested under their parent item with deeper indentation.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Give a bulleted list of two fruits, each with two indented sub-items", press Enter.
  3. Wait for the reply, then look: the sub-items should sit under their parent with a deeper indent.

## S20.07 Task lists.

- **Expected:** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/markdownItTaskLists.ts:3; apps/extension-vscode/src/webview/render.ts:24; apps/extension-vscode/src/__tests__/sanitizer.webview.test.ts:100
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Make a checklist: one unchecked item, one checked item, written as - [ ] and - [x]", press Enter.
  3. Wait for the reply, then look: the items should show checkboxes, one ticked and one empty.

## S20.08 Blockquotes.

- **Expected:** Lines starting with > render as an indented, visually distinct quotation block.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1442
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Quote a short line from a famous book, starting with >", press Enter.
  3. Wait for the reply, then look: the quote should show as an indented block set apart from the text.

## S20.09 Horizontal rules.

- **Expected:** A thematic break (---, ***) renders as a horizontal divider.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Write a paragraph, then a line with three dashes (---), then another paragraph", press Enter.
  3. Wait for the reply, then look: a thin divider line should appear between the paragraphs, and no dashes should show as text.

## S20.10 Inline code.

- **Expected:** `inline code` renders in a monospace style distinct from prose.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1420
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Name the function `print` in one sentence", press Enter.
  3. Wait for the reply, then look: the word in backticks should show in a monospace font different from the text around it.

## S20.11 Fenced code blocks.

- **Expected:** Fenced code blocks render as a monospace block preserving whitespace.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:59
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Show a short Python function in a code block with indentation", press Enter.
  3. Wait for the reply, then look: the code should sit in a monospace block with its spaces and indentation kept, and a Copy button should show at the top of the block.

## S20.12 Links.

- **Expected:** [text](url) renders as a link the reader can see and follow.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:229
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Give one link to the Markdown guide written as [Guide](https://example.com)", press Enter.
  3. Wait for the reply, then look: the text Guide should show as a link you can see and click.

## S20.13 Autolinks.

- **Expected:** A bare URL in the answer (https://…, www.…) becomes a clickable link.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:18
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Give the address of the Python website as a bare URL, no brackets", press Enter.
  3. Wait for the reply, then look: the bare web address should show as a clickable link.

## S20.15 Tables.

- **Expected:** GFM pipe tables render as a grid with a header row and aligned cells.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Make a table with columns Name, Price and Stock, and 3 rows", press Enter.
  3. Wait for the reply, then look: the table should show a bold header row and aligned cells in a grid.

## S20.16 Wide-table scrolling.

- **Expected:** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- **Code:** done. Evidence present: apps/extension-vscode/src/webview/render.ts:72; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1433
- **Earlier check in the running app:** PASS: Reopened a streamed six-column table in the actual VS Code sidebar. Column labels and numbers stayed intact. Keyboard scrolling revealed Wait time and Notes.
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Make a table with six columns and 3 rows", press Enter.
  3. Wait for the reply, then scroll sideways over the table with a trackpad or Shift plus the mouse wheel.
  4. Look: the wide table should scroll sideways inside the answer, with every column still readable.

## S20.19 Inline mathematical notation.

- **Expected:** Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/markdownItMath.ts:14; apps/extension-vscode/src/webview/render.ts:199
- **Earlier check in the running app:** PASS: A local CLI fixture streamed inline area notation into the real VS Code editor. The sidebar reopened the same conversation with typeset superscript and literal code.
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Write a sentence that includes the inline formula $x^2 + 1$", press Enter.
  3. Wait for the reply, then look: the formula should show as typeset math inside the sentence, not as raw $ signs.

## S20.20 Block mathematical notation.

- **Expected:** Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/markdownItMath.ts:40; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1427
- **Earlier check in the running app:** PASS: The real VS Code editor and sidebar both typeset a centered fraction and integral from a streamed local fixture.
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Show the integral of x squared as a display formula on its own line, using $$ delimiters", press Enter.
  3. Wait for the reply, then look: the formula should show centred on its own line as typeset math.

## S20.21 Escaped delimiters.

- **Expected:** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Write the text 2 \* 3 and the price \$5 and the name my\_file", press Enter.
  3. Wait for the reply, then look: the *, $ and _ should appear as plain characters, with no backslash in front of them.

## S20.22 Partially streamed Markdown.

- **Expected:** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7853
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Write a long answer with headings, a list and a code block", press Enter.
  3. Watch while the reply is still arriving: headings and lists should already be formatted, not show # or - symbols as raw text.
  4. Look again after the reply finishes: the final text should look the same, with no change in formatting.

## S20.23 Incomplete code-fence handling.

- **Expected:** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:59
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Show a Python code block", press Enter.
  3. While the reply is still streaming and the code block is not finished, look: the code should already show in a code block, not as normal text.
  4. Wait for the reply to finish and look: the block should stay a code block.

## S20.24 Sanitized embedded markup.

- **Expected:** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:219
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Reply with this exact text: <b>bold</b> and <script>alert('test')</script>", press Enter.
  3. Wait for the reply, then look: the tags should show as plain text, the word bold should not be bold, and no alert box should appear.

## S20.25 Safe external-link handling.

- **Expected:** External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:101
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Give two links: [Safe](https://example.com) and [Bad](javascript:alert(1))", press Enter.
  3. Wait for the reply, then look: the Safe link should be clickable and the Bad link should not be a working link.
  4. Click the Safe link and see where it opens: it should open outside the app, not run anything inside it.

## S20.26 Text selection across rendered blocks.

- **Expected:** A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:114 (quoted code not found in the file now)
- **Where to find it:** AGI Code (activity bar) > an answer with paragraphs, a list and a code block (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar and get a reply with a paragraph, a list and a code block.
  2. Press the mouse at the start of the first paragraph and drag down past the list and into the code block.
  3. Press Cmd+C, then paste into a text editor.
  4. Look: the pasted text should include all the selected parts, in order, with no gaps.

## S20.30 Fallback rendering for unsupported blocks.

- **Expected:** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:59
- **Where to find it:** AGI Code (activity bar) > "Describe a task…" box (labels found in the code)
- **Needs:** a signed-in account or a key set with Code: Set API Key
- **Steps:**
  1. Click the AGI Code icon in the activity bar.
  2. Click the "Describe a task…" box, type "Show a code block with the language name xyzlang containing the text hello", press Enter.
  3. Wait for the reply, then look: the block should show its text readably, even though the language is not known.
