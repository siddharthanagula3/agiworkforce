---
id: "PLAN-desktop-063"
type: "test-plan"
title: "Desktop · 63. Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "63"
---
# Desktop · 63. Routines, schedules, and triggers

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S63.01 Routine gallery.

- **Expected:** A browsable gallery of ready-made routines the user can start from at any time.
- **Code:** done. Evidence present: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:928; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1031
- **Where to find it:** Scheduled > More ways to create a task (arrow next to New task) > Start from a template (labels found in the code)
- **Needs:** a plan that can create schedules (otherwise the button reads Upgrade plan); at least one saved routine, because the gallery only shows when the list is not empty
- **Steps:**
  1. Sign in, click Scheduled in the sidebar.
  2. Click the arrow button next to New task (aria-label "More ways to create a task").
  3. Click Start from a template.
  4. Look for the template gallery section titled Start from a template with ready-made routines to pick.

## S63.02 Create routine from a prompt.

- **Expected:** The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.
- **Code:** done. Evidence present: apps/web/features/schedules/components/SchedulesPage.tsx:1016; apps/web/features/schedules/components/ScheduleForm.tsx:208; apps/web/features/schedules/components/SchedulesPage.tsx:511; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Scheduled > New task (labels found in the code)
- **Needs:** a plan that can create schedules
- **Steps:**
  1. Click Scheduled in the sidebar, then click New task.
  2. Type a name in Schedule Name and the instructions in Task Instructions.
  3. Pick a Frequency such as Daily, then click Create Schedule.
  4. Look for the new routine card in the list with the name and prompt you typed.

## S63.03 Create routine from a completed task.

- **Expected:** From a finished task or chat turn, one action turns that work into a saved routine.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4053; apps/web/features/schedules/components/SchedulesPage.tsx:824
- **Where to find it:** Chat > a finished reply's menu > Run this on a schedule (labels found in the code)
- **Needs:** a finished assistant reply in a chat
- **Steps:**
  1. Send a message in chat and wait until the reply finishes streaming.
  2. Open the menu on that reply.
  3. Click Run this on a schedule.
  4. Look for the schedule form opening, and check whether it carries that reply's content.

## S63.04 Routine name and description.

- **Expected:** A routine has a user-set name and an optional description, both editable.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:173; apps/web/features/schedules/components/ScheduleForm.tsx:189; apps/web/features/schedules/components/SchedulesPage.tsx:511; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Scheduled > New task > Schedule Name and Description (edit later with Scheduled > routine card > Edit Schedule) (labels found in the code)
- **Needs:** a plan that can create schedules
- **Steps:**
  1. Click Scheduled, then New task.
  2. Type a name in Schedule Name and text in Description.
  3. Click Create Schedule, then click the Edit Schedule icon on the routine card.
  4. Change the name or description, click Save Changes, and check the card shows the new values.

## S63.05 Prompt editor.

- **Expected:** A multi-line editor to write and later edit the routine's instructions.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:210; apps/web/features/schedules/components/ScheduleForm.tsx:215; apps/web/features/schedules/components/SchedulesPage.tsx:510; apps/web/app/api/schedules/[id]/route.ts:75
- **Where to find it:** Scheduled > New task > Task Instructions (later: routine card > Edit Schedule > Task Instructions) (labels found in the code)
- **Needs:** a plan that can create schedules
- **Steps:**
  1. Click Scheduled, then New task.
  2. Type several lines into Task Instructions, pressing Enter for new lines.
  3. Click Create Schedule, then Edit Schedule on the card.
  4. Look for the Task Instructions box showing all lines, edit one line, click Save Changes and check the change stays.

## S63.06 Source selection.

- **Expected:** The user chooses which sources (project files, instructions, docs, web) a routine run may read.
- **Code:** done. Evidence moved: apps/desktop/electron/config.ts:39 (quoted code not found in the file now); packages/contracts/types/src/product-routes.ts:20; apps/web/app/chat/schedules/page.tsx:15; apps/web/features/schedules/components/ScheduleForm.tsx:731; apps/web/lib/services/scheduled-agent-executor.ts:1003
- **Where to find it:** Scheduled > New task > Sources (labels found in the code)
- **Needs:** a plan that can create schedules; a project with files if you want to test project files
- **Steps:**
  1. Click Scheduled, then New task.
  2. Find the Sources group of checkboxes.
  3. Tick or untick Project instructions and files, Saved memories, The web or Recent chats.
  4. Click Create Schedule, reopen Edit Schedule, and check the same boxes are still set.

## S63.08 Connector selection.

