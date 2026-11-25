---
id: "PLAN-web-063"
type: "test-plan"
title: "Web · 63. Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "63"
---
# Web · 63. Routines, schedules, and triggers

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S63.01 Routine gallery.

- **Expected:** A browsable gallery of ready-made routines the user can start from at any time.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/SchedulesPage.tsx:845 (quoted code not found in the file now); apps/web/features/schedules/components/SchedulesPage.tsx:1157
- **Where to find it:** Sidebar > Scheduled > More ways to create a task (chevron beside New task) > Start from a template (labels found in the code)
- **Needs:** a Basic or higher paid plan (the create controls are hidden otherwise) and at least one existing routine, because the gallery panel only shows when the list is not empty
- **Steps:**
  1. Click Scheduled in the sidebar.
  2. Click the chevron beside New task (its label is More ways to create a task).
  3. Click Start from a template.
  4. Look for the Start from a template panel with a grid labelled Schedule templates, and check you can browse several templates.

## S63.02 Create routine from a prompt.

- **Expected:** The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.
- **Code:** done. Evidence present: apps/web/features/schedules/components/SchedulesPage.tsx:1016; apps/web/features/schedules/components/ScheduleForm.tsx:208; apps/web/features/schedules/components/SchedulesPage.tsx:511; apps/web/app/api/schedules/route.ts:128
- **Earlier check in the running app:** BLOCKED: E054 [BLOCKED; Basic plan required]: Schedules loaded no schedules yet; creation requires Basic or higher. No automation created.
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch, then fill Task Instructions and click Create Schedule (labels found in the code)
- **Needs:** a Basic or higher paid plan; a Free account sees Scheduled tasks are available on Basic and higher plans.
- **Steps:**
  1. Click Scheduled in the sidebar.
  2. Click New task, or choose Create from scratch from the chevron menu.
  3. In the Create Schedule dialog, type your instructions in Task Instructions and enter a Schedule Name.
  4. Click Create Schedule and check that the new routine appears in the list with its name and prompt.

## S63.03 Create routine from a completed task.

- **Expected:** From a finished task or chat turn, one action turns that work into a saved routine.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4053; apps/web/features/schedules/components/SchedulesPage.tsx:824
- **Where to find it:** Chat > an assistant reply's more-actions menu > Run this on a schedule (labels found in the code)
- **Needs:** a Basic or higher paid plan and a finished chat reply
- **Steps:**
  1. Open a chat and wait for an assistant reply to finish.
  2. Open the more-actions menu on that reply (its trigger label was not confirmed in code).
  3. Click Run this on a schedule.
  4. Check that the Create Schedule dialog opens pre-filled from that reply, then save it and look for the new routine under Scheduled.

## S63.04 Routine name and description.

