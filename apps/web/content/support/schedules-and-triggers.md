---
id: schedules-and-triggers
title: Schedule a task, or run it on a trigger
path: /chat/schedules
category: work
tags: schedule, scheduled task, cron, recurring, timezone, trigger, webhook, gmail, google calendar, github, run history, automation
updated: 2026-09-17
scope: public
---

## Create a schedule

The schedules page creates a recurring task from four things: a name,
instructions describing the text task to run, a note on why it runs, and when it
runs. A timezone is part of the schedule, so a daily brief fires at the local
hour you meant. A schedule can be created active or saved inactive and switched
on later.

Schedules can be filtered by project and by status, and each one has a run
history you can open to see what happened on previous runs.

## Triggers instead of a clock

A schedule can also be attached to an event:

- **Gmail**, which fires when the mailbox changes and waits until the mailbox
  watch is registered for it.
- **Google Calendar**, which waits until the calendar watch is registered.
- **GitHub**, which fires for the repositories your GitHub App installation
  covers.
- **Anything else**, through a signed webhook addressed to its own channel.

A trigger that is still waiting for its watch to register says so rather than
reporting itself as live.

## What an unattended run means

The form states it plainly: an unattended run can fail or be skipped, and
behaviour may change. Treat a scheduled task as something to check the history
of, not something to rely on silently.

## Editing and deleting

Editing a schedule warns before discarding unsaved changes. **Delete Schedule**
asks first, and deleting a trigger is a separate confirmation.

## Limits

How many scheduled tasks you can keep depends on your plan, and free and
BYOK-only accounts have none. A workspace administrator can turn Schedules and
Event triggers off for a managed workspace. The pricing page carries the current
per-plan figures.