- **Expected:** Per routine, the user chooses which connectors/tools the run may use.
- **Code:** done. Evidence moved: apps/desktop/electron/config.ts:39 (quoted code not found in the file now); packages/contracts/types/src/product-routes.ts:20; apps/web/app/chat/schedules/page.tsx:15; apps/web/features/schedules/components/ScheduleAccessFields.tsx:55; apps/web/lib/services/scheduled-agent-executor.ts:363
- **Where to find it:** Scheduled > New task > Connectors (labels found in the code)
- **Needs:** a plan that can create schedules; connectors set up in the account to see choices
- **Steps:**
  1. Click Scheduled, then New task.
  2. Find the Connectors group; wait for Reading your connectors to go away.
  3. Tick the connectors the routine may use.
  4. Click Create Schedule, reopen Edit Schedule and check the choice is kept.

## S63.09 Agent selection.

- **Expected:** The user picks which agent (custom agent/persona) runs the routine.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:254; apps/web/lib/services/schedule-service.ts:1006
- **Where to find it:** Scheduled > New task > Run as agent (labels found in the code)
- **Needs:** a plan that can create schedules; at least one custom agent created to see choices beyond No agent
- **Steps:**
  1. Click Scheduled, then New task.
  2. Open the Run as agent drop-down; the default is No agent.
  3. Pick an agent from the list.
  4. Click Create Schedule and check the card or Edit Schedule shows that agent.

## S63.11 One-time schedule.

- **Expected:** A routine can be set to run once at a chosen future date and time.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:306; apps/web/features/schedules/components/ScheduleForm.tsx:325; apps/web/lib/services/schedule-service.ts:798; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Scheduled > New task > Frequency > One Time > Run At (labels found in the code)
- **Steps:**
  1. Click Scheduled, then New task.
  2. Set Frequency to One Time.
  3. Pick a date and time in Run At that is in the future.
  4. Click Create Schedule and check the card shows that one time as its next run.

## S63.12 Recurring schedule.

- **Expected:** A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:308; apps/web/lib/services/schedule-service.ts:807; apps/web/app/api/cron/run-schedules/route.ts:47
- **Where to find it:** Scheduled > New task > Frequency > Daily, Weekly or Monthly (labels found in the code)
- **Steps:**
  1. Click Scheduled, then New task.
  2. Set Frequency to Daily, then set Local Time.
  3. Click Create Schedule.
  4. Look at the card's next-run information and check it repeats at the chosen time.

## S63.13 Timezone control.

- **Expected:** The user sets the time zone a routine's times are interpreted in.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleForm.tsx:428 (quoted code not found in the file now); apps/web/lib/services/schedule-service.ts:716; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Scheduled > New task > Time Zone (labels found in the code)
- **Steps:**
  1. Click Scheduled, then New task.
  2. Click the Time Zone field and type a city or region in Search by city or region…
  3. Pick a zone, then set a Local Time.
  4. Click Create Schedule, reopen Edit Schedule and check the Time Zone is kept.

## S63.14 Advanced recurrence.

- **Expected:** Beyond simple daily/weekly, a routine accepts advanced recurrence (cron, intervals, iCalendar rules, run windows).
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:311; apps/web/features/schedules/components/ScheduleForm.tsx:312; apps/web/lib/services/schedule-service.ts:786; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Scheduled > New task > Frequency > Interval, Custom Cron or Recurrence Rule (labels found in the code)
- **Steps:**
  1. Click Scheduled, then New task.
  2. Set Frequency to Interval and fill Repeat Every, or Custom Cron and fill Cron Expression, or Recurrence Rule and fill Recurrence Rule.
  3. Optionally set Only Run During to a window.
  4. Click Create Schedule and check the card shows the advanced recurrence.

## S63.15 Event-trigger selection.

- **Expected:** A routine can be set to run when an external event happens (GitHub, Slack, Gmail, Calendar, webhook) and it runs when the event arrives.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleForm.tsx:313; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:397; apps/web/lib/triggers/trigger-fire.ts:135 (quoted code not found in the file now); apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Scheduled > New task > Frequency > When An Event Happens (labels found in the code)
- **Needs:** a connected account for the chosen service (for example GitHub or Gmail) to test a real event
- **Steps:**
  1. Click Scheduled, then New task.
  2. Set Frequency to When An Event Happens.
  3. Look for the trigger choices: GitHub, Slack, Gmail, Google Calendar, Anything else (signed webhook).
  4. Pick one, save, then send or cause that event and check a run starts.

## S63.16 Event filters.

