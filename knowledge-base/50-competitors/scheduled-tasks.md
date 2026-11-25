---
id: "COMP-scheduled-tasks"
type: "competitor-trace"
title: "Tasks and schedules"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Tasks and schedules: competitors to requirements

Both leaders ship scheduled tasks: recurring and one-time, run history, notifications, event triggers and plan caps. Claude Code adds local, cloud and in-session loops; ChatGPT adds monitoring, sharing and in-chat schedules. AGI has a broad Cloud-only version on most apps, seen working once on Web for a one-time run. Local scheduled tasks and in-session loop are not built. Several Web defects were seen.

**How the products divide this topic.** Claude chat (Cowork, claude.ai apps) offers scheduled tasks via support.claude.com. Claude Code (code.claude.com) has three separate paths: cloud scheduled tasks (formerly routines, with schedule, API and GitHub triggers), desktop local tasks, and in-session /loop. Cloud tasks need a claude.ai account and paid plans. ChatGPT has Scheduled tasks on web and mobile (help.openai.com): Free gets 3 active, one-time or daily at most; event triggers need Plus or higher and an admin switch in managed workspaces. Codex (learn.chatgpt.com) has desktop automations with local projects and worktrees; CLI and IDE have no Scheduled interface. Dots are a rolling-out ChatGPT feature. The coding tools connect to the chat products through shared account and plan usage. Review date 2026-11-22.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-scheduled-tasks-01](#cap-scheduled-tasks-01) | One-time scheduled task | yes | yes | built | seen working by a person |
| [CAP-scheduled-tasks-02](#cap-scheduled-tasks-02) | Recurring schedule with presets | yes | yes | built | code inspected only |
| [CAP-scheduled-tasks-03](#cap-scheduled-tasks-03) | Advanced recurrence and time zone | yes | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-04](#cap-scheduled-tasks-04) | Create a task by describing it in chat | yes | yes | partly built | seen failing by a person |
| [CAP-scheduled-tasks-05](#cap-scheduled-tasks-05) | Turn a finished chat answer or task into a schedule | yes | unknown | built | code inspected only |
| [CAP-scheduled-tasks-06](#cap-scheduled-tasks-06) | Schedule inside an existing chat | unknown | yes | not built | not verified |
| [CAP-scheduled-tasks-07](#cap-scheduled-tasks-07) | Manage tasks: run now, pause, resume, edit, delete | yes | yes | partly built | seen working by a person |
| [CAP-scheduled-tasks-08](#cap-scheduled-tasks-08) | Scheduled page with next run, last run and unread indicator | yes | yes | partly built | seen failing by a person |
| [CAP-scheduled-tasks-09](#cap-scheduled-tasks-09) | Run history and per-run results | yes | yes | partly built | seen failing by a person |
| [CAP-scheduled-tasks-10](#cap-scheduled-tasks-10) | Missed-run and skipped-run explanation | yes | unknown | built | code inspected only |
| [CAP-scheduled-tasks-11](#cap-scheduled-tasks-11) | Cloud execution with the device off | yes | yes | built | seen working by a person |
| [CAP-scheduled-tasks-12](#cap-scheduled-tasks-12) | Local-device scheduled tasks | yes | yes | not built | not verified |
| [CAP-scheduled-tasks-13](#cap-scheduled-tasks-13) | In-session recurring prompt (loop) and session timers | yes | unknown | not built | not verified |
| [CAP-scheduled-tasks-14](#cap-scheduled-tasks-14) | Event triggers (mail, chat, code host, webhook) | partly | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-15](#cap-scheduled-tasks-15) | Trigger filters and conditions | partly | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-16](#cap-scheduled-tasks-16) | Token-authenticated API trigger | yes | unknown | built | code inspected only |
| [CAP-scheduled-tasks-17](#cap-scheduled-tasks-17) | Several triggers on one task | yes | no | built | code inspected only |
| [CAP-scheduled-tasks-18](#cap-scheduled-tasks-18) | Monitoring tasks that stop at an end condition | unknown | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-19](#cap-scheduled-tasks-19) | Task result notifications | unknown | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-20](#cap-scheduled-tasks-20) | Approval pauses for unattended runs | yes | yes | built | code inspected only |
| [CAP-scheduled-tasks-21](#cap-scheduled-tasks-21) | Per-task model, sources, connectors and agent | yes | partly | partly built | code inspected only |
| [CAP-scheduled-tasks-22](#cap-scheduled-tasks-22) | Plan limits and run caps | yes | yes | partly built | seen working by a person |
| [CAP-scheduled-tasks-23](#cap-scheduled-tasks-23) | Budget caps and deferred runs after allowance reset | partly | unknown | partly built | code inspected only |
| [CAP-scheduled-tasks-24](#cap-scheduled-tasks-24) | Share a task by link | unknown | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-25](#cap-scheduled-tasks-25) | Team and workspace tasks with admin controls | partly | yes | partly built | code inspected only |
| [CAP-scheduled-tasks-26](#cap-scheduled-tasks-26) | Scheduled runs that publish an artifact | yes | unknown | not built | not verified |
| [CAP-scheduled-tasks-27](#cap-scheduled-tasks-27) | Isolated worktree or repository for scheduled coding runs | yes | yes | not built | not verified |
| [CAP-scheduled-tasks-28](#cap-scheduled-tasks-28) | Run in CI on a schedule | yes | unknown | not built | not verified |
| [CAP-scheduled-tasks-29](#cap-scheduled-tasks-29) | Always-on proactive agent (dots) | unknown | yes | not built | not verified |

## CAP-scheduled-tasks-01 One-time scheduled task

Run a saved prompt once at a chosen future time, then mark it done.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork), Claude Code: yes**
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Asking for a single future run creates a one-time task that disables itself after firing. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop (Claude Code).
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Schedule trigger can be a one-off run that then shows Completed. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): ChatGPT can run one-time or recurring tasks, managed from a Scheduled page. Free allows one-time or at most daily runs. Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). A user can schedule a one-time run of a saved prompt on Web, Desktop and Mobile; it runs once, shows Completed, and does not fire again.

**With different models, providers and the one subscription.** Run uses a model from the catalog that Cloud schedules support; one run counts once against the AGI Subscription allowance. Local mode: the app must say the run needs Cloud and never send a Local chat to Cloud silently.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile done; CLI, Chrome missing for one-time (ledger). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.11
- Comparison list ids: none matched; rows without an id: web: 'Scheduled tasks list: create, run now, pause, history' (no id)
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:221`; `apps/web/lib/services/schedule-service.ts:532`; `apps/mobile/src/features/schedules/policy.ts:4`

**Gap.** CLI and Chrome cannot create a one-time schedule in the ledger. A completed one-time task also shows a Paused label (seen defect).

**Acceptance criteria**

1. Create a one-time task 5 minutes ahead on Web; it shows Completed with one run and does not run again.
2. Its card does not say Paused after completion.
3. The same one-time task can be created on Mobile and Desktop.
4. Reload and offline give a clear message and recover.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-16 subscribed: one-time Cloud schedule ran once (Completed, Runs 1); defect 'Completed one-time schedule is also labelled Paused' in 6-defects/web-problems-seen-in-browser.csv. Web only.

## CAP-scheduled-tasks-02 Recurring schedule with presets

Repeat a task hourly, daily, weekdays, weekly or monthly, with a next-run time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork), Claude Code: yes**
  - [https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Cowork tasks run hourly, daily, weekly, weekdays or on demand, each run as its own session; runs remotely with the computer off. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, ios, android.
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Presets Hourly, Daily, Weekdays, Weekly, Manual and Custom cron. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop (Claude Code).
- **ChatGPT; Codex for the desktop app: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Recurring tasks; hourly and exact times need a paid plan. Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Recurring background tasks with a Scheduled view of active, paused and completed tasks. Plans: eligible plans. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 ('Pause/resume/delete', 'Run history'); cadence list otherwise inferred from competitor parity). Presets for daily, weekdays, weekly and monthly (and hourly on plans that allow it) on every app that can create schedules; each shows its next run.

**With different models, providers and the one subscription.** Cadence limits per plan come from the subscription catalog, not from the form. Local mode: recurring runs need Cloud unless a local runner exists.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile (once/daily/weekly/monthly), CLI, Chrome done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.12, S63.20
- Comparison list ids: none matched; rows without an id: web: 'Schedule frequencies' (no id)
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:223`; `apps/mobile/src/features/schedules/policy.ts:6`; `apps/cli/src/lib.rs:1109`

**Gap.** Mobile offers only once, daily, weekly, monthly. Checks run every 15 minutes, so a run may start late.

**Acceptance criteria**

1. Create a daily task and see the correct next run in the shown time zone.
2. Create a weekly task on Mobile and see it on Web.
3. A task runs at most once per occurrence.

**Verification: code inspected only.** Only the one-time case was run by a person (W-16). Recurring not driven.

## CAP-scheduled-tasks-03 Advanced recurrence and time zone

Custom cron or recurrence rule, and an explicit time zone for the schedule.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/scheduled-tasks.md](https://code.claude.com/docs/en/scheduled-tasks.md): Standard 5-field cron in local time; no L, W, ? or name aliases. Apps: cli.
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Custom cron not more often than hourly; presets use local time. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, cli.
- **Codex (desktop app): yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Custom schedule controls plus advanced editing of an RFC 5545 recurrence rule. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Power users can enter cron or a recurrence rule and choose a time zone; invalid input is refused with a plain message.

**With different models, providers and the one subscription.** Minimum interval is a plan limit read from configuration. Independent of model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, CLI done; Mobile declined by owner decision (S63.14); Chrome missing. Time zone: Web, Desktop, Mobile, CLI done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.13, S63.14
- Comparison list ids: none matched; rows without an id: desktop: 'Schedule cadence options: presets, custom cron, advanced recurrence rule' (no id)
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:226`; `apps/web/features/schedules/components/ScheduleForm.tsx:428`; `apps/cli/src/schedules.rs:87`

**Gap.** Chrome has no advanced recurrence or time zone. Daylight-saving behaviour has not been run by a person.

**Acceptance criteria**

1. Enter a valid cron and see the next three run times.
2. Enter an invalid cron and get an error without saving.
3. Cross a daylight-saving change and the run keeps its local time.

**Verification: code inspected only.** No scorecard or defect row covers cron or time zone.

## CAP-scheduled-tasks-04 Create a task by describing it in chat

Say what and when in plain language and the assistant drafts and saves the scheduled task.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude (Cowork): yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): /schedule (alias /routines) manages tasks conversationally, including one-off natural-language times. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
  - [https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Create from conversation or 'Create with Claude'. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web.
- **ChatGPT / Codex: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Describe work and timing in chat and it drafts the prompt and destination; skills can also create tasks. Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity). Asking the assistant in chat to schedule something creates a task for review before it is saved; a Free user who asks is pointed to Upgrade.

**With different models, providers and the one subscription.** The scheduling tool must be available whichever model answers, via the AGI tool layer. Free users get an Upgrade pointer (owner rule: Free screens show Upgrade only).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has the tool; a Free chat reply says no scheduling tool is available with no Upgrade pointer. CLI /schedule done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.02
- Comparison list ids: none matched; rows without an id: web: 'Ask the assistant in chat to create a scheduled task' (no id); cli: 'Slash command /schedule' (no id)
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1198`; `apps/cli/src/claude_parity.rs:322`

**Gap.** Free chat reply has no Upgrade pointer (seen defect).

**Acceptance criteria**

1. On a paid account say 'remind me in 4 minutes' and a task appears in Scheduled.
2. On Free the reply names Upgrade.
3. The same request works with two different model choices.

**Verification: seen failing by a person.** 6-defects row W-16 free: 'Chat reply to a Free user asking to schedule a task gives no Upgrade or waitlist pointer'. Paid path not run.

## CAP-scheduled-tasks-05 Turn a finished chat answer or task into a schedule

One action on a reply or finished task opens a schedule form with that prompt filled in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/scheduled-tasks.md](https://code.claude.com/docs/en/scheduled-tasks.md): Skills can be the loop prompt; reminders are made in natural language. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity (comparison file marks Claude yes, ChatGPT partial; catalogue lines found above do not confirm either)). A reply menu has Schedule that carries the prompt into the task form.

**With different models, providers and the one subscription.** Carry the prompt only, not the Local chat history, unless the user confirms.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, CLI done; Mobile, VS Code, Chrome missing in S63.03 (Chrome has a Title menu Schedule item). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.03
- Comparison list ids: WP48; rows without an id: web: 'Run a turn again on a schedule' (no id)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:4050`; `apps/cli/src/claude_parity.rs:256`

**Gap.** Mobile and VS Code cannot do it.

**Acceptance criteria**

1. Click Schedule on a reply and the form opens with the prompt filled.
2. Saving creates a task; cancelling creates nothing.

**Verification: code inspected only.** Not in W-16 notes.

## CAP-scheduled-tasks-06 Schedule inside an existing chat

A task that returns to one chat with its context and posts results there.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex (desktop/web); ChatGPT chat: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Return to an existing chat with its context on minute, daily or weekly cadence. Apps: web, desktop.

**AGI requirement** (proposed; source: competitor parity, one competitor only). Owner decision needed (see unresolved choices). If built, results return to the same chat.

**With different models, providers and the one subscription.** Chat context sent to Cloud must be consented to; a Local chat cannot be scheduled into Cloud without a visible fork.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop comparison row says Same via schedule-from-turn; the web row says Missing (no conversation link). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W166; rows without an id: desktop: 'Schedule a task from inside a chat' (no id)
- Code: `apps/web/features/schedules/components/schedule-from-turn.ts`

**Gap.** Comparison files disagree between web and desktop; results do not return to the originating chat.

**Acceptance criteria**

1. Schedule from a chat; the result appears in that chat.
2. A Local chat shows a consent step before it is scheduled.

**Verification: not verified.** No person-run evidence.

## CAP-scheduled-tasks-07 Manage tasks: run now, pause, resume, edit, delete

A Scheduled page where each task can be started now, paused, edited or deleted.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud), Claude (Cowork): yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Task page lets you Run now, toggle the schedule on or off, edit all fields, or delete. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Scheduled sidebar page lists tasks and lets you edit, pause, resume, delete or run on demand. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Edit, pause, resume or delete from the Scheduled page; deleting the chat pauses the task. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 ('Pause/resume/delete'); docs/product/experience-contract.md W17). Run now, pause, resume, edit and delete (with a confirmation naming what is lost) on every app that shows schedules.

**With different models, providers and the one subscription.** Run now spends the same allowance as a scheduled run. Delete asks first (AGENTS.md section 9).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, Chrome done; VS Code run now and pause done; CLI lacks run now and edit; Mobile Run now done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.19, S63.24, S63.26, S63.27
- Comparison list ids: none matched; rows without an id: chrome: 'Manage schedules: pause, resume, run now, edit, delete, run history' (no id)
- Code: `apps/web/features/schedules/components/ScheduleCard.tsx:344`; `apps/web/app/api/schedules/[id]/route.ts:108`; `apps/cli/src/schedules.rs:306`

**Gap.** CLI cannot run now or edit. Duplicate task (S63.28) missing everywhere.

**Acceptance criteria**

1. Pause a task and confirm it does not fire; resume and it does.
2. Run now returns a result.
3. Delete shows a consequence-naming confirmation and the task stops.

**Verification: seen working by a person.** W-16 subscribed: create, run, reload and offline recovery on Web. Pause, edit, delete not stated.

## CAP-scheduled-tasks-08 Scheduled page with next run, last run and unread indicator

One list of tasks showing next run, last run, failures and which runs need attention.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork), Claude Code: yes**
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Scheduled tasks page lists local and cloud tasks; runs open from a Scheduled sidebar group. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop (Claude Code).
- **ChatGPT / Codex: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Scheduled view lists active, paused and completed tasks and recent runs, with an unread indicator for runs needing attention. Plans: eligible plans. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Scheduled destination in consumer shell)). A Scheduled destination on each app shows next run, last run and failure state, with an unread marker for runs needing attention.

**With different models, providers and the one subscription.** Free users see Upgrade only, no meters (owner decision).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Next-run and last-run done on all apps; unread indicator partial on Web and Mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.20, S63.21
- Comparison list ids: MP47, MP52, WP136
- Code: `apps/web/features/schedules/components/ScheduleCard.tsx:209`; `apps/web/features/schedules/components/RecentScheduleResults.tsx`; `apps/mobile/app/(app)/schedules/index.tsx:42`

**Gap.** Unread indicator partial. Credits differ between card and Recent results (0.2 vs 0.17, seen). A Free account sees a usage meter on the upgrade page, against the owner rule.

**Acceptance criteria**

1. After a run, the task shows last run time and credits matching the results list.
2. A run needing attention shows an unread marker until opened.
3. Free sees Upgrade and no meter.

**Verification: seen failing by a person.** 6-defects W-16: credits mismatch 0.2 vs 0.17; Free usage meter on /upgrade.

## CAP-scheduled-tasks-09 Run history and per-run results

Past runs with status and time, each opening the output or the session it produced.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Run history with Succeeded, Failed, Cancelled; each run opens as a full session to inspect, create a PR, continue or archive. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT / Codex: yes**
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Scheduled run history gained bulk mark-read and archive. Apps: desktop, ios.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W17 ('Results and failures enter run history')). Every run is recorded with status, time, cost and output, and its result can be opened. One occurrence creates at most one run.

**With different models, providers and the one subscription.** History records which model and provider ran it; cost is in subscription credits.

**Current implementation, as this trace read it on 2026-11-24: partly built.** History and results done on Web, Desktop, Mobile, CLI, VS Code; Chrome shows results but no history list. Bulk mark-read and archive not found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.22, S63.23
- Comparison list ids: WP136
- Code: `apps/web/features/schedules/components/ScheduleRunHistory.tsx:65`; `apps/mobile/src/features/schedules/components/ScheduleRunHistory.tsx:197`; `apps/cli/src/schedules.rs:448`

**Gap.** 'Open chat' on a result opens an empty chat with the prompt prefilled, not the answer (seen). Chrome has no history list.

**Acceptance criteria**

1. Open a completed run and see its output text.
2. 'Open chat' shows the run's answer.
3. Run history shows failed runs with a reason.

**Verification: seen failing by a person.** 6-defects W-16: 'Result panel Open chat opens a new empty chat'. The result panel text itself worked (W-16 subscribed).

## CAP-scheduled-tasks-10 Missed-run and skipped-run explanation

When an occurrence is missed or skipped the history says so and why.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): /schedule can explain why a run did nothing; history shows warning banners for last-run problems. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, web.
  - [https://code.claude.com/docs/en/scheduled-tasks.md](https://code.claude.com/docs/en/scheduled-tasks.md): Session tasks fire only while Claude is running and idle, with no catch-up for missed fires. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Skipped, missed, blocked-by-limit and approval-waiting occurrences appear in history with a plain reason.

**With different models, providers and the one subscription.** Reasons include plan limit reached and model unavailable.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile, CLI, VS Code done; Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.33
- Comparison list ids: none matched
- Code: `apps/web/features/schedules/components/ScheduleRunHistory.tsx:166`; `apps/web/lib/services/schedule-service.ts:1892`

**Gap.** Chrome missing; not run by a person.

**Acceptance criteria**

1. Pause across a due time and the history shows a skipped entry with a reason.
2. A run blocked by a plan cap says so.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-11 Cloud execution with the device off

Tasks run on the vendor's servers while the user's computer is closed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud tasks), Claude (Cowork remote): yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Cloud tasks run on Anthropic cloud when the laptop is closed; need a claude.ai account. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, cli, desktop.
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Cowork remote sessions run scheduled tasks with no device online; rolling out starting with Max. Plans: Max, others later. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Web scheduled tasks run in ChatGPT with connectors; desktop tasks on local projects need the computer on. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Cloud Work row: schedules, managed sandbox)). Cloud tasks run with every device off; the app states plainly that this is on AGI servers.

**With different models, providers and the one subscription.** Cloud only. Runs use subscription allowance. BYOK and Local chats are not routed here without a consented fork.

**Current implementation, as this trace read it on 2026-11-24: built.** Cron sweep every 15 minutes in the web backend; all apps create against it. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web: 'Scheduled tasks run in the cloud while your computer sleeps' (no id)
- Code: `apps/web/app/api/cron/run-schedules/route.ts:11`; `apps/mobile/src/features/schedules/policy.ts:17`

**Gap.** Sweep cadence means starts can be up to 15 minutes late; run duration limited to cron max of 60 s per request.

**Acceptance criteria**

1. Close every client, wait past due time, reopen: the run is recorded.
2. The form says runs use Cloud.

**Verification: seen working by a person.** W-16 subscribed: a one-time Cloud schedule ran after the view was closed, exactly one run in the server log.

## CAP-scheduled-tasks-12 Local-device scheduled tasks

Scheduled tasks that run on the user's own computer with local files, only while the app is open and awake.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (desktop): yes**
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Local tasks run on your machine while the app is open and awake, with local file access; prompt kept as SKILL.md on disk. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
  - [https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Choosing a folder turns on Require this computer; local tasks migrate to the cloud where Cowork in the cloud is on. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **Codex (desktop app): yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Desktop tasks run in the project directory or an isolated worktree; computer and app must stay on. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 ('Local scheduled task'); free local inference on desktop and mobile). A Local scheduled task is a stated concept; it runs on the device with local inference, needs no AGI server, and states that it runs only while the app is open.

**With different models, providers and the one subscription.** Free to run with local models; no sign-in needed for the run itself. Any use of Cloud or BYOK is a visible, consented switch.

**Current implementation, as this trace read it on 2026-11-24: not built.** All AGI schedule screens are named Cloud; the form says scheduled runs use Cloud. No local runner found for Desktop or Mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D148, DP54
- Code: `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx`; `apps/web/features/schedules/components/ScheduleForm.tsx:157`

**Gap.** The required Local scheduled task does not exist; Free plans show no scheduling at all (maxScheduledTasks 0).

**Acceptance criteria**

1. On Desktop with no sign-in, create a task that runs with a local model while the app is open.
2. No network call leaves the device for that run.
3. If the app is closed at due time, history says it was missed.

**Verification: not verified.** No person-run evidence.

## CAP-scheduled-tasks-13 In-session recurring prompt (loop) and session timers

Repeat a prompt on an interval inside an open terminal session, with create, list and delete tools.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/scheduled-tasks.md](https://code.claude.com/docs/en/scheduled-tasks.md): /loop repeats a prompt on an interval; CronCreate, CronList, CronDelete; recurring session tasks expire after 7 days; up to 50 per session. Apps: cli.
- **Codex: unknown**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): CLI and IDE have no Scheduled interface; use web or desktop to manage tasks. Apps: cli, ide.

**AGI requirement** (proposed; source: competitor parity, Claude Code only). The terminal agent can repeat a prompt in a session. Owner decision needed on whether to match this Claude Code-only feature.

**With different models, providers and the one subscription.** Works with any provider the CLI is set to; local models free.

**Current implementation, as this trace read it on 2026-11-24: not built.** CLI /loop and ScheduleWakeup missing; CronCreate/List/Delete partial; VS Code partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C135, C137, C270, CP66, VP30
- Code: `apps/cli/src/platform/runtime/tool_catalog.rs:263`

**Gap.** No /loop; session timers partial.

**Acceptance criteria**

1. /loop 5m <prompt> repeats and can be cancelled.
2. Tasks stop when the session ends or after the stated expiry.

**Verification: not verified.** No person-run evidence.

## CAP-scheduled-tasks-14 Event triggers (mail, chat, code host, webhook)

Start a task when something happens in a connected app instead of at a time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud tasks): partly**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): GitHub event trigger on pull request, release or issue with the Claude GitHub App; each event is its own session; hourly caps drop extra events. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Tasks run on new Gmail mail, Slack messages or GitHub PR activity; set Trigger, Condition, Prompt; up to 30 runs per hour and 720 per day. Plans: Plus, Pro, Business, Enterprise. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Event tasks cannot combine with a time schedule; related events may be batched. Plans: eligible plans. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Gmail, Slack, GitHub, calendar and signed webhook triggers start a task; runs are rate-limited and deduplicated.

**With different models, providers and the one subscription.** Each trigger run counts against subscription allowance; needs connector sign-in so not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, CLI done; Mobile has a triggers screen but ledger says missing; Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.15, S63.17
- Comparison list ids: WP121, WP123
- Code: `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:239`; `apps/web/lib/triggers/trigger-fire.ts:135`; `apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:46`

**Gap.** Mobile ledger and comparison files disagree; some event kinds partial.

**Acceptance criteria**

1. Create a webhook trigger; a signed POST starts exactly one run.
2. A repeat of the same event is suppressed.
3. An event over the hourly cap is dropped and shown in history.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-15 Trigger filters and conditions

Narrow an event trigger by sender, subject, field or operator.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): GitHub event trigger with per-task and per-account caps. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Gmail filter by sender or subject; Trigger, Condition and Prompt are set. Plans: Plus, Pro, Business, Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Triggers accept a condition so only matching events start a run.

**With different models, providers and the one subscription.** Filtering happens before any model call so unmatched events cost nothing.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, CLI done; Mobile and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.16
- Comparison list ids: none matched
- Code: `apps/web/features/schedules/components/TriggerConditionsEditor.tsx:168`; `apps/cli/src/features/hooks/hooks.rs:487`

**Gap.** Mobile and Chrome cannot set conditions.

**Acceptance criteria**

1. A non-matching event creates no run and no charge.
2. A matching event creates one run.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-16 Token-authenticated API trigger

A documented URL plus token that starts a task run from any script.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Each task gets a fire URL and one-time token; POST /fire starts a session; tokens can be regenerated or deleted. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity, Claude Code only). A task has an API trigger with a revocable token; the CLI may not create tokens (owner decision on CLI scope).

**With different models, providers and the one subscription.** Uses the same allowance and rate limits as other triggers.

**Current implementation, as this trace read it on 2026-11-24: built.** API only, per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.18
- Comparison list ids: none matched
- Code: `apps/web/public/openapi.json:4396`; `apps/web/app/api/schedules/[id]/runs/route.ts:69`

**Gap.** No UI for token management; owner declined routine webhook token creation in the CLI.

**Acceptance criteria**

1. POST with a valid token starts one run.
2. A revoked token returns an error and starts nothing.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-17 Several triggers on one task

One task combines schedule, API and event triggers.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): One task can combine schedule, API and GitHub triggers. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT / Codex: no**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Event-triggered tasks cannot combine with a time schedule. Plans: eligible plans. Apps: web.

**AGI requirement** (proposed; source: competitor parity, Claude Code only). Owner decision needed on combining schedule and event triggers (see unresolved choices).

**With different models, providers and the one subscription.** Each firing counts once against allowance.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: Add trigger and list present. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web: 'Several triggers on one scheduled task' (no id)
- Code: `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:397`

**Gap.** none known

**Acceptance criteria**

1. Add a schedule and a webhook trigger to one task; both start it.
2. Remove one and the other still works.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-18 Monitoring tasks that stop at an end condition

A task that watches for a change, notifies only when something changes, and stops when a condition or end date is met.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Monitoring tasks notify on changes, use prior runs and stop at an end condition. Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity, ChatGPT only). Tasks can be set to notify only on change and to end by date or condition.

**With different models, providers and the one subscription.** Each check counts against allowance, so a cheap model route should be offered by Auto.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has it; Mobile partial (templates only). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP50; rows without an id: web: 'Monitoring tasks that watch for a change and stop at an end condition' (no id)
- Code: `packages/contracts/cloud-contracts/src/schedules.ts:76`; `apps/mobile/src/features/schedules/templates.ts:24`

**Gap.** Mobile partial.

**Acceptance criteria**

1. Create a monitor; no notification arrives when nothing changed.
2. It stops after its end date.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-19 Task result notifications

Push or email when a task finishes, fails or needs the user.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Settings > Notifications selects Push, Email or both; mobile push needs a task created in the mobile app. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md (separate notification switch for scheduled tasks); docs/decisions/2026-09-27-founder-decisions.md (per-task settings not built)). Account-wide switch for scheduled-task notifications, push and email, delivered once.

**With different models, providers and the one subscription.** Independent of model. Notification content from a Local run stays on device unless the user opts in.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Mobile have a scheduled-tasks category; Mobile 'choose push, email or both' partial; a per-task Email/push control exists on the web form. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.30
- Comparison list ids: MP87; rows without an id: web: 'Task notifications by push or email' (no id)
- Code: `apps/mobile/src/features/settings/notifications/categories.ts:24`; `apps/web/features/schedules/components/ScheduleForm.tsx:705`

**Gap.** Mobile channel choice partial; per-task setting vs account-wide setting is inconsistent with owner decision.

**Acceptance criteria**

1. Turn the category off and no notification arrives.
2. A finished run notifies once with a link to the result.

**Verification: code inspected only.** W-16 turned both off; delivery not tested.

## CAP-scheduled-tasks-20 Approval pauses for unattended runs

A run that needs permission for a tool stops, asks the user, and resumes after approval or skips.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude (Cowork): yes**
  - [https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Tools set to Always ask may wait or be skipped. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web.
  - [https://code.claude.com/docs/en/headless.md](https://code.claude.com/docs/en/headless.md): --permission-prompts none denies anything that would prompt for unattended runs. Apps: cli.
- **Codex, ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Desktop runs unattended with default sandbox; approvals may pause event tasks. Apps: desktop.

**AGI requirement** (stated requirement; source: AGENTS.md section 6 and 9 (fail closed); docs/product/experience-contract.md W17). Unattended runs never exceed granted permissions; needing approval pauses the run and notifies the user.

**With different models, providers and the one subscription.** Same gate for every model and provider.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on Web, Desktop, Mobile, CLI, VS Code, Chrome (Chrome approve or deny in panel). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.32
- Comparison list ids: WP313; rows without an id: chrome: 'Approve or deny a paused scheduled step from the panel' (no id)
- Code: `apps/web/lib/services/scheduled-agent-executor.ts:548`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:151`

**Gap.** Always-allow tool rules in scheduled runs only partial (WP313); connection-expiry repair flow (S63.35) missing.

**Acceptance criteria**

1. A run needing a tool approval pauses and notifies.
2. Approving resumes it; denying ends it with a stated reason.
3. An expired connector is named on the task.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-21 Per-task model, sources, connectors and agent

Choose model, tools, sources, agent and permission mode for each task.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude (Cowork): yes**
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Create form takes instructions, folder, schedule, permission mode and model. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): A task is a saved prompt, repositories and connectors. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT, Codex: partly**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Web tasks use uploads, connectors, skills and plugins; cannot access a local folder between runs. Apps: web.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md (S63.10 effort not built)). Each task has its own model (by family slot, not a fixed ID), connectors and sources. Per-task effort is not built by owner decision.

**With different models, providers and the one subscription.** Model list limited to what Cloud schedules support; routing uses the model catalog.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop done for sources, connectors, agent; Mobile missing; repository selection missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.06, S63.07, S63.08, S63.09, S63.10
- Comparison list ids: W225, WP134
- Code: `apps/web/features/schedules/components/ScheduleAccessFields.tsx:48`; `apps/web/lib/services/scheduled-agent-executor.ts:307`

**Gap.** Repository selection missing; Mobile cannot choose sources, connectors or agent; Cloud runs return text only, without research or media.

**Acceptance criteria**

1. Pick a model and connector on Web and see the run use them.
2. A connector not chosen is not used.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-22 Plan limits and run caps

Limits on active tasks, run frequency and event runs per plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): 100 scheduled runs per hour per account; Run now and API fires 30 per hour per task; draws subscription usage, overage via credits. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Active tasks capped at 3 Free/Go, 5 Plus, 10 Business/Edu, 15 Pro/Enterprise; background usage counts against the plan. Plans: Free through Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: AGENTS.md section 8 (rate limits are configuration); docs/decisions/2026-11-13-founder-decisions.md). Caps and minimum intervals are read from the subscription catalog and shown as Upgrade only to Free users; completed runs count against the one allowance.

**With different models, providers and the one subscription.** One AGI Subscription ledger for all apps.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Catalog sets maxScheduledTasks per plan (Free 0); Mobile cap missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M10, MP51, WP119, WP28
- Code: `packages/contracts/types/src/billing-catalog.ts:593`; `apps/web/db/neon/0301_routine_credit_cap.sql`

**Gap.** Mobile does not show or enforce the cap; Free's Basic card does not list scheduled tasks.

**Acceptance criteria**

1. Create tasks until the cap; the next attempt names the limit.
2. Free sees Upgrade and no meter.
3. A run subtracts credits from the same balance on every app.

**Verification: seen working by a person.** W-16 free: the page says tasks need Basic and has no create control (cosmetic defect about the card).

## CAP-scheduled-tasks-23 Budget caps and deferred runs after allowance reset

Cap what a task may spend, and hold a blocked run until the allowance resets.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/workflows.md](https://code.claude.com/docs/en/workflows.md): A workflow pauses at a usage limit and auto-continues after reset on a subscription. Plans: All paid. Apps: cli, desktop, ide.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity, partial). Per-task spend cap, and a held run when the allowance is out. Owner decision needed on deferred runs (neither leader documents it for scheduled tasks).

**With different models, providers and the one subscription.** Uses the one subscription ledger.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Budget controls done on Web and Desktop; deferred execution missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.31, S63.34
- Comparison list ids: none matched
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:629`; `apps/web/lib/services/schedule-service.ts:1301`

**Gap.** No deferred execution; Mobile and CLI no budget control.

**Acceptance criteria**

1. A task over its cap stops and says why.
2. A run blocked by the allowance runs after reset, or reports skipped.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-24 Share a task by link

Share a snapshot of a task's prompt and schedule so the recipient creates their own copy.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Task shared as title, instructions, schedule and time zone, with no chat history, memories or files; recipient schedules their own copy. Plans: Free through Enterprise. Apps: web.

**AGI requirement** (proposed; source: competitor parity, ChatGPT only). Owner decision needed on matching this ChatGPT-only feature; if built, the link carries no chats, memory or files.

**With different models, providers and the one subscription.** Recipient's copy uses their own plan and model access.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop done; Mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.29
- Comparison list ids: M204, M75
- Code: `apps/web/app/api/schedules/[id]/share/route.ts:40`; `apps/web/lib/services/schedule-share-service.ts:52`

**Gap.** Mobile cannot share.

**Acceptance criteria**

1. Open a shared link signed in and schedule an independent copy.
2. Deleting the link leaves existing copies.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-25 Team and workspace tasks with admin controls

Shared recurring tasks run by a workspace, with admin switches for scheduled and event-triggered tasks.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Owners can turn tasks off org-wide; tasks are per-account and not shared. Plans: Team, Enterprise. Apps: web.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Team Tasks run in cloud via the team service account; event triggers controlled by an admin permission. Plans: Business, Enterprise. Apps: web.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Shared recurring tasks with approved company tools; admins configure connections. Plans: Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Admins can switch scheduled and event tasks on or off by role. Shared team tasks are an owner choice.

**With different models, providers and the one subscription.** Admin policy applies on every app.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Admin switches done on Web; team tasks via service account marked Same in one row and Missing in another. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W171, WP346; rows without an id: web: 'Admin switches for scheduled tasks and event-triggered tasks, by role' (no id)
- Code: `packages/contracts/types/src/enterprise/workspace-controls.ts:48`; apps/web/app/api/custom-agents/schedules (not found) (not found)

**Gap.** Rows disagree on team tasks; desktop lacks admin switch for local scheduled tasks (D148).

**Acceptance criteria**

1. Admin turns scheduled tasks off and members cannot create or run them.
2. Event triggers need their own switch, default off for managed workspaces.

**Verification: code inspected only.** No person-run row.

## CAP-scheduled-tasks-26 Scheduled runs that publish an artifact

A task run can create and publish an artifact as its output.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud tasks): yes**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): In auto mode a run can publish an artifact, private until shared. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity, Claude Code only). Owner decision needed (Claude Code only).

**With different models, providers and the one subscription.** Cloud runs return text only today.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W168
- Code: `apps/web/lib/services/scheduled-agent-executor.ts`

**Gap.** Runs return text only.

**Acceptance criteria**

1. A run makes an artifact that is private until shared.

**Verification: not verified.** None.

## CAP-scheduled-tasks-27 Isolated worktree or repository for scheduled coding runs

A scheduled run gets its own git worktree or repo checkout.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): Worktree option gives each run its own git worktree. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/automations.md](https://learn.chatgpt.com/docs/automations.md): Run in the project directory or an isolated worktree; frequent runs accumulate worktrees. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 ('Worktree/session isolation when editing files')). Scheduled runs that edit files use worktree or session isolation.

**With different models, providers and the one subscription.** Local files stay local; model-independent.

**Current implementation, as this trace read it on 2026-11-24: not built.** Repository selection missing on all apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.07
- Comparison list ids: DP54
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:157`

**Gap.** No worktree or repo choice on any app.

**Acceptance criteria**

1. A coding task runs in its own worktree and leaves the working tree untouched.

**Verification: not verified.** None.

## CAP-scheduled-tasks-28 Run in CI on a schedule

Cron-triggered automation inside a code host's CI.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/github-actions.md](https://code.claude.com/docs/en/github-actions.md): Cron-triggered automation such as a daily report with granted tools; schedules run from the default branch. Apps: cli.
- **Codex: unknown**
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Codex access tokens for Enterprise let admins create tokens for scripts, schedulers and CI runners. Plans: Enterprise. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Owner decision needed.

**With different models, providers and the one subscription.** Any provider by key.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on Web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W164
- Code: none cited

**Gap.** No CI integration found.

**Acceptance criteria**

1. A scheduled CI job runs the CLI headless and exits with a status.

**Verification: not verified.** None.

## CAP-scheduled-tasks-29 Always-on proactive agent (dots)

An assistant that keeps working between chats, tracks several tasks, and decides when to notify.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (dots, rolling out, Pro U.S. beta in places): yes**
  - [https://learn.chatgpt.com/docs/dots/tasks-and-memory.md](https://learn.chatgpt.com/docs/dots/tasks-and-memory.md): A dot tracks several tasks, keeps recurring work in a Scheduled view, and can edit Work automations after confirmation. Apps: desktop, web, ios, android.
  - [https://learn.chatgpt.com/docs/dots/controls.md](https://learn.chatgpt.com/docs/dots/controls.md): Pause halts the main task; delegated tasks are stopped in Activity and recurring ones in Scheduled. Apps: desktop, web, ios, android.

**AGI requirement** (proposed; source: competitor parity, ChatGPT only, rolling out). Owner decision needed.

**With different models, providers and the one subscription.** Background activity counts against allowance; not for Local.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W139, W154, W155
- Code: none cited

**Gap.** No proactive agent.

**Acceptance criteria**

1. Stopping a running task does not cancel its schedule.

**Verification: not verified.** None.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match ChatGPT-only features: share task by link on Mobile, monitoring on Mobile, schedule inside an existing chat, always-on dots.
- Whether to match Claude Code-only features: /loop, combined schedule plus event triggers, scheduled artifact publishing, token-managed API trigger UI, CI scheduling.
- Whether Local scheduled tasks use the device only while the app is open, or also a background service.
- Whether a run blocked by the usage allowance is held and run after reset or skipped.
- Whether team shared tasks are in scope for the first release.
- Whether per-task notification settings stay web-only or become account-wide as the owner decision says.

## Could not establish

- Whether Claude (chat) supports scheduled tasks outside Cowork: the catalogue only shows Cowork and Claude Code, so claude.has is partly unknown for several rows.
- Exact current wording of Claude's notification behaviour for scheduled tasks: the catalogue has no line; the owner decision file says it is account-wide.
- Whether any AGI schedule beyond a one-time Cloud run on Web has been run by a person; only W-16 is a person-run row, and only for Web.
- Whether Mobile triggers screen is complete: the ledger says missing while the comparison says Same.
- Whether Desktop has a local runner: schedule screens are named Cloud and no local runner was found; code-only reading.
- I did not open the saved pages; I relied on catalogue lines and the comparison files.
- I did not check apps/desktop Electron main-process code for scheduled jobs beyond a text search.