- **Expected:** A routine has a user-set name and an optional description, both editable.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:173; apps/web/features/schedules/components/ScheduleForm.tsx:189; apps/web/features/schedules/components/SchedulesPage.tsx:511; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch (Schedule Name and Description fields); to edit later, Scheduled > Edit <routine name> (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Type a value in Schedule Name and an optional value in Description.
  3. Click Create Schedule.
  4. Click the edit (pencil) button on the routine, change Schedule Name or Description, click Save Changes, and check the card shows the new values.

## S63.05 Prompt editor.

- **Expected:** A multi-line editor to write and later edit the routine's instructions.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:210; apps/web/features/schedules/components/ScheduleForm.tsx:215; apps/web/features/schedules/components/SchedulesPage.tsx:510; apps/web/app/api/schedules/[id]/route.ts:75
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch (Task Instructions box); edit later with Scheduled > Edit <routine name> (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Type several lines in Task Instructions, including a line break.
  3. Click Create Schedule, then open the routine's edit (pencil) button.
  4. Check that the Task Instructions text is shown and editable, and that Save Changes stores the change.

## S63.06 Source selection.

- **Expected:** The user chooses which sources (project files, instructions, docs, web) a routine run may read.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleAccessFields.tsx:55; apps/web/features/schedules/components/ScheduleForm.tsx:731; apps/web/lib/services/scheduled-agent-executor.ts:1003
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Sources (labels found in the code)
- **Needs:** a Basic or higher paid plan; a project may be needed for project-file sources (the code passes a hasProject flag)
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Find the Sources group in the form.
  3. Tick and untick the source options offered.
  4. Click Create Schedule and open Edit on the routine to check the same sources are still ticked.

## S63.08 Connector selection.

- **Expected:** Per routine, the user chooses which connectors/tools the run may use.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleAccessFields.tsx:55; apps/web/lib/services/scheduled-agent-executor.ts:363
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Connectors (labels found in the code)
- **Needs:** a Basic or higher paid plan and at least one connected connector account to see options
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Find the Connectors group in the form; wait for Reading your connectors… to finish.
  3. Tick the connectors the run may use and untick others.
  4. Click Create Schedule and reopen Edit to check the selection is kept.

## S63.09 Agent selection.

- **Expected:** The user picks which agent (custom agent/persona) runs the routine.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:254; apps/web/lib/services/schedule-service.ts:1006
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Run as agent (labels found in the code)
- **Needs:** a Basic or higher paid plan and at least one custom agent; the field appears only when agents exist
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Open the Run as agent dropdown.
  3. Choose an agent and read the description that appears under it.
  4. Click Create Schedule, then check the routine card or Edit dialog shows the chosen agent.

## S63.11 One-time schedule.

- **Expected:** A routine can be set to run once at a chosen future date and time.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:306; apps/web/features/schedules/components/ScheduleForm.tsx:325; apps/web/lib/services/schedule-service.ts:798; apps/web/app/api/schedules/route.ts:128
- **Earlier check in the running app:** BLOCKED: E054 [BLOCKED; Basic plan required]: Schedules loaded no schedules yet; creation requires Basic or higher. No automation created.
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Frequency > One Time, then Run At (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Set Frequency to One Time.
  3. Set Run At to a future date and time.
  4. Click Create Schedule and check the card's Next Run shows that time.

## S63.12 Recurring schedule.

- **Expected:** A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:308; apps/web/lib/services/schedule-service.ts:807; apps/web/app/api/cron/run-schedules/route.ts:47
- **Earlier check in the running app:** BLOCKED: E054 [BLOCKED; Basic plan required]: Schedules loaded no schedules yet; creation requires Basic or higher. No automation created.
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Frequency > Daily (or Weekly, Monthly, Interval) (labels found in the code)
- **Needs:** a Basic or higher paid plan; a long wait is needed to see a scheduled fire
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Set Frequency to Daily, Weekly or Monthly, and set Repeat Every where shown.
  3. Click Create Schedule and read the Next Run value on the card.
  4. Wait for a due time, or use Run now, then check Last Run and the run history update.

## S63.13 Timezone control.

- **Expected:** The user sets the time zone a routine's times are interpreted in.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleForm.tsx:428 (quoted code not found in the file now); apps/web/lib/services/schedule-service.ts:716; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Time Zone (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Click Time Zone and type a city or region such as the zone you want.
  3. Pick a zone from the suggestions, set a time, and click Create Schedule.
  4. Open the routine card and compare the Time Zone and Next Run values with the zone you chose.

## S63.14 Advanced recurrence.

- **Expected:** Beyond simple daily/weekly, a routine accepts advanced recurrence (cron, intervals, iCalendar rules, run windows).
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:311; apps/web/features/schedules/components/ScheduleForm.tsx:312; apps/web/lib/services/schedule-service.ts:786; apps/web/app/api/schedules/route.ts:128
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Frequency > Custom Cron, Recurrence Rule or Interval; Only Run During is under When It May Run, And What Happens If It Fails (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Open Frequency and choose Custom Cron, then type a value in Cron Expression.
  3. Try Recurrence Rule, then Interval with Repeat Every.
  4. Open When It May Run, And What Happens If It Fails and set Only Run During; then check each saved routine's Next Run and Timing.

## S63.15 Event-trigger selection.

- **Expected:** A routine can be set to run when an external event happens (GitHub, Slack, Gmail, Calendar, webhook) and it runs when the event arrives.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleForm.tsx:313; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:397; apps/web/lib/triggers/trigger-fire.ts:135 (quoted code not found in the file now); apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Scheduled > routine card > History button (title Run History) > Triggers for <routine name> > Add trigger (labels found in the code)
- **Needs:** a Basic or higher paid plan, the matching connector account for the source, and an outside account for the event source
- **Steps:**
  1. Click Scheduled and open a routine with the History button (title Run History).
  2. Scroll to the Triggers for section and click Add trigger.
  3. Choose a source such as Gmail, GitHub, Slack or Google Calendar, then fill its fields and click Add trigger to save.
  4. Send or simulate an event from that source and check the routine appears in its run history.

## S63.16 Event filters.

- **Expected:** Event triggers can be narrowed (event types, account, field conditions, repeat suppression) so only matching events start the routine.
- **Code:** done. Evidence present: apps/web/features/schedules/components/TriggerConditionsEditor.tsx:27; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:540
- **Where to find it:** Sidebar > Scheduled > routine card > History button > Triggers for <routine name> > Add trigger > Only when and Event types (labels found in the code)
- **Needs:** a Basic or higher paid plan and an event source connected to send events
- **Steps:**
  1. Open a routine's History (title Run History) and click Add trigger.
  2. Set Event types and the Ignore repeats for (seconds) value.
  3. Under Only when, add a condition: pick a field, a comparison and a value.
  4. Save the trigger, then send an event that matches and one that does not, and check only the matching one starts a run.

## S63.17 Webhook trigger.

- **Expected:** A routine gets a webhook URL (with a secret); a signed POST to it starts a run.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:91; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:252 (quoted code not found in the file now); apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:66; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Scheduled > routine card > History button > Triggers for <routine name> > Add trigger > Anything else (signed webhook) (labels found in the code)
- **Needs:** a Basic or higher paid plan, a command-line tool or script that can sign a POST (the panel shows an openssl example)
- **Steps:**
  1. Open a routine's History (title Run History), click Add trigger.
  2. Choose Anything else (signed webhook) and click Add trigger to save.
  3. Copy the URL and signing secret shown after saving (the exact display text was not extracted).
  4. Send a signed POST to the URL and check a run starts; then click Regenerate secret and check the old secret is rejected.

## S63.19 Manual run.

- **Expected:** A "Run now" control starts the routine immediately and the run completes with a result.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:448; apps/web/features/schedules/components/SchedulesPage.tsx:639; apps/web/app/api/schedules/[id]/runs/route.ts:94; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now); packages/platform/context-engine/src/manifest-store.ts:57
- **Where to find it:** Sidebar > Scheduled > More actions for <routine name> > Run now (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled and open the More actions menu on a routine card.
  2. Click Run now.
  3. Wait for the run to finish, then open the History button (title Run History).
  4. Check the newest run in the list shows a status and open View Output to see the result.

## S63.20 Next-run display.

- **Expected:** Each routine shows when it will next run.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:209 (quoted code not found in the file now); apps/web/features/schedules/components/ScheduleCard.tsx:235 (quoted code not found in the file now); apps/web/app/api/schedules/route.ts:92
- **Where to find it:** Sidebar > Scheduled > each routine card (Next Run row) (labels found in the code)
- **Needs:** a Basic or higher paid plan and a routine that has a future run
- **Steps:**
  1. Click Scheduled and find a routine card.
  2. Read the Next Run row and the Timing row.
  3. Compare the next-run time with the routine's Time Zone row.
  4. Use Edit to change the timing, save, and check Next Run changes.

## S63.21 Last-run display.

- **Expected:** Each routine shows when it last ran and whether that run failed.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleCard.tsx:243 (quoted code not found in the file now); apps/web/features/schedules/components/ScheduleCard.tsx:367; apps/web/app/api/schedules/route.ts:92
- **Where to find it:** Sidebar > Scheduled > each routine card (Last Run row) (labels found in the code)
- **Needs:** a Basic or higher paid plan and a routine that has run at least once, ideally one that failed
- **Steps:**
  1. Click Scheduled and find a routine that has run.
  2. Read the Last Run row.
  3. Open History (title Run History) and check the latest run's status badge.
  4. Compare the failed status shown there with Last Run.

## S63.22 Run-history list.

- **Expected:** A list of a routine's past runs with status and time.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:357; apps/web/features/schedules/components/ScheduleRunHistory.tsx:89; apps/web/features/schedules/components/SchedulesPage.tsx:554; apps/web/app/api/schedules/[id]/runs/route.ts:58
- **Where to find it:** Sidebar > Scheduled > History button (title Run History) on a routine card (labels found in the code)
- **Needs:** a Basic or higher paid plan and a routine with past runs
- **Steps:**
  1. Click Scheduled and click the History button on a routine (its aria label is View History for <name>).
  2. Read the Run History heading and the list of runs.
  3. Check each row's status badge and time.
  4. Click Load more if it appears and check older runs load.

## S63.23 Per-run results.

- **Expected:** Opening a run shows what that run produced (its output text), not just its status.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleRunHistory.tsx:73; apps/web/features/schedules/components/SchedulesPage.tsx:1497; apps/web/app/api/schedules/[id]/runs/route.ts:58; apps/web/lib/services/scheduled-agent-executor.ts:593 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Scheduled > History button > a run row > View Output (labels found in the code)
- **Needs:** a Basic or higher paid plan and a run that produced output
- **Steps:**
  1. Open a routine's History (title Run History).
  2. Click a run row's View Output disclosure.
  3. Read the output text under it.
  4. Compare the text with the run's status and time shown on the row.

## S63.24 Enable/disable.

- **Expected:** A routine can be paused and resumed without deleting it.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:383; apps/web/features/schedules/components/SchedulesPage.tsx:532; apps/web/app/api/schedules/[id]/route.ts:110
- **Where to find it:** Sidebar > Scheduled > the switch on a routine card (pause or resume) (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click Scheduled and find a routine card.
  2. Click its switch to pause, which turns the card to Paused.
  3. Read the message that appears (Schedule paused.).
  4. Click the switch again to resume and check the card no longer shows Paused and the message is Schedule resumed.

## S63.26 Edit schedule.

- **Expected:** An existing routine's timing and settings can be edited and saved.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:404; apps/web/features/schedules/components/SchedulesPage.tsx:510; apps/web/app/api/schedules/[id]/route.ts:75
- **Where to find it:** Sidebar > Scheduled > Edit <routine name> (pencil button, title Edit Schedule) (labels found in the code)
- **Needs:** a Basic or higher paid plan and an existing routine
- **Steps:**
  1. Click Scheduled and click the Edit button on a routine card.
  2. In the Edit Schedule dialog, change Schedule Name, a timing field or Task Instructions.
  3. Click Save Changes.
  4. Check the dialog closes, the message Schedule updated. appears and the card shows the new values.

## S63.27 Delete routine.

- **Expected:** A routine can be deleted, after a confirmation, and stops running.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:500; apps/web/features/schedules/components/SchedulesPage.tsx:1402; apps/web/features/schedules/components/SchedulesPage.tsx:726; apps/web/app/api/schedules/[id]/route.ts:91
- **Where to find it:** Sidebar > Scheduled > More actions for <routine name> > Delete (labels found in the code)
- **Needs:** a Basic or higher paid plan and an existing routine
- **Steps:**
  1. Click Scheduled and open the More actions menu on a routine card.
  2. Click Delete.
  3. Read the Delete Schedule? confirmation and click the confirm button.
  4. Check the routine disappears from the list and no longer shows a next run.

## S63.29 Share routine template.

- **Expected:** A routine (or its template) can be shared so another person can create their own copy.
- **Code:** done. Evidence present: apps/web/app/api/schedules/[id]/share/route.ts:49; apps/web/lib/services/schedule-share-service.ts:56; apps/web/features/schedules/components/SchedulesPage.tsx:759; apps/web/features/schedules/components/SharedSchedulePreview.tsx:54; apps/web/features/schedules/components/SchedulesPage.tsx:809
- **Where to find it:** Sidebar > Scheduled > More actions for <routine name> > Share (labels found in the code)
- **Needs:** a Basic or higher paid plan and a second account or private window to view the shared link
- **Steps:**
  1. Click Scheduled and open the More actions menu on a routine card.
  2. Click Share.
  3. In the Share dialog, create the share link and copy it.
  4. Open the link in a private window or as a second account and check a preview of the routine is shown (its copy action was not found).

## S63.31 Budget controls.

- **Expected:** Per routine, the user caps what it may spend (cost, credits, or number of runs).
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleForm.tsx:763; apps/web/lib/services/schedule-service.ts:1585
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Execution Limits > Credit Cap (or Maximum Runs) (labels found in the code)
- **Needs:** a Basic or higher paid plan and enough credits to reach the cap
- **Steps:**
  1. Click Scheduled, then New task, then Create from scratch.
  2. Open the Execution Limits section and enter a value in Credit Cap or Maximum Runs.
  3. Click Create Schedule and open Edit on the routine to check the value is kept.
  4. Run the routine until the cap is reached and check it pauses once runs use the credits.

## S63.32 Required-approval behavior.

- **Expected:** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- **Code:** done. Evidence present: apps/web/lib/services/scheduled-agent-executor.ts:620; apps/web/lib/services/scheduled-agent-executor.ts:644; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:152
- **Where to find it:** Scheduled > (open a schedule's card) > Run History (the clock icon, title "Run History") > run row showing "Waiting for your approval" > Approve (labels found in the code)
- **Needs:** a schedule whose run needs a tool approval (for example one that uses a tool requiring approval)
- **Steps:**
  1. Sign in and click "Scheduled" in the sidebar.
  2. Find a schedule whose run needs a tool approval. Its card may show a paused note: "Paused: a run needed your approval. Approve or deny it in Run History".
  3. Click the Run History icon on that schedule's card (title "Run History").
  4. In the run list, find the run with the "Waiting for your approval" card and read the tool name listed under it.
  5. Click "Approve" (or "Deny") on that card.
  6. Check that the run continues and the status changes from waiting to a finished state, and that a message says "Approved." appeared.

## S63.33 Missed-run explanation.

- **Expected:** When a scheduled occurrence is missed or skipped, the run history says so and why.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleRunHistory.tsx:156; apps/web/lib/services/schedule-service.ts:2039
- **Where to find it:** Scheduled > (open a schedule's card) > Run History (the clock icon, title "Run History") > run row with the "skipped" status and a note above it (labels found in the code)
- **Needs:** a schedule that has a missed or skipped run (for example a schedule set to skip missed runs whose run was late)
- **Steps:**
  1. Sign in and click "Scheduled" in the sidebar.
  2. Find a schedule that has a run marked as missed or skipped. A schedule with missed runs set to skip shows these.
  3. Click the Run History icon on that schedule's card (title "Run History").
  4. Find the run row. Its status word is "skipped" when the run was skipped.
  5. Read the grey note under the run row. It says the run was skipped, the scheduled time, and how late it was.
  6. Compare the note and status with Expected: the history should say that a run was missed or skipped and why.
