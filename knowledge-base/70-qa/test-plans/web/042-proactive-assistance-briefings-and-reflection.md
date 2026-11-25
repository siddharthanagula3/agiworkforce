---
id: "PLAN-web-042"
type: "test-plan"
title: "Web · 42. Proactive assistance, briefings, and reflection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "42"
---
# Web · 42. Proactive assistance, briefings, and reflection

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S42.01 Daily briefing setup.

- **Expected:** The user sets up a recurring daily briefing that is generated and delivered to them.
- **Code:** done. Evidence present: packages/contracts/cloud-contracts/src/schedules.ts:850; apps/web/lib/services/scheduled-agent-executor.ts:926
- **Where to find it:** Sidebar > Scheduled > New task > (arrow button beside it) > Start from a template > Daily briefing (labels found in the code)
- **Needs:** A paid account (Scheduled tasks are available on Basic and higher plans). A Free account may see the page locked.
- **Steps:**
  1. Sign in and click Scheduled in the sidebar.
  2. Click the arrow button beside New task, then click Start from a template.
  3. Click the card named Daily briefing (it shows Weekdays at 8:00 AM).
  4. Submit the Create Schedule dialog (the submit button's exact text was not checked).
  5. Look for the new schedule card named Daily briefing with a Next: row of upcoming times, and compare with Expected (recurring, generated and delivered).

## S42.04 Delivery time and timezone.

- **Expected:** The user sets the delivery time and timezone of the briefing.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleForm.tsx:428 (quoted code not found in the file now); apps/web/features/schedules/components/ScheduleCard.tsx:245; apps/web/features/schedules/components/SchedulesPage.tsx:443
- **Where to find it:** Sidebar > Scheduled > New task > Create from scratch > Local Time and Time Zone fields (labels found in the code)
- **Needs:** A paid account (Basic or higher).
- **Steps:**
  1. Click Scheduled in the sidebar, then New task.
  2. Click Create from scratch (or start from a template).
  3. Set Recurrence, then change Local Time.
  4. Change Time Zone (the field offers a list of zones).
  5. Save, then look at the card's Next: row, whose tooltip reads Times are shown in <zone>, and compare with Expected.

## S42.15 Pause briefings.

- **Expected:** The user can pause and resume briefings.
- **Code:** done. Evidence present: apps/web/features/schedules/components/ScheduleCard.tsx:385; apps/web/features/schedules/components/SchedulesPage.tsx:532
- **Where to find it:** Sidebar > Scheduled > the briefing's card > its on/off switch (labelled Pause or Resume by name) (labels found in the code)
- **Needs:** A paid account with at least one schedule.
- **Steps:**
  1. Click Scheduled in the sidebar.
  2. Find the Daily briefing card.
  3. Click its switch to pause it; look for the Paused text on the card and the message Schedule paused.
  4. Click the switch again; look for Schedule resumed and the card's Paused text going away, and compare with Expected.

## S42.16 Quiet hours.

- **Expected:** During quiet hours the product holds proactive notifications and nudges.
- **Code:** done. Evidence moved: apps/web/lib/services/push-notification-service.ts:190 (quoted code not found in the file now); apps/web/lib/services/quiet-hours-service.ts:77; apps/web/lib/jobs/job-handlers.ts:93 (quoted code not found in the file now)
- **Where to find it:** Account menu > Settings > Time and focus > Quiet hours (labels found in the code)
- **Needs:** A way to see push notifications (a phone with AGI installed) for the hold to be checked. Web alone only shows the Quiet hours are active banner.
- **Steps:**
  1. Open the account menu at the bottom of the sidebar and click Settings.
  2. Click Time and focus.
  3. Turn on Quiet hours and set a start and an end time that differ.
  4. Keep the page open during those hours (or set a window that includes now) and look for the banner Quiet hours are active.
  5. Holding of push notifications happens on the server; check on a phone with push that a non-exempt notification is held, and compare with Expected.

## S42.17 Work-completion notifications.

- **Expected:** The user is notified when background work (a scheduled run or agent task) completes.
- **Code:** done. Evidence present: apps/web/features/settings/sections/NotificationsSection.tsx:53; apps/web/lib/services/schedule-notification-service.ts:139; apps/web/lib/services/agent-notification-service.ts:140
- **Earlier check in the running app:** UI_ONLY: E026 [UI_ONLY; scoped settings observation]: Notification channels visible; delivery not tested.
- **Where to find it:** Account menu > Settings > Notifications > Scheduled task finished (labels found in the code)
- **Needs:** An email inbox and/or a phone with AGI push, plus a scheduled task that can run.
- **Steps:**
  1. Open the account menu and click Settings, then Notifications.
  2. Find the row Scheduled task finished with its channel switches (Email, Mobile push).
  3. Turn the channels on or off and note the change.
  4. Run a scheduled task and wait for it to finish, then check the email or phone push for the finished or failed message.
  5. Compare what arrives with Expected.

## S42.19 Personal usage reflection.

- **Expected:** The user can see a reflection on how they use the product.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:209 (quoted code not found in the file now); apps/web/features/settings/sections/ReflectSection.tsx:65 (quoted code not found in the file now); apps/web/app/api/reflect/route.ts:32
- **Earlier check in the running app:** BLOCKED: E028 [BLOCKED; scoped settings observation]: Reflect requires Memory and Generate from past chats, currently off.
- **Where to find it:** Account menu > Settings > Reflect (labels found in the code)
- **Needs:** Memory and Save memories from chats turned on, and a paid or signed-in account with past chats. Without them the page is blocked.
- **Steps:**
  1. Open the account menu, click Settings, then Reflect.
  2. Read the page. If it says Turn on Memory and Save memories from chats to create a recap, turn those two settings on under Personalization and reload.
  3. Choose a range in the Reflect range dropdown (Past 30 days by default).
  4. Look for the usage reflection (topics and times) and compare with Expected.

## S42.21 Annual recap.

- **Expected:** The user can see a recap of their past year.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/ReflectSection.tsx:15; apps/web/features/settings/sections/ReflectSection.tsx:65 (quoted code not found in the file now); apps/web/app/api/reflect/route.ts:32
- **Earlier check in the running app:** BLOCKED: E028 [BLOCKED; scoped settings observation]: Reflect requires Memory and Generate from past chats, currently off.
- **Where to find it:** Account menu > Settings > Reflect > Reflect range > Past year (labels found in the code)
- **Needs:** Memory and Save memories from chats turned on, with a year of chats.
- **Steps:**
  1. Open the account menu, click Settings, then Reflect.
  2. Open the Reflect range dropdown and choose Past year.
  3. Wait for the recap to reload.
  4. Look at the recap for the last 365 days and compare with Expected (a recap of the past year).

## S42.22 Break reminders.

- **Expected:** The product reminds the user to take a break after a chosen amount of use.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TimeFocusSection.tsx:187; apps/web/features/time-focus/TimeFocusReminder.tsx:197; apps/web/features/chat/pages/WebChatPage.tsx:7987
- **Earlier check in the running app:** UI_ONLY: E029 [UI_ONLY; scoped settings observation]: Break reminders and quiet hours controls visible; not enabled.
- **Where to find it:** Account menu > Settings > Time and focus > Break reminder (labels found in the code)
- **Needs:** Patience: the reminder needs the chosen amount of visible time in AGI that day.
- **Steps:**
  1. Open the account menu, click Settings, then Time and focus.
  2. Set Break reminder to the shortest value offered.
  3. Go back to a chat and keep using AGI in the same tab until the chosen time has passed.
  4. Look for the box Time for a break? and compare with Expected.

## S42.23 Time-and-focus settings.

- **Expected:** A Time & focus settings page holds break reminders and quiet hours.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:299; apps/web/features/settings/sections/TimeFocusSection.tsx:114
- **Earlier check in the running app:** UI_ONLY: E029 [UI_ONLY; scoped settings observation]: Break reminders and quiet hours controls visible; not enabled.
- **Where to find it:** Account menu > Settings > Time and focus (labels found in the code)
- **Needs:** A signed-in account.
- **Steps:**
  1. Open the account menu and click Settings.
  2. Click Time and focus in the settings list.
  3. Look for the sections Break reminder and Quiet hours on the page.
  4. Change one of them, look for the save status line, and compare with Expected.

## S42.25 Proactive-feature history and saved editions.

- **Expected:** Past briefings and proactive outputs are kept as a browsable history.
- **Code:** done. Evidence present: apps/web/lib/services/schedule-service.ts:1418; apps/web/app/api/schedules/runs/route.ts:30; apps/web/features/schedules/components/RecentScheduleResults.tsx:55; apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:519
- **Where to find it:** Sidebar > Scheduled > the briefing's card > History icon (title Run History) (labels found in the code)
- **Needs:** A schedule that has run at least once.
- **Steps:**
  1. Click Scheduled in the sidebar.
  2. On the Daily briefing card, click the History icon (title Run History).
  3. Look at the list of past runs with their status (for example completed, failed, timeout).
  4. Open a run to see its result, and compare with Expected (past briefings kept as a browsable history).
