---
id: "PLAN-chrome-042"
type: "test-plan"
title: "Chrome · 42. Proactive assistance, briefings, and reflection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "42"
---
# Chrome · 42. Proactive assistance, briefings, and reflection

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S42.01 Daily briefing setup.

- **Expected:** The user sets up a recurring daily briefing that is generated and delivered to them.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/schedulesSection.ts:683; apps/extension/src/features/side-panel/schedulesSection.ts:799; apps/extension/src/features/cloud-bridge/schedulesClient.ts:260
- **Where to find it:** Side panel > More > Shortcuts (opens Options page on Shortcuts) > Schedules > New schedule > Start from a template > Daily briefing > Create schedule (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the side panel, click More, then click Shortcuts. The Options page opens on the Shortcuts section.
  2. Scroll to the Schedules section and click New schedule.
  3. Under Start from a template, click Daily briefing. The Name, Instructions, Repeat and Time fields fill in.
  4. Choose a Model if none is chosen, then click Create schedule.
  5. Compare with Expected: a status line reads Created Daily briefing. It runs in the cloud even when this browser is closed, and the new schedule appears in the Schedules list.

## S42.04 Delivery time and timezone.

- **Expected:** The user sets the delivery time and timezone of the briefing.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/schedulesSection.ts:515; apps/extension/src/features/side-panel/schedulesSection.ts:520; apps/extension/src/features/side-panel/schedulesSection.ts:799
- **Where to find it:** Side panel > More > Shortcuts > Schedules > New schedule > Repeat, Time and Time zone fields > Create schedule (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the side panel, click More, then click Shortcuts.
  2. In the Schedules section click New schedule and pick a name and prompt.
  3. Set Repeat to Every day, type a value in Time, and open the Time zone list to choose a zone.
  4. Click Create schedule.
  5. Compare with Expected: the new schedule is saved with the time and zone you set. The Time zone list defaults to the browser's own zone, so a different choice should show up. I did not confirm that the schedule list row displays the time and zone.

## S42.10 Follow-up questions on a briefing item.

- **Expected:** The user can ask a follow-up question about a briefing item.
- **Code:** done. Evidence present: apps/extension/src/background.ts:3436; apps/extension/src/background.ts:2527
- **Where to find it:** Chrome notification "Task Completed" > click it > side panel opens the conversation > type in the message box "How can I help you today?" and send (labels found in the code)
- **Needs:** a signed-in account with a finished scheduled run that produced an answer, and Task completion notifications turned on
- **Steps:**
  1. Make sure a scheduled task has finished with an answer (for example Daily briefing after its run).
  2. When the Chrome notification Task Completed appears, click it.
  3. The side panel opens the conversation that holds the scheduled answer.
  4. Click the message box that shows How can I help you today? and type a follow-up question about one item in the briefing, then send.
  5. Compare with Expected: the follow-up is sent in that same conversation and gets a reply about the briefing item.

## S42.15 Pause briefings.

- **Expected:** The user can pause and resume briefings.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10574 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10577 (quoted code not found in the file now)
- **Where to find it:** Side panel > More > Shortcuts > Schedules > [schedule row] > Pause, then Resume (labels found in the code)
- **Needs:** a signed-in account with at least one schedule in the list
- **Steps:**
  1. Open the side panel, click More, then click Shortcuts.
  2. In the Schedules list, find a schedule (create one first with S42.01 if none exists).
  3. Click Pause on that schedule row.
  4. Compare with Expected: the status line reads Schedule paused. and the button on that row now reads Resume.
  5. Click Resume and check the status line reads Schedule resumed. and the button reads Pause again.

## S42.17 Work-completion notifications.

- **Expected:** The user is notified when background work (a scheduled run or agent task) completes.
- **Code:** done. Evidence present: apps/extension/src/background.ts:3436; apps/extension/src/background.ts:2482
- **Where to find it:** Side panel > More > Extension settings > Options > Task completion notifications (toggle on); then Shortcuts > Schedules > [schedule row] > Run now and wait for the Chrome notification Task Completed (labels found in the code)
- **Needs:** a signed-in account with at least one schedule, and Chrome notifications allowed for the browser
- **Steps:**
  1. Open the side panel, click More, then click Extension settings. The Options page opens.
  2. Click Options in the left list and check that the Task completion notifications toggle is on.
  3. Go to Shortcuts, find a schedule in the Schedules list and click Run now.
  4. Wait for the run to finish.
  5. Compare with Expected: a Chrome notification titled Task Completed appears, reading the schedule name and answer snippet or Scheduled task "<name>" finished.
