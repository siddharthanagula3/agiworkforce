---
id: "PLAN-chrome-060"
type: "test-plan"
title: "Chrome · 60. Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "60"
---
# Chrome · 60. Agentic work product

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S60.02 Task title.

- **Expected:** Each work task shows a readable title in the task list, and the user can set or change it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More > Tasks (the task list shows each title; titles are read-only there). To change a title, use Recent chats > More actions > Rename (labels found in the code)
- **Needs:** a paid account with AGI Work (the Tasks menu row appears only when signed in)
- **Steps:**
  1. Sign in, click the More button (aria-label "More") in the side panel header.
  2. Click "Tasks" to open the Tasks sheet.
  3. Look at each task row: the bold line is the task title, or "Untitled task" when none is set.
  4. Click Recent chats (the history icon in the header), find the chat, open More actions and click Rename; type a name in "Chat name" and save.
  5. Reopen Tasks and compare the title with Expected.

## S60.13 Reviewable task plan.

- **Expected:** Before the agent acts, the user sees its plan and can approve, edit or reject it.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedChatHandler.ts:767; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1594; apps/extension/src/features/side-panel/agiWorkPlanReview.ts:108; apps/extension/src/features/side-panel/agiWorkPlanReview.ts:137; apps/extension/src/side_panel.ts:9614; apps/extension/src/side_panel.ts:9637
- **Where to find it:** Available models menu > turn on "AI Work" toggle, then send a goal in the composer; the plan appears before work starts (labels found in the code)
- **Needs:** a paid account with AGI Work
- **Steps:**
  1. Sign in with an account whose plan includes AGI Work, then open the model menu (aria-label "Available models").
  2. Turn on the AGI Work toggle (row label "AGI Work").
  3. Type a multi-step goal in the composer and send it.
  4. Look for the plan card headed "Plan" with the help text "Edit any step before the work starts. The agent follows the plan you start here."
  5. Edit a step or click "Add a step", then click "Start work" (or "Cancel") and compare with Expected.

## S60.14 Step list.

- **Expected:** The task view lists its steps with an accurate per-step status.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the activity line under the reply (e.g. "Working for …" with "N steps") > click it to expand the step list (labels found in the code)
- **Needs:** a Free or paid account; a task that uses tools
- **Steps:**
  1. Send a request that uses tools, such as a research task, in a chat with AGI Work on.
  2. While it runs or after it ends, click the activity line that starts with "Working for" or "Worked for".
  3. Read the step rows that appear under it, each with a summary and an elapsed time.
  4. Compare each step's status (running, failed, cancelled) with what the run actually did.

## S60.16 Running-step indicator.

- **Expected:** While a task runs, the view marks which step is currently executing.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the activity line "Working for …" > expand; the step that is executing shows a spinning icon on its row (labels found in the code)
- **Needs:** a Free or paid account; a task that uses tools
- **Steps:**
  1. Start a tool-using request and click the "Working for" activity line to expand it.
  2. Find the step row that is still in progress.
  3. Look for its spinning icon (no text label) and compare with Expected: only the executing step should spin.

## S60.18 Clarification request.

- **Expected:** The agent can pause a task to ask the user a clarifying question and continue with the answer.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/interactiveCards.ts:394
- **Where to find it:** Chat > a clarifying question card inside the reply, answered with the "Send answers" button or "I'll just type it" (labels found in the code)
- **Needs:** a Free or paid account; an ambiguous request the agent chooses to clarify
- **Steps:**
  1. Send a request that is ambiguous enough for the agent to ask a question, such as an unclear instruction.
  2. Wait for the question card to appear in the reply.
  3. Choose an answer option or type one, then click "Send answers".
  4. Check that the run continues with the answer, and compare with Expected.

## S60.19 Approval request.

