---
id: "PLAN-desktop-042"
type: "test-plan"
title: "Desktop · 42. Proactive assistance, briefings, and reflection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "42"
---
# Desktop · 42. Proactive assistance, briefings, and reflection

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S42.01 Daily briefing setup.

- **Expected:** The user sets up a recurring daily briefing that is generated and delivered to them.
- **Code:** done. Evidence present: packages/contracts/cloud-contracts/src/schedules.ts:850; apps/web/lib/services/scheduled-agent-executor.ts:926
- **Where to find it:** Scheduled > New task (choose Frequency: Daily) (labels found in the code)
- **Needs:** a Basic or higher paid plan (scheduled tasks are hidden on Free)
- **Steps:**
  1. Click "Scheduled" in the left sidebar.
  2. Click "New task" (or "Create Your First Schedule" if the list is empty).
  3. Type a prompt, set "Frequency" to "Daily", set "Local Time" and "Time Zone", then click "Create Schedule".
  4. Look for the new task card in the list showing "Every day at" and the time you set. Compare with Expected: a recurring daily task that is generated and delivered.

## S42.04 Delivery time and timezone.

- **Expected:** The user sets the delivery time and timezone of the briefing.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleForm.tsx:428 (quoted code not found in the file now); apps/web/features/schedules/components/ScheduleCard.tsx:245; apps/web/features/schedules/components/SchedulesPage.tsx:443
- **Where to find it:** Scheduled > New task > Local Time and Time Zone (labels found in the code)
- **Needs:** a Basic or higher paid plan
- **Steps:**
  1. Click "Scheduled" in the left sidebar.
  2. Click "New task", then set "Frequency" to "Daily".
  3. Change "Local Time" and open "Time Zone" and pick a different zone.
  4. Click "Create Schedule" and check the card shows "Every day at" with the time you chose. Compare with Expected.

## S42.15 Pause briefings.

- **Expected:** The user can pause and resume briefings.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:385; apps/web/features/schedules/components/SchedulesPage.tsx:532
- **Where to find it:** Scheduled > task card > Pause (or Resume) (labels found in the code)
- **Needs:** a task that already exists (create one first)
- **Steps:**
  1. Click "Scheduled" in the left sidebar.
  2. On a task card, click the "Pause" button, or flip its switch labelled "Pause" with the task name.
  3. Look for the card to show "Paused" and the button to change to "Resume".
  4. Click "Resume" and check the card returns to its active state. Compare with Expected.

## S42.16 Quiet hours.

- **Expected:** During quiet hours the product holds proactive notifications and nudges.
- **Code:** done. Evidence moved: apps/web/lib/services/push-notification-service.ts:190 (quoted code not found in the file now); apps/web/lib/services/quiet-hours-service.ts:77; apps/web/lib/jobs/job-handlers.ts:93 (quoted code not found in the file now)
- **Where to find it:** Settings > Time and focus > Quiet hours (labels found in the code)
- **Needs:** a notification channel turned on (for example mobile push) to see the effect
- **Steps:**
  1. Open "Settings" from the account menu, then click "Time and focus".
  2. Turn on the "Quiet hours" switch, pick days, set the start and end times.
  3. Click "Save changes".
  4. Check the saved times stay after reload. Whether proactive notifications are held during those hours needs a phone or push check and was not verified in the code.

## S42.17 Work-completion notifications.

- **Expected:** The user is notified when background work (a scheduled run or agent task) completes.
- **Code:** done. Evidence present: apps/web/features/settings/sections/NotificationsSection.tsx:53; apps/web/lib/services/schedule-notification-service.ts:139; apps/web/lib/services/agent-notification-service.ts:140
- **Where to find it:** Settings > Notifications > Scheduled task finished (labels found in the code)
- **Needs:** an email or mobile push channel reachable from the account; a scheduled task to run
- **Steps:**
  1. Open "Settings" from the account menu, then click "Notifications".
  2. Find the row "Scheduled task finished" ("When a scheduled task completes or fails.") and turn on its Email or mobile push channel.
  3. Run a scheduled task (for example "Run now" from its card) and wait for it to finish.
  4. Check that the chosen channel receives a notice saying the task finished. Compare with Expected.

## S42.19 Personal usage reflection.

- **Expected:** The user can see a reflection on how they use the product.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:209 (quoted code not found in the file now); apps/web/features/settings/sections/ReflectSection.tsx:65 (quoted code not found in the file now); apps/web/app/api/reflect/route.ts:32
- **Where to find it:** Settings > Reflect (labels found in the code)
- **Needs:** some conversation history; the page may ask for memory to be on
- **Steps:**
  1. Open "Settings" from the account menu, then click "Reflect".
  2. Look at the heading "Reflect" and the activity chart below it.
  3. Change the range in the "Reflect range" dropdown, for example "Past 30 days" to "Past 3 months".
  4. Check the recap updates for that range. Compare with Expected.

## S42.21 Annual recap.

- **Expected:** The user can see a recap of their past year.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/ReflectSection.tsx:15; apps/web/features/settings/sections/ReflectSection.tsx:65 (quoted code not found in the file now); apps/web/app/api/reflect/route.ts:32
- **Where to find it:** Settings > Reflect > range "Past year" (labels found in the code)
- **Needs:** conversation history spanning the past year, ideally
- **Steps:**
  1. Open "Settings" from the account menu, then click "Reflect".
  2. Open the "Reflect range" dropdown and choose "Past year".
  3. Look at the recap and activity chart, which should cover the last 365 days.
  4. Compare with Expected: a recap of the past year.

## S42.22 Break reminders.

- **Expected:** The product reminds the user to take a break after a chosen amount of use.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TimeFocusSection.tsx:187; apps/web/features/time-focus/TimeFocusReminder.tsx:197; apps/web/features/chat/pages/WebChatPage.tsx:7987
- **Where to find it:** Settings > Time and focus > Break reminder (labels found in the code)
- **Needs:** a few minutes of active use
- **Steps:**
  1. Open "Settings" from the account menu, then click "Time and focus".
  2. Open the "Break reminder" dropdown and choose an interval such as "30 minutes".
  3. Click "Save changes", then keep using the app until the interval has passed.
  4. Look for a break reminder to appear in the app. Compare with Expected. The exact reminder wording was not confirmed.

## S42.23 Time-and-focus settings.

- **Expected:** A Time & focus settings page holds break reminders and quiet hours.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:299; apps/web/features/settings/sections/TimeFocusSection.tsx:114
- **Where to find it:** Settings > Time and focus (labels found in the code)
- **Steps:**
  1. Open "Settings" from the account menu, then click "Time and focus".
  2. Look for the "Break reminder" dropdown and the "Quiet hours" section with its switch.
  3. Change a value, then click "Save changes".
  4. Close and reopen Settings and check the values stayed. Compare with Expected.

## S42.25 Proactive-feature history and saved editions.

- **Expected:** Past briefings and proactive outputs are kept as a browsable history.
- **Code:** done. Evidence present: apps/web/lib/services/schedule-service.ts:1418; apps/web/app/api/schedules/runs/route.ts:30; apps/web/features/schedules/components/RecentScheduleResults.tsx:55; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:519
- **Where to find it:** Scheduled > Recent results (labels found in the code)
- **Needs:** a task that has run at least once
- **Steps:**
  1. Click "Scheduled" in the left sidebar.
  2. Scroll below the task list to the "Recent results" heading.
  3. Open a result row to see the saved output of an earlier run.
  4. Compare with Expected: past briefings and outputs are kept and can be browsed. Run History is also reachable from a task card.
