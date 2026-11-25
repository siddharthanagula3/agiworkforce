---
id: "PLAN-cli-042"
type: "test-plan"
title: "CLI · 42. Proactive assistance, briefings, and reflection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "42"
---
# CLI · 42. Proactive assistance, briefings, and reflection

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S42.04 Delivery time and timezone.

- **Expected:** The user sets the delivery time and timezone of the briefing.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1526; apps/cli/src/schedules.rs:292
- **Where to find it:** Type `agi schedules create --name <name> --schedule "0 9 * * *" --prompt <text> --timezone <IANA zone>` to set the time and zone, or `agi schedules edit <id or exact name> --timezone <IANA zone>` to change them later. Check with `agi schedules list`. (labels found in the code)
- **Needs:** a signed-in account (schedules run in AGI cloud)
- **Steps:**
  1. Run `agi schedules create --name "Morning briefing" --schedule "0 9 * * *" --prompt "Summarize my day" --timezone America/New_York`.
  2. Note the id the command prints.
  3. Run `agi schedules edit <id> --timezone Europe/London`.
  4. Run `agi schedules list` and check that the cadence and timezone shown match the new zone (compare with Expected: the user sets the delivery time and timezone).

## S42.15 Pause briefings.

- **Expected:** The user can pause and resume briefings.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:316; apps/cli/src/lib.rs:4473
- **Where to find it:** Type `agi schedules pause <id or exact name>` and `agi schedules resume <id or exact name>`. Check status with `agi schedules list`. (labels found in the code)
- **Needs:** a signed-in account and at least one existing schedule (create one with `agi schedules create` first)
- **Steps:**
  1. Run `agi schedules list` and note the id and status of a schedule.
  2. Run `agi schedules pause <id or exact name>`.
  3. Run `agi schedules list` and check that the schedule shows as paused (not active).
  4. Run `agi schedules resume <id or exact name>`, then `agi schedules list` again, and check it is active. Compare with Expected: the user can pause and resume briefings.

## S42.17 Work-completion notifications.

- **Expected:** The user is notified when background work (a scheduled run or agent task) completes.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8672; apps/cli/src/config.rs:1467
- **Where to find it:** Type `/config set bell true` in the chat, then `/config get bell` to check it. The bell itself is shown as "Bell when a long turn finishes" in `/config show`. (labels found in the code)
- **Needs:** a terminal that plays a bell sound, and a long-running chat request
- **Steps:**
  1. Type `/config set bell true` and press Enter.
  2. Type `/config get bell` and check that it reports true.
  3. Send a chat request that takes at least 10 seconds, switch to another window, and listen for the terminal bell when the turn finishes.
  4. Compare with Expected: the user is notified when background work (a scheduled run or agent task) completes. The bell covers only a foreground chat turn, so a scheduled run finishing should not ring it.
