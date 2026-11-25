---
id: "PLAN-cli-063"
type: "test-plan"
title: "CLI · 63. Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "63"
---
# CLI · 63. Routines, schedules, and triggers

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S63.02 Create routine from a prompt.

- **Expected:** The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1515; apps/cli/src/lib.rs:4404; apps/cli/src/features/exec/tools/task_registry/mod.rs:22
- **Where to find it:** Terminal: agi schedules create --name "<name>" --schedule "0 9 * * *" --prompt "<prompt>". Or in an interactive agi session type /schedule and describe the routine. (labels found in the code)
- **Needs:** a signed-in AGI account in the CLI
- **Steps:**
  1. In a terminal, type agi schedules create --name "Morning summary" --schedule "0 9 * * *" --prompt "Summarize my open pull requests."
  2. Press Enter and read the printed result.
  3. Type agi schedules list and find the new schedule.
  4. Compare: a saved schedule appears with its name, its cron cadence, and the prompt you wrote is the one it runs.

## S63.03 Create routine from a completed task.

- **Expected:** From a finished task or chat turn, one action turns that work into a saved routine.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:321; apps/cli/src/claude_parity.rs:901
- **Where to find it:** Interactive agi session: type /save-routine, optionally followed by a schedule such as 0 9 * * *, after the task is finished. (labels found in the code)
- **Needs:** a finished task or chat turn in an interactive session, and a signed-in AGI account
- **Steps:**
  1. Finish a task in an interactive agi session.
  2. Type /save-routine 0 9 * * * and press Enter.
  3. Wait for the reply, which says it will create a routine with cron_create.
  4. Compare: one command turns the finished task into a saved routine, and the reply tells you the schedule and what each run will do.

## S63.04 Routine name and description.

- **Expected:** A routine has a user-set name and an optional description, both editable.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:460; apps/cli/src/lib.rs:4436
- **Where to find it:** Terminal: agi schedules create --name "<name>" --description "<text>" and agi schedules edit <id> --name "<name>" --description "<text>". (labels found in the code)
- **Needs:** a signed-in AGI account in the CLI
- **Steps:**
  1. Type agi schedules create --name "Weekly report" --schedule "0 9 * * 1" --prompt "Write the weekly report." --description "Runs every Monday".
  2. Note the id printed in the result.
  3. Type agi schedules edit <id> --name "Weekly status" --description "Monday status note".
  4. Compare: the name and description both change, and the cadence and prompt stay the same.

## S63.05 Prompt editor.

- **Expected:** A multi-line editor to write and later edit the routine's instructions.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:460; apps/cli/src/lib.rs:4436
- **Where to find it:** Terminal: agi schedules edit <id> --prompt "<instructions>" (also set with --prompt on agi schedules create). (labels found in the code)
- **Needs:** a signed-in AGI account in the CLI
- **Steps:**
  1. Type agi schedules edit <id> --prompt "Check the build and report failures."
  2. Press Enter and read the printed result.
  3. Type agi schedules list --json and find the prompt field of that schedule.
  4. Compare: the new prompt is saved in place of the old one.

## S63.12 Recurring schedule.

- **Expected:** A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1520; apps/cli/src/lib.rs:4404
- **Where to find it:** Terminal: agi schedules create --schedule "<5-field cron>", for example "0 9 * * *" for every day at 09:00. (labels found in the code)
- **Needs:** a signed-in AGI account; waiting for an occurrence to see it fire, or agi schedules run <id> to run now
- **Steps:**
  1. Type agi schedules create --name "Daily" --schedule "0 9 * * *" --prompt "Say good morning."
  2. Note the id in the result.
  3. Type agi schedules list and read the cadence shown for it.
  4. Compare: the schedule shows the cron cadence and a next run time, and it fires on each occurrence.

## S63.13 Timezone control.

