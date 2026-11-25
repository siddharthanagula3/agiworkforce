---
id: "PLAN-chrome-063"
type: "test-plan"
title: "Chrome · 63. Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "63"
---
# Chrome · 63. Routines, schedules, and triggers

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S63.02 Create routine from a prompt.

- **Expected:** The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9205 (quoted code not found in the file now); apps/extension/src/side_panel.ts:9307 (quoted code not found in the file now); apps/extension/src/features/background/tasks.ts:216; apps/extension/src/features/background/tasks.ts:264
- **Where to find it:** Side panel: More > Shortcuts > Schedules > New schedule (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Open the side panel and click More, then Shortcuts (this opens the Options page on the Shortcuts section).
  2. Under Schedules, click New schedule.
  3. Type a Name and write the instructions in Instructions.
  4. Pick a Repeat option, fill in the Time, and click Create schedule.
  5. Compare: a message 'Created <name>. It runs in the cloud even when this browser is closed.' appears and the new routine is listed in Schedules.

## S63.04 Routine name and description.

- **Expected:** A routine has a user-set name and an optional description, both editable.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:546; apps/extension/src/features/side-panel/schedulesSection.ts:711; apps/extension/src/features/side-panel/schedulesSection.ts:1207; apps/extension/src/features/cloud-bridge/schedulesClient.ts:309; apps/extension/src/side_panel.ts:13529 (quoted code not found in the file now); apps/extension/src/side_panel.ts:13598 (quoted code not found in the file now)
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) Edit (labels found in the code)
- **Needs:** a signed-in AGI account and one saved routine
- **Steps:**
  1. Open More, then Shortcuts, and find the routine in Schedules.
  2. Click Edit on that routine row.
  3. Change the Name, and type or clear the Description (optional) field.
  4. Click Save changes.
  5. Compare: the message 'Saved <name>.' appears and the row shows the new name and description; Edit again shows the saved values.

## S63.05 Prompt editor.

- **Expected:** A multi-line editor to write and later edit the routine's instructions.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:13538 (quoted code not found in the file now); apps/extension/src/side_panel.ts:13653 (quoted code not found in the file now); apps/extension/src/features/side-panel/schedulesSection.ts:1221
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) Edit > Instructions (labels found in the code)
- **Needs:** a signed-in AGI account and one saved routine
- **Steps:**
  1. Open More, then Shortcuts, and click Edit on a routine.
  2. Click inside the Instructions box.
  3. Type several lines, pressing Return between them.
  4. Click Save changes, then click Edit again.
  5. Compare: the Instructions box is a multi-line box that keeps all the lines you typed.

## S63.12 Recurring schedule.

- **Expected:** A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9235 (quoted code not found in the file now); apps/extension/src/side_panel.ts:9307 (quoted code not found in the file now); apps/extension/src/features/background/tasks.ts:190
- **Where to find it:** Side panel: More > Shortcuts > Schedules > New schedule > Repeat (labels found in the code)
- **Needs:** a signed-in AGI account; waiting past a scheduled time to see a run
- **Steps:**
  1. Open More, then Shortcuts, then click New schedule.
  2. Fill in Name and Instructions.
  3. Open Repeat and choose Every day (or On chosen days of the week, or Once a month), then fill in Time.
  4. Click Create schedule.
  5. Compare: the routine row shows 'Next <time>' matching the cadence you chose. Whether a run starts at each occurrence is decided on the server and can only be seen later in Runs.

## S63.19 Manual run.

- **Expected:** A "Run now" control starts the routine immediately and the run completes with a result.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:916; apps/extension/src/features/side-panel/schedulesSection.ts:1270; apps/extension/src/features/cloud-bridge/schedulesClient.ts:291; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) Run now (labels found in the code)
- **Needs:** a signed-in AGI account and one saved routine
- **Steps:**
  1. Open More, then Shortcuts, and find a routine in Schedules.
  2. Click Run now on its row.
  3. Compare: the message 'Run started.' appears.
  4. Click Runs on the same row and wait for the new run to show a final status.
  5. Compare: the run is listed with status Finished or Failed and its output text.

