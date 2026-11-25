---
id: "PLAN-mobile-042"
type: "test-plan"
title: "Mobile · 42. Proactive assistance, briefings, and reflection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "42"
---
# Mobile · 42. Proactive assistance, briefings, and reflection

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S42.01 Daily briefing setup.

- **Expected:** The user sets up a recurring daily briefing that is generated and delivered to them.
- **Code:** done. Evidence moved: apps/mobile/src/features/schedules/templates.ts:22 (quoted code not found in the file now); apps/web/lib/services/scheduled-agent-executor.ts:926
- **Where to find it:** Side menu > Settings > Notifications > Daily brief (turn the switch on) (labels found in the code)
- **Needs:** A signed-in AGI Cloud account, on a plan that allows scheduled tasks.
- **Steps:**
  1. Sign in to AGI Cloud, then open the side menu and tap Settings.
  2. Tap Notifications.
  3. Turn on the Daily brief switch. Wait for the row 'Daily brief time, 08:00' to appear.
  4. Open Schedules from the side menu and look for a schedule named Daily brief, which the app should have created. Compare with Expected: a recurring daily briefing is set up.

## S42.04 Delivery time and timezone.

- **Expected:** The user sets the delivery time and timezone of the briefing.
- **Code:** done. Evidence moved: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:264 (quoted code not found in the file now); apps/mobile/src/features/schedules/components/ScheduleForm.tsx:66; apps/mobile/src/features/schedules/service.ts:150 (quoted code not found in the file now)
- **Where to find it:** Side menu > Schedules > Create Schedule (form) > Preferred time and Time zone (labels found in the code)
- **Needs:** A signed-in AGI Cloud account, on a plan that allows scheduled tasks.
- **Steps:**
  1. Open the side menu and tap Schedules, then tap Create schedule.
  2. Set Recurrence to Daily and tap the Preferred time field to pick a time.
  3. Scroll to the Time zone field and tap it. Pick a different zone from the list.
  4. Tap Create Schedule and open the new schedule. Compare with Expected: the time and time zone you chose are shown.

## S42.15 Pause briefings.

- **Expected:** The user can pause and resume briefings.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/schedules/index.tsx:165; apps/mobile/src/features/schedules/service.ts:150 (quoted code not found in the file now)
- **Where to find it:** Side menu > Schedules > (a schedule card) > switch on the card, or More actions > Pause / Resume (labels found in the code)
- **Needs:** A schedule already set up (for example Daily brief) on a signed-in AGI Cloud account.
- **Steps:**
  1. Open the side menu and tap Schedules. Make sure at least one schedule exists, such as Daily brief.
  2. Tap the switch on a schedule card to turn it off, or tap its More actions button and choose Pause.
  3. Look at the card: it should show as paused, and the Paused filter should list it.
  4. Tap the switch again, or choose Resume from More actions. Compare with Expected: the schedule pauses and resumes.

## S42.16 Quiet hours.

- **Expected:** During quiet hours the product holds proactive notifications and nudges.
- **Code:** done. Evidence moved: apps/web/lib/services/push-notification-service.ts:190 (quoted code not found in the file now); apps/web/lib/services/quiet-hours-service.ts:77; apps/web/lib/jobs/job-handlers.ts:93 (quoted code not found in the file now)
- **Where to find it:** Side menu > Settings > Time and focus > Quiet hours > Enable quiet hours (labels found in the code)
- **Needs:** None for the setting. Holding push notifications needs a second device or push delivery, which the tester cannot see from the app.
- **Steps:**
  1. Open Settings, tap Time and focus.
  2. Turn on Enable quiet hours, then set the Days, Start time and End time so the current time falls inside the window.
  3. Return to the app or switch away and back during that window.
  4. Look for the alert 'Quiet hours are active' with the text 'This is a reminder, not a lock.' Compare with Expected: quiet hours are active on the device.

## S42.17 Work-completion notifications.