- **Expected:** The user sets the time zone a routine's times are interpreted in.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1526; apps/cli/src/lib.rs:4394
- **Where to find it:** Terminal: agi schedules create --timezone "<IANA zone>" or agi schedules edit <id> --timezone "<IANA zone>". (labels found in the code)
- **Needs:** none beyond a signed-in AGI account
- **Steps:**
  1. Type agi schedules create --name "Lunch" --schedule "0 12 * * *" --prompt "Lunch reminder." --timezone "America/New_York".
  2. Read the result line; it shows the time zone after the cadence.
  3. Type agi schedules edit <id> --timezone "Europe/London" and read the result.
  4. Compare: the zone shown changes to the one you set, and the next run time is calculated in that zone.

## S63.14 Advanced recurrence.

- **Expected:** Beyond simple daily/weekly, a routine accepts advanced recurrence (cron, intervals, iCalendar rules, run windows).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1520; apps/cli/src/schedules.rs:89
- **Where to find it:** not found in the code. Only 5-field cron is accepted by agi schedules create and edit; I searched apps/cli for interval, iCalendar, RRULE and run-window options and found none. The CLI only displays server-sent interval and once schedule types (schedules.rs schedule_cadence).

## S63.15 Event-trigger selection.

- **Expected:** A routine can be set to run when an external event happens (GitHub, Slack, Gmail, Calendar, webhook) and it runs when the event arrives.
- **Code:** done. Evidence present: apps/cli/src/daemon.rs:1143; apps/cli/src/lib.rs:6384; apps/cli/src/daemon.rs:46
- **Where to find it:** Terminal: agi schedules triggers add <schedule> --source github|slack|gmail|google_calendar|connector. Webhook: agi triggers add <id> --webhook <path> --prompt "<prompt>", with agi --daemon running. (labels found in the code)
- **Needs:** an outside account (GitHub, Slack, Gmail or Google Calendar) connected to AGI for the chosen source; for the webhook, a running agi --daemon
- **Steps:**
  1. Type agi schedules triggers add <schedule> --source github --account owner/name --event pull_request.opened
  2. Read the printed trigger; it shows the trigger id and its endpoint.
  3. Open a new pull request on that repository (or send the event).
  4. Compare: the schedule starts a run when the event arrives, and agi schedules runs <schedule> shows a run with a trigger source.

## S63.16 Event filters.

- **Expected:** Event triggers can be narrowed (event types, account, field conditions, repeat suppression) so only matching events start the routine.
- **Code:** done. Evidence moved: apps/cli/src/features/hooks/hooks.rs:627; apps/cli/src/features/hooks/hooks.rs:645; apps/cli/src/features/hooks/hooks.rs:654; apps/cli/src/daemon.rs:891; apps/cli/src/daemon.rs:1031; apps/cli/src/daemon.rs:1041 (quoted code not found in the file now); apps/cli/src/daemon.rs:1277; apps/cli/src/lib.rs:2239
- **Where to find it:** Terminal: agi schedules triggers add <schedule> --source github --event <type> --when "<FIELD OPERATOR VALUE>" --debounce <seconds>. Daemon triggers: agi triggers filter <id> --event <type> --when "/json/pointer=value" --quiet-for <seconds>. (labels found in the code)
- **Needs:** an outside account connected for the chosen source
- **Steps:**
  1. Type agi schedules triggers add <schedule> --source github --account owner/name --event pull_request.opened --when "data.baseRef equals main" --debounce 60
  2. Read the printed trigger and check the event and condition are shown.
  3. Open a pull request into a different branch, then one into main.
  4. Compare: only the matching event starts a run, and repeats inside the debounce window do not start another.

## S63.20 Next-run display.

- **Expected:** Each routine shows when it will next run.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:590; apps/cli/src/lib.rs:4376
- **Where to find it:** Terminal: agi schedules list (labels found in the code)
- **Needs:** a signed-in AGI account with at least one schedule
- **Steps:**
  1. Create a schedule with agi schedules create (see S63.02).
  2. Type agi schedules list.
  3. Read the line under each schedule's name.
  4. Compare: the line shows next: with the next run time, or next: not scheduled when none is set.

## S63.21 Last-run display.