- **Expected:** Event triggers can be narrowed (event types, account, field conditions, repeat suppression) so only matching events start the routine.
- **Code:** done. Evidence moved: apps/desktop/electron/config.ts:39 (quoted code not found in the file now); packages/contracts/types/src/product-routes.ts:20; apps/web/features/schedules/components/TriggerConditionsEditor.tsx:27; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:540
- **Where to find it:** Scheduled > New task > Frequency > When An Event Happens > Only when (labels found in the code)
- **Needs:** a connected event source to send real events
- **Steps:**
  1. Set Frequency to When An Event Happens and pick a trigger.
  2. Find the Only when group.
  3. Pick a field from the drop-down, or Other field…, and enter a Value.
  4. Save, send a matching and a non-matching event, and check only the matching one starts a run.

## S63.17 Webhook trigger.

- **Expected:** A routine gets a webhook URL (with a secret); a signed POST to it starts a run.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:91; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:252 (quoted code not found in the file now); apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:66; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Scheduled > New task > Frequency > When An Event Happens > Anything else (signed webhook) (labels found in the code)
- **Needs:** a terminal to send the POST; the signing secret from the panel
- **Steps:**
  1. Set Frequency to When An Event Happens and pick Anything else (signed webhook).
  2. Save, then copy the endpoint and signing secret shown in the trigger panel.
  3. Send a signed POST to the endpoint, using the example command shown in the panel.
  4. Look in the routine's run history for a new run.

## S63.19 Manual run.

- **Expected:** A "Run now" control starts the routine immediately and the run completes with a result.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:448; apps/web/features/schedules/components/SchedulesPage.tsx:639; apps/web/app/api/schedules/[id]/runs/route.ts:94; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now); packages/platform/context-engine/src/manifest-store.ts:57
- **Where to find it:** Scheduled > routine card menu > Run now (labels found in the code)
- **Needs:** a saved routine; a routine that is finished or legacy shows Run now disabled
- **Steps:**
  1. Click Scheduled and open the menu on a saved routine.
  2. Click Run now.
  3. Look for a new run in Latest result or the run history with a status and output.

## S63.20 Next-run display.

- **Expected:** Each routine shows when it will next run.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:209 (quoted code not found in the file now); apps/web/features/schedules/components/ScheduleCard.tsx:235 (quoted code not found in the file now); apps/web/app/api/schedules/route.ts:92
- **Where to find it:** Scheduled > routine card (next-run line) (labels found in the code)
- **Needs:** a routine that is active
- **Steps:**
  1. Click Scheduled and look at each routine card.
  2. Find the next-run time (shown as a tooltip titled Next run on the card).
  3. Compare the time with the Time Zone and Local Time set in Edit Schedule.

## S63.21 Last-run display.

- **Expected:** Each routine shows when it last ran and whether that run failed.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:243 (quoted code not found in the file now); apps/web/features/schedules/components/ScheduleCard.tsx:367; apps/web/app/api/schedules/route.ts:92
- **Where to find it:** Scheduled > routine card (Last run line) (labels found in the code)
- **Needs:** a routine that has run at least once; a failing run to see the error
- **Steps:**
  1. Click Scheduled and open a routine that has run.
  2. Look for the Last run line on its card.
  3. If the last run failed, check the error text after Last run.

## S63.22 Run-history list.

- **Expected:** A list of a routine's past runs with status and time.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:357; apps/web/features/schedules/components/ScheduleRunHistory.tsx:89; apps/web/features/schedules/components/SchedulesPage.tsx:554; apps/web/app/api/schedules/[id]/runs/route.ts:58
- **Where to find it:** Scheduled > routine card > Latest result (run history) (labels found in the code)
- **Needs:** a routine with past runs
- **Steps:**
  1. Click Scheduled and open a routine that has run.
  2. Open the Latest result panel from the card.
  3. Look for the list of past runs with status and time.
  4. If there are no runs, check the text This schedule has not run yet.

## S63.23 Per-run results.

- **Expected:** Opening a run shows what that run produced (its output text), not just its status.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleRunHistory.tsx:73; apps/web/features/schedules/components/SchedulesPage.tsx:1497; apps/web/app/api/schedules/[id]/runs/route.ts:58; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Scheduled > routine card > Latest result > a run (labels found in the code)
- **Needs:** a routine with a finished run that produced output
- **Steps:**
  1. Open Latest result for a routine that has run.
  2. Click or open a past run in the list.
  3. Look for the run's output text, not only its status.

## S63.24 Enable/disable.

- **Expected:** A routine can be paused and resumed without deleting it.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:383; apps/web/features/schedules/components/SchedulesPage.tsx:532; apps/web/app/api/schedules/[id]/route.ts:110
- **Where to find it:** Scheduled > routine card > Pause (or Resume) (labels found in the code)
- **Needs:** a saved routine
- **Steps:**
  1. Click Scheduled and find a routine that is active.
  2. Click Pause on its card, or Pause in the card menu.
  3. Look for the Paused label on the card and that it does not run at its next time.
  4. Click Resume and check the label goes away.