## S63.20 Next-run display.

- **Expected:** Each routine shows when it will next run.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:882; apps/extension/src/side_panel.ts:8589 (quoted code not found in the file now); apps/extension/src/features/side-panel/schedulesSection.ts:1329
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) (labels found in the code)
- **Needs:** a signed-in AGI account and one saved routine
- **Steps:**
  1. Open More, then Shortcuts, and scroll to Schedules.
  2. Read the line 'Next <time>' on each routine row.
  3. Compare the time with the schedule you set in Repeat and Time.
  4. Create a routine with a future time and check that its row shows the new Next time.

## S63.21 Last-run display.

- **Expected:** Each routine shows when it last ran and whether that run failed.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/schedulesSection.ts:893
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) (labels found in the code)
- **Needs:** a signed-in AGI account; a routine that has run (a failed run shows the error line)
- **Steps:**
  1. Open More, then Shortcuts, and find a routine in Schedules.
  2. Read the line 'Last <time>' or 'Not run yet' on its row.
  3. If a run failed, read the 'Last run: <error>' line under it.
  4. Compare with the Runs list: the newest run's time and status should match the row.

## S63.23 Per-run results.

- **Expected:** Opening a run shows what that run produced (its output text), not just its status.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:1065; apps/extension/src/features/side-panel/schedulesSection.ts:722 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/schedulesClient.ts:362
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) Runs (labels found in the code)
- **Needs:** a signed-in AGI account and a routine that has run at least once
- **Steps:**
  1. Open More, then Shortcuts, and click Runs on a routine row that has run.
  2. Read the run list under the heading Runs.
  3. For each run, read its status (Finished, Failed and so on) and the output text under it.
  4. Compare: each run shows its output text, not only its status.

## S63.24 Enable/disable.

- **Expected:** A routine can be paused and resumed without deleting it.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:905; apps/extension/src/features/side-panel/schedulesSection.ts:1195; apps/extension/src/side_panel.ts:10574 (quoted code not found in the file now)
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) Pause (labels found in the code)
- **Needs:** a signed-in AGI account and one saved routine
- **Steps:**
  1. Open More, then Shortcuts, and find a routine in Schedules.
  2. Click Pause on its row.
  3. Compare: the message 'Schedule paused.' appears and the button changes to Resume; the routine stays in the list.
  4. Click Resume.
  5. Compare: the message 'Schedule resumed.' appears and the button changes back to Pause.

## S63.27 Delete routine.

- **Expected:** A routine can be deleted, after a confirmation, and stops running.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/schedulesSection.ts:1001; apps/extension/src/features/side-panel/schedulesSection.ts:1240; apps/extension/src/features/cloud-bridge/schedulesClient.ts:297; apps/extension/src/side_panel.ts:15649 (quoted code not found in the file now)
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row) Delete (labels found in the code)
- **Needs:** a signed-in AGI account and one saved routine you can afford to delete
- **Steps:**
  1. Open More, then Shortcuts, and click Delete on a routine row.
  2. Read the confirmation 'Delete <name> and its run history? This cannot be undone.'
  3. Click Cancel first and check the routine is still listed.
  4. Click Delete again, then Delete in the confirmation.
  5. Compare: the message 'Deleted <name>.' appears and the routine is gone from the list.

## S63.32 Required-approval behavior.

- **Expected:** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- **Code:** done. Evidence present: apps/web/lib/services/scheduled-agent-executor.ts:620; apps/web/lib/services/scheduled-agent-executor.ts:644; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:152
- **Where to find it:** Side panel: More > Shortcuts > Schedules > (routine row with a waiting run) (labels found in the code)
- **Needs:** a signed-in AGI account and a routine whose unattended run reaches a tool call that needs approval
- **Steps:**
  1. Open More, then Shortcuts, and find a routine whose run is waiting for approval.
  2. Read the block 'Paused until you approve or deny this step' with its expiry line and the action it asks for.
  3. Click Approve (or Deny).
  4. Compare: the message 'Approved. The run continued.' (or 'Denied. The run continued without that step.') appears, the waiting block goes away, and the run reaches a final status under Runs.
