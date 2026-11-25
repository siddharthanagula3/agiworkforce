---
id: "PLAN-cli-036"
type: "test-plan"
title: "CLI · 36. Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "36"
---
# CLI · 36. Sources and grounding interface

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S36.04 Source URL or resource identifier.

- **Expected:** Each cited source exposes its URL or resource identifier and can be opened.
- **Code:** done. Evidence present: apps/cli/src/markdown.rs:373; apps/cli/src/claude_parity.rs:998; apps/cli/src/tui/tui_app.rs:5881
- **Where to find it:** agi (start the chat), then ask a question that needs web search, for example "search the web for today's news about <topic>"; the "Sources" list appears under the answer (labels found in the code)
- **Needs:** a signed-in account whose model route offers web search, and a network connection
- **Steps:**
  1. Run `agi` in a terminal and wait for the chat prompt.
  2. Type a question that needs current web information, for example "search the web for <a current topic>", and press Enter.
  3. Wait for the answer to finish. Look for a block that starts with the word "Sources" under the answer.
  4. Check that each numbered line like "[1] <title>  <URL>" shows a full URL, and that the URL can be copied and opened in a browser (the CLI does not emit clickable links, so copy the text and paste it into a browser).
  5. Compare with Expected: each cited source shows its URL and the URL opens.
