---
id: "PLAN-mobile-063"
type: "test-plan"
title: "Mobile · 63. Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "63"
---
# Mobile · 63. Routines, schedules, and triggers

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S63.01 Routine gallery.

- **Expected:** A browsable gallery of ready-made routines the user can start from at any time.
- **Code:** done. Evidence present: apps/mobile/app/(app)/schedules/index.tsx:396; apps/mobile/app/(app)/schedules/index.tsx:538
- **Where to find it:** Open menu > Schedules > scroll to the bottom > Try a template (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Tap the Open menu button (it has no visible text) and tap Schedules.
  2. Scroll to the bottom of the list. If there are no routines, the empty screen shows the gallery.
  3. Look under the heading Try a template for the ready-made cards (for example Weekly review).
  4. Tap a card and check that the Create form opens with that template filled in.

## S63.02 Create routine from a prompt.

- **Expected:** The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/schedules/index.tsx:209 (quoted code not found in the file now); apps/mobile/src/features/schedules/components/QuickSchedule.tsx:71 (quoted code not found in the file now); apps/mobile/app/(app)/schedules/create.tsx:83 (quoted code not found in the file now); apps/mobile/src/features/schedules/service.ts:185
- **Where to find it:** Open menu > Schedules > Schedule a task box at the bottom > Continue scheduling task (arrow) > Create Schedule (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules from the Open menu.
  2. Tap the Schedule a task box at the bottom and type a prompt, for example: Summarise today's news headlines.
  3. Tap the arrow button (Continue scheduling task), type a time such as Every day at 9am in When should it run?, then tap Create Schedule.
  4. Check that a new card with your prompt appears in the list.

## S63.05 Prompt editor.

- **Expected:** A multi-line editor to write and later edit the routine's instructions.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:243; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:250; apps/mobile/app/(app)/schedules/create.tsx:127; apps/mobile/src/features/schedules/service.ts:202
- **Where to find it:** Open menu > Schedules > + (Create schedule) > Prompt (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules and tap the + icon at the top right (accessibility label Create schedule).
  2. Tap the Prompt box and type several lines of instructions; press return to start a new line.
  3. Tap Create Schedule, then tap the new card to open it for editing.
  4. Check that the Prompt box still shows the full multi-line text, then change one line and tap Save Changes.

## S63.11 One-time schedule.

- **Expected:** A routine can be set to run once at a chosen future date and time.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:190; apps/mobile/src/features/schedules/policy.ts:4; apps/mobile/src/features/schedules/service.ts:185
- **Where to find it:** Open menu > Schedules > + (Create schedule) > Recurrence > Once > Date (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules, tap the + icon (Create schedule).
  2. Under Recurrence tap Once, then tap the Date field and pick a future date.
  3. Set Preferred time, enter a name and prompt, then tap Create Schedule.
  4. Check that the card shows Once on <month> <day> at <time> and that Next run shows a future time.

## S63.12 Recurring schedule.

- **Expected:** A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:285; apps/mobile/src/features/schedules/policy.ts:6; apps/mobile/src/features/schedules/service.ts:185
- **Where to find it:** Open menu > Schedules > + (Create schedule) > Recurrence > Daily, Weekly or Monthly (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules, tap the + icon (Create schedule).
  2. Under Recurrence tap Daily, Weekly or Monthly. For Weekly tap the day chips (Su to Sa); for Monthly pick a Day of Month.
  3. Set Preferred time, enter a name and prompt, then tap Create Schedule.
  4. Check the card text: Daily at <time>, Every <days> at <time>, or Monthly on the <n>th at <time>, and that Next run changes to match.

## S63.13 Timezone control.

- **Expected:** The user sets the time zone a routine's times are interpreted in.
- **Code:** done. Evidence moved: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:264 (quoted code not found in the file now); apps/mobile/src/features/schedules/components/ScheduleForm.tsx:80; apps/mobile/src/features/schedules/service.ts:185
- **Where to find it:** Open menu > Schedules > + (Create schedule) > scroll down to Time zone (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules, tap the + icon (Create schedule) and scroll down to the Time zone field.
  2. Tap the Time zone field (accessibility label starts with Time zone:), type a city in Search time zones, and pick a zone.
  3. Set a Preferred time, then tap Create Schedule.
  4. Tap the card to edit it and check that Time zone still shows the zone you picked.

## S63.19 Manual run.

- **Expected:** A "Run now" control starts the routine immediately and the run completes with a result.
- **Code:** done. Evidence moved: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:278 (quoted code not found in the file now); apps/mobile/src/features/schedules/components/ScheduleCard.tsx:190
- **Where to find it:** Open menu > Schedules > card's More actions (...) button > Run now (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on and a routine that is switched on
- **Steps:**
  1. Open Schedules and find a routine whose switch is on.
  2. Tap its More actions button (...), then tap Run now.
  3. Watch the card: it shows Starting... and the History section opens.
  4. Check that a new run row appears in Run History with a status and time, and that Last run updates once it finishes.

## S63.20 Next-run display.

- **Expected:** Each routine shows when it will next run.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:342; apps/mobile/src/features/schedules/service.ts:148
- **Where to find it:** Open menu > Schedules > card, line Next run (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules and look at the bottom left of a card.
  2. Read the Next run text (for example in 2h, tomorrow, Overdue or Not scheduled).
  3. Pause the routine with its switch, then check that the text changes to show it will not run.
  4. Resume it and check that the text shows a time again.

## S63.21 Last-run display.

- **Expected:** Each routine shows when it last ran and whether that run failed.
- **Code:** done. Evidence moved: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:238 (quoted code not found in the file now)
- **Where to find it:** Open menu > Schedules > card, line under the prompt (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on and a routine that has run at least once
- **Steps:**
  1. Open Schedules and read the line under each card's prompt.
  2. Check the text: Last run <time ago>, Last run failed <time ago> (in red), or Not run yet.
  3. Run a routine with Run now and check the line updates after the run.
  4. Compare with Expected: the line should show when it last ran and whether it failed.

## S63.22 Run-history list.

- **Expected:** A list of a routine's past runs with status and time.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:381; apps/mobile/src/features/schedules/store.ts:393; apps/mobile/src/features/schedules/service.ts:246
- **Where to find it:** Open menu > Schedules > card > History > Run History (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on and a routine that has runs
- **Steps:**
  1. Open Schedules and tap History at the bottom right of a card.
  2. Read the Run History list under the card: each row shows a status, a duration and a time.
  3. Tap the refresh icon (Refresh run history) to reload.
  4. Tap the clock icon at the top (Scheduled runs) to see runs from all routines, and compare with Expected.

## S63.23 Per-run results.

- **Expected:** Opening a run shows what that run produced (its output text), not just its status.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:219
- **Where to find it:** Open menu > Schedules > card > History > run row text (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on and a routine with a finished run that has output
- **Steps:**
  1. Open Schedules, tap History on a card that has runs.
  2. Look at a run row: the result text appears under its status line, up to six lines.
  3. Long-press the result text to select it, or tap the flag icon (Report this run) if you want to report it.
  4. Compare with Expected: the row should show what that run produced, not only its status.

## S63.24 Enable/disable.

- **Expected:** A routine can be paused and resumed without deleting it.
- **Code:** done. Evidence moved: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:189 (quoted code not found in the file now); apps/mobile/src/features/schedules/store.ts:358; apps/mobile/src/features/schedules/service.ts:152 (quoted code not found in the file now)
- **Where to find it:** Open menu > Schedules > card switch (top right) or More actions (...) > Pause / Resume (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules and turn off the switch at the top right of a card.
  2. Check that the card stays in the list and its Next run text changes.
  3. Tap its More actions button (...) and tap Resume.
  4. Check the switch is on again and the routine was not deleted.

## S63.26 Edit schedule.

- **Expected:** An existing routine's timing and settings can be edited and saved.
- **Code:** done. Evidence present: apps/mobile/app/(app)/schedules/index.tsx:149; apps/mobile/app/(app)/schedules/create.tsx:127; apps/mobile/src/features/schedules/service.ts:202
- **Where to find it:** Open menu > Schedules > tap the card (or More actions (...) > Edit) > Save Changes (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules and tap a card's body, or open its More actions button (...) and tap Edit.
  2. Change the Schedule Name, the Preferred time or the prompt.
  3. Tap Save Changes.
  4. Reopen the same card and check the new values are shown on the card and in the form.

## S63.27 Delete routine.

- **Expected:** A routine can be deleted, after a confirmation, and stops running.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/schedules/index.tsx:144 (quoted code not found in the file now); apps/mobile/src/features/schedules/store.ts:312; apps/mobile/src/features/schedules/service.ts:147 (quoted code not found in the file now)
- **Where to find it:** Open menu > Schedules > card's More actions (...) > Delete > Delete schedule? (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on
- **Steps:**
  1. Open Schedules and tap a card's More actions button (...), then tap Delete.
  2. Read the Delete schedule? dialog, then tap Cancel and check the card is still there.
  3. Repeat, and tap Delete in the dialog.
  4. Check the card disappears from the list and its Run History no longer appears.

## S63.32 Required-approval behavior.

- **Expected:** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- **Code:** done. Evidence present: apps/web/lib/services/scheduled-agent-executor.ts:620; apps/web/lib/services/scheduled-agent-executor.ts:644; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:152
- **Where to find it:** Open menu > Schedules > card text Paused for your approval > History > Needs approval > Approve or Deny (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on and a scheduled run that is waiting for approval
- **Steps:**
  1. Open Schedules and find a card that says Paused for your approval, so approve or deny it in History.
  2. Tap History on that card.
  3. Find the run row marked Needs approval and read the tool action it asks for.
  4. Tap Approve, then check the run continues; or tap Deny and check the run stops.

## S63.33 Missed-run explanation.

- **Expected:** When a scheduled occurrence is missed or skipped, the run history says so and why.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/service.ts:142; apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:215
- **Where to find it:** Open menu > Schedules > card > History > Run History row note (labels found in the code)
- **Needs:** a paid account (Basic or above) with AGI Cloud switched on and a routine whose run was missed or skipped by the server
- **Steps:**
  1. Open Schedules and tap History on a card.
  2. Look at a run row for a note under its status line: Ran late: scheduled for <time>, or Skipped the run scheduled for <time>.
  3. Read the reason in the note (missed by a set amount of time, and whether the schedule skips missed runs).
  4. Compare with Expected: the run history should say that a run was skipped or late and why.
