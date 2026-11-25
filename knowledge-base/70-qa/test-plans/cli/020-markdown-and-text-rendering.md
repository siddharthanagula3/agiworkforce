---
id: "PLAN-cli-020"
type: "test-plan"
title: "CLI · 20. Markdown and text rendering"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "20"
---
# CLI · 20. Markdown and text rendering

22 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S20.01 Paragraphs.

- **Expected:** Assistant text separated by blank lines renders as distinct paragraphs with spacing.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:352
- **Where to find it:** Terminal: type agi and press Return. In the chat, send a request for two short paragraphs. The reply appears under the ✦ marker. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi in Terminal and press Return.
  2. Type "Write two short paragraphs about the sea" and press Return.
  3. Wait for the reply to finish.
  4. Check that the two paragraphs are separated by a blank line and look like separate blocks.

## S20.02 Headings.

- **Expected:** ATX headings (# to ######) render as styled headings, not literal hash marks.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:206
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a reply that uses headings. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a heading # Title, then ## Section, then one sentence" and press Return.
  3. Check the heading lines in the reply.

## S20.03 Bold, italic, and strikethrough.

- **Expected:** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:380
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a sentence with bold, italic and strikethrough text. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with one sentence that uses **bold**, *italic* and ~~strikethrough~~ text" and press Return.
  3. Check that the three words show bold, italic and crossed-out styles and that the asterisks and tildes are gone.

## S20.04 Ordered lists.

- **Expected:** Numbered lists render with their numbers (respecting the start value) and list indentation.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:156 (quoted code not found in the file now)
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a numbered list that starts at 3. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a numbered list of three items, starting at 3" and press Return.
  3. Check that the numbers shown are 3, 4 and 5 and that the items are indented.

## S20.05 Unordered lists.

- **Expected:** Bulleted lists render with bullet markers and indentation.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:160 (quoted code not found in the file now)
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a bulleted list. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a bulleted list of three fruits" and press Return.
  3. Check that each item starts with a bullet marker and is indented.

## S20.06 Nested lists.

- **Expected:** Indented sub-lists render nested under their parent item with deeper indentation.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:285; apps/cli/src/tui/markdown_renderer.rs:297
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a list with a nested sub-list. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a bulleted list where one item has two indented sub-items" and press Return.
  3. Check that the sub-items sit under their parent with more indent than the parent.

## S20.07 Task lists.

- **Expected:** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:325; apps/cli/src/tui/markdown_renderer.rs:687
- **Earlier check in the running app:** PASS: An isolated harness built the production terminal renderer and printed a checked item, an unchecked item, an indented subtask, and an unchanged fenced example as ANSI terminal output. The installed CLI was not replaced.
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a task list with checked and unchecked items. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a task list: one item checked as done, one not checked, and an indented subtask" and press Return.
  3. Check that the items show a checked box and an empty box, and that the subtask is indented.

## S20.08 Blockquotes.

- **Expected:** Lines starting with > render as an indented, visually distinct quotation block.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:336
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a quotation. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with one line quoted using a > marker" and press Return.
  3. Check that the quoted line is indented, has a vertical bar at its start, and looks different from normal text.

## S20.09 Horizontal rules.

- **Expected:** A thematic break (---, ***) renders as a horizontal divider.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:393
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a reply with a horizontal rule between two parts. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with one sentence, then a line with three dashes, then one more sentence" and press Return.
  3. Check that a line of horizontal dashes appears between the two sentences.

## S20.10 Inline code.

- **Expected:** `inline code` renders in a monospace style distinct from prose.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:251
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a sentence with inline code. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with one sentence that names the word `print` in inline code" and press Return.
  3. Check that the word appears in a different colour and without the backticks.

## S20.11 Fenced code blocks.

- **Expected:** Fenced code blocks render as a monospace block preserving whitespace.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:175
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a fenced code block. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a short Python function in a fenced code block" and press Return.
  3. Check for the box top and bottom lines around the code, a gutter bar on each code line, and that indentation inside the code is kept.

## S20.12 Links.

- **Expected:** [text](url) renders as a link the reader can see and follow.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:265
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a link written as Markdown. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with the sentence Read the docs [here](https://example.com)" and press Return.
  3. Check that the words here appear underlined in the accent colour, followed by the address in brackets in a muted colour.

## S20.13 Autolinks.

- **Expected:** A bare URL in the answer (https://…, www.…) becomes a clickable link.
- **Code:** unverified. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:138 (quoted code not found in the file now)
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a reply that contains a bare web address. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with the sentence Visit https://example.com today" and press Return.
  3. Check whether the address is styled as a link or stays plain text, and whether clicking it does anything.

## S20.15 Tables.

- **Expected:** GFM pipe tables render as a grid with a header row and aligned cells.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:444
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a pipe table. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a markdown table of three fruits with name and colour columns" and press Return.
  3. Check for a box grid, a line under the header row, and cells aligned in columns.

## S20.16 Wide-table scrolling.

- **Expected:** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:517
- **Where to find it:** no screen of its own. The code caps each column (MAX_COL 40, table budget 96 columns) and wraps long cells onto extra lines (render_table and wrap_cols in markdown_renderer.rs). No horizontal scrolling was found, which differs from Expected.
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a markdown table of six columns with long text in each cell" and press Return.
  3. Look at whether the table fits the chat width, wraps its cells onto more lines, or runs off the edge and needs sideways scrolling.

## S20.21 Escaped delimiters.

- **Expected:** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:147
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a reply that contains escaped characters. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with the text: price is \$5, file name is a\_b, and the word \*star\* is not italic" and press Return.
  3. Check that the characters show without backslashes and the word is not styled.

## S20.22 Partially streamed Markdown.

- **Expected:** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5511
- **Where to find it:** Terminal: type agi and press Return. In the chat, send a request for a long formatted reply and watch while it types out. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Write a short article with a heading, a bulleted list and bold words" and press Return.
  3. Watch the reply while it streams in, without waiting for it to finish.
  4. Check that headings, bullets and bold text already show as formatted text before the reply ends.

## S20.23 Incomplete code-fence handling.

- **Expected:** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5511
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a code block and watch while it streams in. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Write a short Rust function in a fenced code block" and press Return.
  3. Watch the reply while it streams, before the closing fence arrives.
  4. Check that the code appears inside the code block box and is not shown as prose.

## S20.24 Sanitized embedded markup.

- **Expected:** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:146
- **Where to find it:** no screen of its own. Raw HTML events are dropped by the renderer (the match falls through to an empty arm in markdown_renderer.rs), and text is cleaned by sanitize_terminal_text, so the raw tags may be missing from the chat rather than shown literally.
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with the text <b>bold</b> and <script>alert(1)</script> exactly as written" and press Return.
  3. Check that no tags are drawn as live markup, no alert runs, and the reply shows no injected script effect.

## S20.26 Text selection across rendered blocks.

- **Expected:** A reader can drag-select text continuously across paragraphs, lists and code in one answer.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Terminal: type agi and press Return. In the chat, get a reply with a paragraph, a list and a code block, then drag across all of them. (path not confirmed in the code; trust the screen)
- **Needs:** a device with a mouse or trackpad
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with one paragraph, a three-item bulleted list and a short fenced code block" and press Return.
  3. Drag the mouse or trackpad from the first paragraph down through the list and into the code block.
  4. Check that the whole range highlights continuously.

## S20.28 Print and export rendering.

- **Expected:** Printing or exporting an answer/conversation keeps the rendered formatting (headings, lists, tables, code, math).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5921; apps/cli/src/repl/registry.rs:440
- **Where to find it:** Terminal: type agi and press Return, then type /export in the chat. There is no print command in the CLI. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return, send one request, and wait for the reply.
  2. Type /export and press Return to see the export in the chat, or type /export markdown ~/Desktop/test-export.md to write a file.
  3. For the file, open it in a text editor.
  4. Check that headings, lists, tables and code blocks appear with their Markdown symbols and the text Exported the conversation to appears in the chat.

## S20.30 Fallback rendering for unsupported blocks.

- **Expected:** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:602
- **Where to find it:** Terminal: type agi and press Return. In the chat, ask for a fenced code block in a language the highlighter does not know. (labels found in the code)
- **Needs:** a signed-in account or API key that lets the assistant reply
- **Steps:**
  1. Type agi and press Return.
  2. Type "Reply with a three-line example in a fenced block labelled zzunknown" and press Return.
  3. Check that the block still appears with its lines as plain code inside the code box, with none missing.