- **Expected:** When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the activity line "Needs your approval · …" > expand > the approval card with "Approve" or "Decline" (labels found in the code)
- **Needs:** a Free or paid account; a request that triggers an approval
- **Steps:**
  1. Send a request that needs an action the agent asks permission for, such as a browser or file action.
  2. When the activity line shows "Needs your approval", click it to expand.
  3. Read the card text "Your approval is required before this tool can run." (or the version with a risk level).
  4. Click "Approve" or "Decline" (or "Allow for this chat"), then check that the run pauses before the decision and continues or stops after it.

## S60.20 Task steering.

- **Expected:** The user can redirect a running task with new guidance without starting over.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The only guidance box found is "Add guidance to steer the run (optional)", shown on an approval card (apps/extension/src/features/side-panel/bubbles.ts), not as a mid-run control; I searched apps/extension/src for steer, redirect and guidance and found no free-text redirect while a run is going.
- **Needs:** a running task

## S60.23 Cancel.

- **Expected:** The user can stop a running task and the run is cancelled on the server.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More > Tasks > "Stop" on a running task > "Stop" in the confirmation ("Keep running" to cancel) (labels found in the code)
- **Needs:** a paid account with a long-running task
- **Steps:**
  1. Start a long task and sign in with the same account.
  2. Click More (aria-label "More"), then "Tasks".
  3. On a running task row, click "Stop" and read the confirmation text.
  4. Click "Stop" to confirm, then check the row state and the status line "Task stopped." and compare with Expected.

## S60.29 Results summary.

- **Expected:** When a task ends the user sees a summary of the result.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the final reply after the activity line "Worked for …" (labels found in the code)
- **Needs:** a Free or paid account; a task that finishes
- **Steps:**
  1. Send a task and wait until it ends.
  2. Read the reply below the activity line "Worked for …".
  3. Compare the reply with what the task did and with Expected.

## S60.30 Generated deliverables.

- **Expected:** Files the task produced are listed and can be opened or downloaded.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the reply's file list > "Download" button on each file (labels found in the code)
- **Needs:** a Free or paid account; a task that generates a file
- **Steps:**
  1. Send a request that produces a file, such as a generated report.
  2. Look for the file row in the reply.
  3. Click the download control on the file row (aria-label "Download <file name>").
  4. Check that the file saves and that the status reads "Downloading …" then succeeds or fails, and compare with Expected.

## S60.31 Partial-outcome summary.

- **Expected:** When a task stops short, the user sees what was done and what remains.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Chat > the activity line "Finished with errors · …" or "Worked for … · N failed attempts", and Tasks > the row state "Partially completed" (labels found in the code)
- **Needs:** a task that ends partly done
- **Steps:**
  1. Run a task that is expected to fail partly, such as a browser task on a page that blocks it.
  2. Read the activity line at the end of the reply and expand it.
  3. Check the failed steps shown in the step list.
  4. Open More > Tasks and read the state of the task row, then compare with Expected (what was done and what remains).

## S60.32 Task history.

- **Expected:** The user can browse past tasks with their state and open any of them.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More > Tasks (lists tasks with state and time; "Open" on each row) (labels found in the code)
- **Needs:** at least one past task on the account
- **Steps:**
  1. Sign in and click More (aria-label "More"), then "Tasks".
  2. Read the list: each row shows the title, then the state and last-updated time.
  3. Click "Open" on a task with a conversation to open it in a new Chrome tab on the web.
  4. Compare the list and the opened task with Expected.

## S60.34 Cross-device task continuation.

- **Expected:** A task started on one device can be followed and acted on from another device.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More > Tasks (runs from every app are listed; "Open" and "Stop" work on them), plus "All tasks on the web" at the bottom of the sheet (labels found in the code)
- **Needs:** a second device or the web app with the same account
- **Steps:**
  1. Start a task on a second device or on the web with the same account.
  2. On this Chrome, click More (aria-label "More"), then "Tasks".
  3. Find the task started on the other device in the list and click "Open" or "All tasks on the web".
  4. Check that the task state updates and that Stop works from here, and compare with Expected.
