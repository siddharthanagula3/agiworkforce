---
id: "PLAN-vscode-022"
type: "test-plan"
title: "VS Code · 22. Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "22"
---
# VS Code · 22. Rich answers and structured result widgets

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S22.28 Approval forms.

- **Expected:** Actions needing consent render an approval form (what will happen, approve/deny).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7034; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6765
- **Where to find it:** AGI chat panel > "Describe a task…" box: pick "Ask" in the mode menu, then send a task that changes a file. When the agent asks, an approval card appears in the chat with "Approve once", "Approve for session", "Deny" and "Abort turn" buttons. (labels found in the code)
- **Needs:** A workspace folder open in VS Code, and a signed-in account that can run the agent.
- **Steps:**
  1. Open the AGI chat panel in VS Code and open the mode menu.
  2. Choose "Ask" (the mode that asks before acting).
  3. In the "Describe a task…" box, type a request such as: create a file named notes.txt with one line of text, then press send.
  4. When the approval card appears, read the summary and detail text of what will happen, then compare with Expected: an approve/deny form is shown.
  5. Optionally click "Deny" or "Abort turn" to check the card closes with its outcome message.

## S22.30 Decision/comparison tables.

- **Expected:** Decision/comparison answers render as a readable comparison table.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now); apps/extension-vscode/src/webview/render.ts:16
- **Where to find it:** AGI chat panel > "Describe a task…" box: ask for a comparison, for example "compare two options as a table". A Markdown table in the answer renders as a scrollable table with a region label "Table". (labels found in the code)
- **Needs:** A signed-in account that can get an answer from the agent.
- **Steps:**
  1. Open the AGI chat panel in VS Code.
  2. In the "Describe a task…" box, type: compare three database options in a table with columns for cost, speed and setup, then press send.
  3. When the answer arrives, look for a grid with a header row and aligned cells.
  4. Make the table wider than the panel if you can, and check that it scrolls sideways inside its own box rather than moving the whole panel.
  5. Compare with Expected: the comparison appears as a readable table, not as raw pipe characters.
