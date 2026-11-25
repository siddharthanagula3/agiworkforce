---
id: "PLAN-cli-022"
type: "test-plan"
title: "CLI · 22. Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "22"
---
# CLI · 22. Rich answers and structured result widgets

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S22.28 Approval forms.

- **Expected:** Actions needing consent render an approval form (what will happen, approve/deny).
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:5; apps/cli/src/tui/tui_app.rs:1616
- **Where to find it:** agi (run in Terminal; the full-screen TUI opens by default unless --no-tui is passed) > type a request that makes the agent run a shell command or change a file > the "Tool Approval" box (labels found in the code)
- **Needs:** a signed-in account and a working model (the code does not say which account type is required); a folder where the agent may write
- **Steps:**
  1. Open Terminal and run: agi
  2. Type a request that needs a file change or a command, for example: create a file called test.txt in the current folder
  3. When the "Tool Approval" box appears, read the question and the file or command listed above the buttons
  4. Check the buttons shown: " Yes ", " No ", " Allow Session ", " Always allow ", " Deny All " and " Allow All "; hover the text of each by moving with the arrow keys to read its description
  5. Press n or Esc to refuse, or y to allow once, and check that the box closes and the agent continues or stops as chosen (compare with Expected: what will happen is shown, and approve or deny is offered)

## S22.29 Interactive questionnaires.

- **Expected:** The assistant can ask structured questions (options/fields) the user answers in an inline form.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/elicitation_overlay.rs:391; apps/cli/src/tui/tui_app.rs:1776
- **Where to find it:** agi (TUI) > a connected MCP server sends a request for input > the "MCP Request: <server name>" box with Accept, Decline and Cancel (labels found in the code)
- **Needs:** an MCP server that requests structured input (the code does not name one); a signed-in account
- **Steps:**
  1. Connect an MCP server whose tool asks for structured input (for example one that asks for a token and a scope); add it with the /mcp command
  2. Run agi and ask the agent to use that server's tool
  3. When the "MCP Request: <server name>" box appears, read the message at the top and the fields below it
  4. Fill the fields with the arrow keys and Tab, then press Enter on Accept to send the answer
  5. Compare with Expected: the questions appear as an inline form with fields and options, and the answer goes back to the agent. Press Esc to cancel and check the box closes

## S22.30 Decision/comparison tables.

- **Expected:** Decision/comparison answers render as a readable comparison table.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1530 (quoted code not found in the file now); apps/cli/src/tui/markdown_renderer.rs:444
- **Where to find it:** no screen of its own. The table is drawn by the markdown renderer (apps/cli/src/tui/markdown_renderer.rs, render_table) for any assistant answer, so it appears only if the model writes a table; the tui_app.rs:1530 line cited in Code no longer holds the quoted code, and the answer-drawing calls are at apps/cli/src/tui/tui_app.rs:2923 and 2970. No decision-specific path was found.
- **Needs:** a signed-in account and a working model (the table depends on the model writing a markdown table)
- **Steps:**
  1. Run agi and ask a question that compares options, for example: compare three database options in a table
  2. When the answer appears, look for a bordered table with a styled header row and a divider line under the header
  3. Check that the columns line up and that each option's values sit in the same column (compare with Expected: a readable comparison table)
