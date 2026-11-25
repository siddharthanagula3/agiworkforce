---
id: "PLAN-vscode-063"
type: "test-plan"
title: "VS Code · 63. Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "63"
---
# VS Code · 63. Routines, schedules, and triggers

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S63.19 Manual run.

- **Expected:** A "Run now" control starts the routine immediately and the run completes with a result.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2583; apps/extension-vscode/src/features/schedules/scheduleActions.ts:150; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** AGI Code sidebar > More > Work > Schedules row, click the play icon tooltipped "Run now" (also in the Command Palette as "Code: Run Schedule Now") (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with an active, enabled schedule
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work. In the Schedules part, hover an active schedule and click the play icon "Run now".
  3. In the modal, click "Run it now".
  4. Read the message that appears. Then click "Show recent runs" on the same schedule and check the newest run.
  5. Compare with Expected: the run starts straight away and the run history shows it completing with a result.

## S63.20 Next-run display.

- **Expected:** Each routine shows when it will next run.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/schedules/schedulePresentation.ts:70; apps/extension-vscode/src/features/schedules/schedulesTree.ts:33; apps/extension-vscode/src/core/commandSetup.ts:2563
- **Where to find it:** AGI Code sidebar > More > Work > Schedules (each row's description line) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one schedule
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work.
  3. Read the description line on each schedule row.
  4. Look for the next-run part: a future time reads "next in" followed by a duration, a past one reads "due" with "ago", and a paused or completed schedule reads "no next run".
  5. Compare with Expected: each routine shows when it will next run.

## S63.21 Last-run display.

- **Expected:** Each routine shows when it last ran and whether that run failed.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/schedules/schedulePresentation.ts:82; apps/extension-vscode/src/features/schedules/schedulesTree.ts:33; apps/extension-vscode/src/core/commandSetup.ts:2563
- **Where to find it:** AGI Code sidebar > More > Work > Schedules (each row's description line) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a schedule that has run at least once, and ideally one whose last run failed
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work.
  3. Read the description line on each schedule row for the last-run part.
  4. Look for "last ran" followed by a time, "never run", or "last run failed".
  5. Compare with Expected: each routine shows when it last ran and whether that run failed.

## S63.22 Run-history list.

- **Expected:** A list of a routine's past runs with status and time.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2588; apps/extension-vscode/src/features/schedules/scheduleActions.ts:211
- **Where to find it:** AGI Code sidebar > More > Work > Schedules row, click the history icon "Show recent runs" (also "Code: Show Schedule Runs" in the Command Palette) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a schedule that has past runs
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work.
  3. Hover a schedule row and click the history icon "Show recent runs".
  4. If the schedule has never run, read the message saying it has not run yet. Otherwise read the list titled "Runs of" followed by the schedule name.
  5. Compare with Expected: each past run shows its status and time, such as "Succeeded · <time>", newest first.

## S63.23 Per-run results.

- **Expected:** Opening a run shows what that run produced (its output text), not just its status.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/schedules/scheduleActions.ts:73; apps/extension-vscode/src/features/schedules/scheduleActions.ts:241; apps/extension-vscode/src/features/schedules/schedulePresentation.ts:132; apps/extension-vscode/src/features/schedules/scheduleRunOutput.ts:28
- **Where to find it:** AGI Code sidebar > More > Work > Schedules row, click "Show recent runs", then pick a run in the list (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a schedule that has a run with output
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work, then hover a schedule row and click "Show recent runs".
  3. Pick a run that has an answer. The list placeholder reads "Pick a run to read its answer".
  4. Read the text tab that opens. It has the schedule name as a heading, the run status line, and then the run's output text.
  5. Compare with Expected: the run's output text is shown, not only its status. A run with no output opens nothing.

## S63.24 Enable/disable.

- **Expected:** A routine can be paused and resumed without deleting it.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2573; apps/extension-vscode/src/core/commandSetup.ts:2578; apps/extension-vscode/src/features/schedules/scheduleActions.ts:121
- **Where to find it:** AGI Code sidebar > More > Work > Schedules row, click the icon "Pause this schedule" or "Resume this schedule" (also "Code: Pause Schedule" and "Code: Resume Schedule" in the Command Palette) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with an active schedule
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work. Hover an active schedule and click "Pause this schedule".
  3. Read the progress message "pausing" and then check that the row description says "Paused".
  4. Hover the same row and click "Resume this schedule".
  5. Compare with Expected: the schedule pauses and resumes, and it stays in the list the whole time (nothing is deleted).

## S63.32 Required-approval behavior.

- **Expected:** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- **Code:** done. Evidence present: apps/web/lib/services/scheduled-agent-executor.ts:620; apps/web/lib/services/scheduled-agent-executor.ts:644; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:152
- **Where to find it:** AGI Code sidebar > More > Work > Schedules row, click "Show recent runs", then pick the run labelled "Waiting for approval" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a schedule whose run has stopped to ask for a tool approval (produced by the server, not by a button in the app)
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar and use a schedule whose run is waiting for approval (set up on the web).
  2. Click More, then Work. Read the row description: it includes "a run is waiting for your approval".
  3. Hover the schedule and click "Show recent runs". Pick the run whose status is "Waiting for approval".
  4. In the modal that opens, read the request text and click "Approve".
  5. Compare with Expected: the run resumes after approval. Check in "Show recent runs" that the run's status moves on from "Waiting for approval".

## S63.33 Missed-run explanation.

- **Expected:** When a scheduled occurrence is missed or skipped, the run history says so and why.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/schedules/schedulePresentation.ts:119; apps/extension-vscode/src/features/schedules/schedulePresentation.ts:154
- **Where to find it:** AGI Code sidebar > More > Work > Schedules row, click "Show recent runs" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a schedule that has missed or skipped a run (not something the app can create on demand)
- **Steps:**
  1. Sign in to AGI Cloud from the AGI Code sidebar.
  2. Click More, then Work. Hover a schedule that has a missed or skipped run and click "Show recent runs".
  3. Find the run whose label starts with "Skipped" (or "Ran late" in its detail).
  4. Read the detail text after the first dot separators. A missed run reads like "Skipped the run scheduled for <time>: it was missed by <duration>, and this schedule skips missed runs." A late run reads "Ran late: scheduled for <time>, started <duration> later."
  5. Compare with Expected: the run history says that the occurrence was missed or skipped, and why.