- **Expected:** The user is notified when background work (a scheduled run or agent task) completes.
- **Code:** done. Evidence present: apps/mobile/stores/notificationPrefsStore.ts:118; apps/mobile/services/notifications.ts:101; apps/web/lib/services/schedule-notification-service.ts:173
- **Where to find it:** Side menu > Settings > Notifications > Scheduled tasks (and Task and approval updates) (labels found in the code)
- **Needs:** A phone that allows notifications for the app, and a schedule to run (or an agent task).
- **Steps:**
  1. Open Settings, tap Notifications. Turn on notifications if it asks.
  2. Find the row Scheduled tasks, described as 'When a scheduled task runs, finishes or needs you', and set it on.
  3. On a schedule card, tap More actions and choose Run now, then wait for the run to finish.
  4. Look for a phone notification when the run completes. Compare with Expected: the user is notified when background work completes.

## S42.19 Personal usage reflection.

- **Expected:** The user can see a reflection on how they use the product.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/reflect.tsx:83; apps/mobile/src/features/reflect/service.ts:39; apps/web/app/api/reflect/route.ts:32
- **Where to find it:** Side menu > Settings > Reflect (shows the page titled Reflect, with range choices 30 days, 3 months, 6 months, 1 year) (labels found in the code)
- **Needs:** A signed-in AGI Cloud account. Reflect may ask for memory to be on (ReflectMemoryRequiredError).
- **Steps:**
  1. Open Settings and tap Reflect. Sign in if asked.
  2. Wait for 'Building your recap…' to finish.
  3. Read the headline, the period label and the stats (Conversations, Active days, Most active day, Peak start time).
  4. Compare with Expected: a reflection on how the user uses the product is shown.

## S42.21 Annual recap.

- **Expected:** The user can see a recap of their past year.
- **Code:** done. Evidence present: apps/mobile/src/features/reflect/service.ts:17; apps/mobile/app/(app)/settings/reflect.tsx:83; apps/mobile/src/features/reflect/service.ts:39; apps/web/app/api/reflect/route.ts:32
- **Where to find it:** Side menu > Settings > Reflect > 1 year (labels found in the code)
- **Needs:** A signed-in AGI Cloud account with enough chat history for the past year.
- **Steps:**
  1. Open Settings and tap Reflect.
  2. Tap the range choice 1 year (accessibility label 'Show the past 1 year').
  3. Wait for the recap to load and read its period label, headline and stats.
  4. Compare with Expected: a recap of the past year is shown.

## S42.22 Break reminders.

- **Expected:** The product reminds the user to take a break after a chosen amount of use.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:55; apps/mobile/app/(app)/(tabs)/_layout.tsx:7
- **Where to find it:** Side menu > Settings > Time and focus > Break reminders (labels found in the code)
- **Needs:** None. Use the app for the full chosen time, or pick 30 minutes to shorten the test.
- **Steps:**
  1. Open Settings, tap Time and focus, then tap the Break reminders row.
  2. Choose a time, such as 30 minutes, from the menu. The row then reads 'After 30 min'.
  3. Keep using the app until about that much time has passed in one day.
  4. Look for the alert 'Time for a break?' with 'You have spent about 30 minutes in AGI today.' Compare with Expected.

## S42.23 Time-and-focus settings.

- **Expected:** A Time & focus settings page holds break reminders and quiet hours.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:36; apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:66; apps/web/lib/services/push-notification-service.ts:190 (quoted code not found in the file now)
- **Where to find it:** Side menu > Settings > Time and focus (labels found in the code)
- **Needs:** None.
- **Steps:**
  1. Open the side menu, tap Settings, then tap Time and focus.
  2. Look for the section Break reminders with its row, and the section Quiet hours with Enable quiet hours.
  3. Change one value, go back, and open the page again.
  4. Compare with Expected: the page holds break reminders and quiet hours, and the change is kept.

## S42.25 Proactive-feature history and saved editions.

- **Expected:** Past briefings and proactive outputs are kept as a browsable history.
- **Code:** done. Evidence present: apps/mobile/src/features/schedules/components/ScheduleCard.tsx:381; apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:226
- **Where to find it:** Side menu > Schedules > Scheduled runs (header button); or on a schedule card, More actions > Show history (labels found in the code)
- **Needs:** A schedule that has already run at least once (use Run now on a schedule card).
- **Steps:**
  1. Open the side menu and tap Schedules.
  2. Tap the Scheduled runs button in the header.
  3. Scroll the list of past runs. Compare with Expected: past outputs are kept as a browsable history.
  4. Go back, tap More actions on a schedule card and choose Show history. Look for the heading Run History with the last runs.