- **Expected:** Each routine shows when it last ran and whether that run failed.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:597; apps/cli/src/lib.rs:4376
- **Where to find it:** Terminal: agi schedules list (last: field), and agi schedules runs <id> for run results. (labels found in the code)
- **Needs:** a signed-in AGI account with a schedule that has run
- **Steps:**
  1. Run agi schedules run <id> to run a schedule now.
  2. Type agi schedules list.
  3. Read the last: value and any last error: line under that schedule.
  4. Compare: the last run time shows, and a failed last run shows its error line.

## S63.22 Run-history list.

- **Expected:** A list of a routine's past runs with status and time.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1592; apps/cli/src/lib.rs:4512
- **Where to find it:** Terminal: agi schedules runs <id> (labels found in the code)
- **Needs:** a schedule that has run at least once
- **Steps:**
  1. Type agi schedules runs <id>.
  2. Read each run line: its id, status, trigger source, start time and duration.
  3. Type agi schedules runs <id> --limit 5 to see fewer runs.
  4. Compare: past runs are listed with status and time, newest first as the server returns them.

## S63.23 Per-run results.

- **Expected:** Opening a run shows what that run produced (its output text), not just its status.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:489
- **Where to find it:** Terminal: agi schedules runs <id> (output: lines under each run); agi schedules run <id> for a run started now. (labels found in the code)
- **Needs:** a schedule whose run produced output
- **Steps:**
  1. Type agi schedules runs <id>.
  2. Find an output: line under a run.
  3. Type agi schedules runs <id> --json for the full output.
  4. Compare: each run shows its output text, not only its status. Long output is cut after a few lines, and --json has the full text.

## S63.24 Enable/disable.

- **Expected:** A routine can be paused and resumed without deleting it.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:316; apps/cli/src/lib.rs:4473
- **Where to find it:** Terminal: agi schedules pause <id> and agi schedules resume <id> (labels found in the code)
- **Needs:** a signed-in AGI account with a schedule
- **Steps:**
  1. Type agi schedules pause <id> and read the result.
  2. Type agi schedules list and check the status shown for that schedule.
  3. Type agi schedules resume <id>.
  4. Compare: the schedule stops firing while paused, is kept in the list, and fires again after resume.

## S63.27 Delete routine.

- **Expected:** A routine can be deleted, after a confirmation, and stops running.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1541; apps/cli/src/lib.rs:3589; apps/cli/src/lib.rs:4425
- **Where to find it:** Terminal: agi schedules delete <id> (labels found in the code)
- **Needs:** a schedule you can delete; a test schedule is recommended because deletion cannot be undone
- **Steps:**
  1. Type agi schedules delete <id>.
  2. At the confirmation, read the warning, then answer no and check the schedule is still in agi schedules list.
  3. Type agi schedules delete <id> again and answer yes.
  4. Compare: after the confirmation the schedule is gone from agi schedules list, and it no longer fires.

## S63.32 Required-approval behavior.

- **Expected:** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.
- **Code:** done. Evidence present: apps/web/lib/services/scheduled-agent-executor.ts:620; apps/web/lib/services/scheduled-agent-executor.ts:644; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:152
- **Where to find it:** Terminal: agi schedules runs <id> (shows the waiting approval), then agi schedules approve <id> or agi schedules deny <id> (labels found in the code)
- **Needs:** a schedule whose unattended run is waiting for approval, which the tester may not be able to cause from the CLI
- **Steps:**
  1. Type agi schedules list and find a schedule showing paused: a run needed your approval.
  2. Type agi schedules runs <id> and read the waiting for your approval block with its actions.
  3. Type agi schedules approve <id> and answer the prompt (or add --yes).
  4. Compare: the run continues after approval, and its status changes from awaiting_approval.

## S63.33 Missed-run explanation.

- **Expected:** When a scheduled occurrence is missed or skipped, the run history says so and why.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:489
- **Where to find it:** Terminal: agi schedules runs <id> (labels found in the code)
- **Needs:** a schedule that missed an occurrence, which is hard to cause from the CLI
- **Steps:**
  1. Type agi schedules runs <id>.
  2. Look for a line ran late for the occurrence due <time> under a run.
  3. Type agi schedules runs <id> --json and look for missedExecution and skipped.
  4. Compare: a late run says it ran late for its due time. A skipped occurrence shows only its status, with no reason printed by the CLI.
