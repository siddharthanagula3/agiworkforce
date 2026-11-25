---
id: "REQ-AREA-063"
type: "requirements"
title: "Requirement items: Routines, schedules, and triggers"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 63. Routines, schedules, and triggers

35 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S63.01

**Routine gallery.** A browsable gallery of ready-made routines the user can start from at any time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F063-01 Routine gallery (templates)](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)

## S63.02

**Create routine from a prompt.** The user writes a prompt (instructions or a plain-language request) and a saved routine is created from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Seen in a real run: Web BLOCKED
- Feature: [F063-02 Create a routine (from a prompt, from a chat turn, from a share link)](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-04

## S63.03

**Create routine from a completed task.** From a finished task or chat turn, one action turns that work into a saved routine.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F063-02 Create a routine (from a prompt, from a chat turn, from a share link)](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Competitor trace: CAP-agent-actions-22, CAP-scheduled-tasks-05

## S63.04

**Routine name and description.** A routine has a user-set name and an optional description, both editable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome done
- Feature: [F063-02 Create a routine (from a prompt, from a chat turn, from a share link)](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)

## S63.05

**Prompt editor.** A multi-line editor to write and later edit the routine's instructions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F063-02 Create a routine (from a prompt, from a chat turn, from a share link)](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)

## S63.06

**Source selection.** The user chooses which sources (project files, instructions, docs, web) a routine run may read.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F063-03 What a run may use: sources, connectors, agent, model](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Competitor trace: CAP-scheduled-tasks-21

## S63.07

**Repository selection.** The user picks a code repository the routine runs against (checked out for the run).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F063-03 What a run may use: sources, connectors, agent, model](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Competitor trace: CAP-agent-actions-12, CAP-scheduled-tasks-21, CAP-scheduled-tasks-27

## S63.08

**Connector selection.** Per routine, the user chooses which connectors/tools the run may use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F063-03 What a run may use: sources, connectors, agent, model](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Competitor trace: CAP-scheduled-tasks-21

## S63.09

**Agent selection.** The user picks which agent (custom agent/persona) runs the routine.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F063-03 What a run may use: sources, connectors, agent, model](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Competitor trace: CAP-agent-actions-09, CAP-scheduled-tasks-21

## S63.10

**Model/effort selection.** Per routine, the user picks the model and the reasoning effort the run uses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F063-03 What a run may use: sources, connectors, agent, model](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Competitor trace: CAP-scheduled-tasks-21

## S63.11

**One-time schedule.** A routine can be set to run once at a chosen future date and time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Seen in a real run: Web BLOCKED
- Feature: [F063-04 When it runs: one-time, repeating, time zone, advanced rules](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-01

## S63.12

**Recurring schedule.** A routine can repeat on a cadence (daily/weekly/monthly or similar) and fires on each occurrence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Seen in a real run: Web BLOCKED
- Feature: [F063-04 When it runs: one-time, repeating, time zone, advanced rules](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-02

## S63.13

**Timezone control.** The user sets the time zone a routine's times are interpreted in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F063-04 When it runs: one-time, repeating, time zone, advanced rules](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Competitor trace: CAP-scheduled-tasks-03

## S63.14

**Advanced recurrence.** Beyond simple daily/weekly, a routine accepts advanced recurrence (cron, intervals, iCalendar rules, run windows).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome missing
- Feature: [F063-04 When it runs: one-time, repeating, time zone, advanced rules](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-03

## S63.15

**Event-trigger selection.** A routine can be set to run when an external event happens (GitHub, Slack, Gmail, Calendar, webhook) and it runs when the event arrives.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, Chrome missing
- Feature: [F063-05 Event triggers and webhooks](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Competitor trace: CAP-agent-actions-11, CAP-scheduled-tasks-14

## S63.16

**Event filters.** Event triggers can be narrowed (event types, account, field conditions, repeat suppression) so only matching events start the routine.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, Chrome missing
- Feature: [F063-05 Event triggers and webhooks](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Competitor trace: CAP-agent-actions-11, CAP-scheduled-tasks-15

## S63.17

**Webhook trigger.** A routine gets a webhook URL (with a secret); a signed POST to it starts a run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome missing
- Feature: [F063-05 Event triggers and webhooks](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Competitor trace: CAP-agent-actions-11, CAP-scheduled-tasks-14

## S63.18

**API trigger.** A documented, token-authenticated API call starts a routine run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F063-05 Event triggers and webhooks](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Competitor trace: CAP-agent-actions-11, CAP-scheduled-tasks-16

## S63.19

**Manual run.** A "Run now" control starts the routine immediately and the run completes with a result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F063-06 Run now and run results](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-07

## S63.20

**Next-run display.** Each routine shows when it will next run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F063-06 Run now and run results](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-02, CAP-scheduled-tasks-08

## S63.21

**Last-run display.** Each routine shows when it last ran and whether that run failed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F063-06 Run now and run results](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-08

## S63.22

**Run-history list.** A list of a routine's past runs with status and time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F063-06 Run now and run results](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-09

## S63.23

**Per-run results.** Opening a run shows what that run produced (its output text), not just its status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F063-06 Run now and run results](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Competitor trace: CAP-scheduled-tasks-09

## S63.24

**Enable/disable.** A routine can be paused and resumed without deleting it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F063-07 Pause, resume, edit, delete, share](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-07

## S63.25

**Pause until date.** The user pauses a routine until a chosen date, after which it resumes by itself.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F063-07 Pause, resume, edit, delete, share](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Competitor trace: CAP-agent-actions-10

## S63.26

**Edit schedule.** An existing routine's timing and settings can be edited and saved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F063-07 Pause, resume, edit, delete, share](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Competitor trace: CAP-scheduled-tasks-07

## S63.27

**Delete routine.** A routine can be deleted, after a confirmation, and stops running.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F063-07 Pause, resume, edit, delete, share](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Competitor trace: CAP-agent-actions-10, CAP-scheduled-tasks-07

## S63.28

**Duplicate routine.** One action copies an existing routine into a new editable routine.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F063-07 Pause, resume, edit, delete, share](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Competitor trace: CAP-agent-actions-10

## S63.29

**Share routine template.** A routine (or its template) can be shared so another person can create their own copy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F063-07 Pause, resume, edit, delete, share](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Competitor trace: CAP-scheduled-tasks-24

## S63.30

**Notification preferences.** Per routine, the user chooses how (or whether) they are notified about its runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing
- Feature: [F063-08 Cost and safety controls: caps, notifications, approvals](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Competitor trace: CAP-scheduled-tasks-19

## S63.31

**Budget controls.** Per routine, the user caps what it may spend (cost, credits, or number of runs).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F063-08 Cost and safety controls: caps, notifications, approvals](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Competitor trace: CAP-agent-actions-10, CAP-agent-actions-28, CAP-scheduled-tasks-23

## S63.32

**Required-approval behavior.** When an unattended run needs approval for an action, it pauses and asks the user, and resumes once approved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F063-08 Cost and safety controls: caps, notifications, approvals](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Competitor trace: CAP-agent-actions-02, CAP-agent-actions-14, CAP-scheduled-tasks-20

## S63.33

**Missed-run explanation.** When a scheduled occurrence is missed or skipped, the run history says so and why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F063-09 Missed runs, retries and held runs](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Competitor trace: CAP-scheduled-tasks-10

## S63.34

**Deferred execution after allowance reset.** A run that hits the usage allowance is held and runs automatically once the allowance resets.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F063-09 Missed runs, retries and held runs](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Competitor trace: CAP-agent-actions-10, CAP-agent-actions-28, CAP-scheduled-tasks-23

## S63.35

**Connection-expiry repair flow.** When a connector a routine depends on expires, the user is told on the routine and led to reconnect it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F063-09 Missed runs, retries and held runs](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