## S63.26 Edit schedule.

- **Expected:** An existing routine's timing and settings can be edited and saved.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:404; apps/web/features/schedules/components/SchedulesPage.tsx:510; apps/web/app/api/schedules/[id]/route.ts:75
- **Where to find it:** Scheduled > routine card > Edit Schedule (labels found in the code)
- **Needs:** a saved routine
- **Steps:**
  1. Click Scheduled and click the Edit Schedule icon on a routine card.
  2. Change a field such as Frequency, Local Time or Task Instructions.
  3. Click Save Changes.
  4. Look at the card and reopen Edit Schedule to check the change saved.

## S63.27 Delete routine.

- **Expected:** A routine can be deleted, after a confirmation, and stops running.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:500; apps/web/features/schedules/components/SchedulesPage.tsx:1402; apps/web/features/schedules/components/SchedulesPage.tsx:726; apps/web/app/api/schedules/[id]/route.ts:91
- **Where to find it:** Scheduled > routine card menu > Delete (labels found in the code)
- **Needs:** a saved routine; the deletion is permanent
- **Steps:**
  1. Click Scheduled and open the menu on a routine.
  2. Click Delete.
  3. Read the confirmation Delete Schedule? and confirm.
  4. Look for the routine gone from the list and that it no longer runs.

## S63.29 Share routine template.

- **Expected:** A routine (or its template) can be shared so another person can create their own copy.
- **Code:** done. Evidence present: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:709; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1283
- **Where to find it:** Scheduled > routine card > Share (link dialog Share “<routine name>”) (labels found in the code)
- **Needs:** a second account to open the link
- **Steps:**
  1. Click Scheduled and open the share action for a routine.
  2. In the dialog, copy the Share link.
  3. Open the link in a second account in the same workspace or another browser, and check it offers to create a copy.
  4. Check the original routine is unchanged.

## S63.31 Budget controls.

- **Expected:** Per routine, the user caps what it may spend (cost, credits, or number of runs).
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:763; apps/web/lib/services/schedule-service.ts:1585
- **Where to find it:** Scheduled > New task > Maximum Runs and Credit Cap (labels found in the code)
- **Needs:** a plan that can create schedules
- **Steps:**
  1. Click Scheduled, then New task.
  2. Fill Maximum Runs with a number, and optionally Credit Cap.
  3. Click Create Schedule.
  4. Let the routine reach the limit, or check Edit Schedule shows the cap is kept.

## S63.32 Required-approval behavior.

- **Expected:** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- **Code:** done. Evidence present: apps/web/lib/services/scheduled-agent-executor.ts:620; apps/web/lib/services/scheduled-agent-executor.ts:644; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:152
- **Where to find it:** Scheduled > (routine card) > Run History (clock icon) > run row shows "Waiting for your approval" with the approve and deny buttons (labels found in the code)
- **Needs:** a routine whose unattended run needs a tool approval (the tool's approval has to be triggered by the run)
- **Steps:**
  1. Sign in and open "Scheduled" in the left sidebar.
  2. Open a routine that uses a tool which asks for approval, and run it unattended (or wait for its schedule to fire).
  3. When the run needs approval, the routine card shows a paused note: "Paused: a run needed your approval. Approve or deny it in Run History". Click the Run History (clock) icon on the card.
  4. In the run row, look for the "Waiting for your approval" box listing the tool calls with an approve and a deny button, and an "Expires" time.
  5. Click approve. Compare with Expected: the run should resume and finish, and the approval box should go away.

## S63.33 Missed-run explanation.

- **Expected:** When a scheduled occurrence is missed or skipped, the run history says so and why.
- **Code:** done. Evidence present: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:997; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1016
- **Where to find it:** Scheduled > (routine card) > Run History (clock icon) > run row shows "skipped" and a note such as "Skipped the run scheduled for ..." or "Ran late: scheduled for ..." (labels found in the code)
- **Needs:** a routine with a recurring schedule and a run that was actually missed (the tester cannot force this easily)
- **Steps:**
  1. Sign in and open "Scheduled" in the left sidebar.
  2. Make sure a routine has a recurring schedule and its run was missed (for example the computer was asleep or the app was closed when it was due). The "If A Run Is Missed" setting in the routine form decides whether it runs late or is skipped.
  3. Click the Run History (clock) icon on the routine card.
  4. Read the run row: a skipped run shows the word "skipped" in place of the status, plus a note explaining why. A late run shows the note "Ran late: scheduled for ...".
  5. Compare with Expected: the history should say that the occurrence was missed or skipped and why.
