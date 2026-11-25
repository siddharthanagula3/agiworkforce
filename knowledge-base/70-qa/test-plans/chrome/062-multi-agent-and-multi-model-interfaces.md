---
id: "PLAN-chrome-062"
type: "test-plan"
title: "Chrome · 62. Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "62"
---
# Chrome · 62. Multi-agent and multi-model interfaces

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S62.09 Concurrent task view.

- **Expected:** The user can watch several running tasks or agents at once in one view.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (⋮) > Tasks (labels found in the code)
- **Needs:** a signed-in account with two or more tasks running
- **Steps:**
  1. Sign in to AGI in the side panel, and start two or more tasks (the cloud tasks AGI runs for you).
  2. Click the ⋮ button at the top of the side panel.
  3. Click Tasks.
  4. Look for several running tasks listed together, each with its state label and time, and compare with Expected (several running tasks or agents in one view).

## S62.10 Needs-input prioritization.

- **Expected:** Tasks or agents that need the user's input are surfaced first.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No client-side ordering by need for input was found in apps/extension/src/features/side-panel/tasksSheet.ts: the Tasks sheet renders runs in the order the server returns them. The only 'needs your input' wording is in the chat activity line (spActivityNeedsInput in apps/extension/_locales/en/messages.json) and the Chrome notification (notifyTaskInputTitle, 'AGI needs your input'). Searched apps/extension for needs-input, awaiting_input, priorit and sort.
- **Needs:** a signed-in account with one task waiting for input

## S62.11 Inline unblock response.

- **Expected:** The user can unblock a waiting task or agent inline without leaving the overview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The Tasks sheet row controls are only Open and Stop (apps/extension/src/features/side-panel/tasksSheet.ts); no inline reply or approve control was found there. Approval appears inline only in the chat activity line (spActivityNeedsApproval), outside the overview. Searched apps/extension for unblock, approve and awaiting_input.
- **Needs:** a signed-in account with one task waiting for input

## S62.12 Full-transcript drill-down.

- **Expected:** From an overview the user can drill into the full transcript of a task.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (⋮) > Tasks > Open (labels found in the code)
- **Needs:** a signed-in account with at least one task
- **Steps:**
  1. Sign in to AGI in the side panel and have at least one task in your history.
  2. Click the ⋮ button at the top of the side panel, then click Tasks.
  3. On a task row, click Open (or open the row named 'Open task: <title>').
  4. Look at the opened page: it is the web chat for that task, showing its full transcript. Compare with Expected (full transcript drill-down from the overview). Note it opens in a browser tab on the web, not inside the side panel.
