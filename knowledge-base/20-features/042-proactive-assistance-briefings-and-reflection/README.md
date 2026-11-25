---
id: "AREA-042"
type: "area"
title: "Proactive assistance, briefings, and reflection"
features: ["F042-01", "F042-02", "F042-03", "F042-04", "F042-05", "F042-06", "F042-07", "F042-08", "F042-09", "F042-10", "F042-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 42. Proactive assistance, briefings, and reflection

A briefing is a scheduled agent task, usually a daily "Daily briefing" that runs on weekday mornings and sends its result to the person. Scheduled runs are the one part that is built end to end: a person creates a schedule, the server runs it when it is due, and a completion notice goes out by push or email. Reflection is a separate, on-demand summary of how the person used the product over a past period, and Time and focus holds quiet hours and break reminders. Most of the brief's items (topics, sources, briefing home, cards, calendar and email summaries, listen mode, helpful ratings, important-change alerts, the "caught up" end state) are not built anywhere in the code I read.

**Who uses it.** Every signed-in person who has a schedule, for the Daily briefing and other scheduled tasks. The daily brief on mobile is shown only when the schedules feature flag is on and the plan's scheduled-task limit is not zero (apps/mobile/src/features/settings/notifications/dailyBrief.ts:56-58); the per-plan numbers are not shown here. Reflect needs the Memory setting turned on (apps/web/app/api/reflect/route.ts:33-42). Time and focus is a personal setting. Workspace admins do not get a view in this area; the server only logs when a workspace member's scheduled work cannot run (apps/web/lib/services/schedule-service.ts:1317-1339). Developers use the CLI schedule commands, which need a managed (Cloud) session (apps/cli/src/schedules.rs:233-234).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F042-01](F042-01-set-up-a-daily-briefing.md) | Set up a daily briefing | built | built | built | built | n/a | built |
| [F042-02](F042-02-choose-briefing-topics-and-sources.md) | Choose briefing topics and sources | partly | partly | no | no | no | no |
| [F042-03](F042-03-briefing-home-and-content.md) | Briefing home and content | no | no | no | no | no | no |
| [F042-04](F042-04-ask-listen-to-and-rate-a-briefing.md) | Ask, listen to and rate a briefing | no | no | no | no | no | no |
| [F042-05](F042-05-pause-and-resume-schedules.md) | Pause and resume schedules | built | built | built | built | built | built |
| [F042-06](F042-06-quiet-hours.md) | Quiet hours | built | built | built | no | no | no |
| [F042-07](F042-07-work-completion-notices.md) | Work-completion notices | built | built | built | built | no | built |
| [F042-08](F042-08-important-change-alerts.md) | Important-change alerts | no | no | no | no | no | no |
| [F042-09](F042-09-reflection-and-annual-recap.md) | Reflection and annual recap | built | built | built | no | no | no |
| [F042-10](F042-10-break-reminders-and-time-and-focus-settings.md) | Break reminders and Time and focus settings | built | built | built | no | no | no |
| [F042-11](F042-11-briefing-history.md) | Briefing history | built | built | built | n/a | n/a | built |

Requirement items for this area: [10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md).

## How this area works in the code

1. **Person creates a schedule.** A person picks the Daily briefing template (or the mobile Daily brief switch). The template is a fixed prompt plus weekday timing and default sources. The mobile app sends the schedule to the schedules API. (`packages/contracts/cloud-contracts/src/schedules.ts:843-856`, `apps/mobile/src/features/settings/notifications/dailyBrief.ts:34, 56-58`, `apps/mobile/src/features/schedules/templates.ts:29-46`, `apps/mobile/src/features/schedules/service.ts:146-155`)
2. **Schedule is saved.** The saved schedule is a row in the scheduled tasks table, owned by the person. CLI updates use the same API with a managed session. (`apps/cli/src/schedules.rs:230-245`, `apps/cli/src/schedules.rs:302-314`, `apps/web/lib/services/schedule-service.ts:1307-1311`)
3. **Due runs are claimed.** The server claims due schedules in batches. Schedules whose owner is no longer an active workspace member are left unclaimed and logged. (`apps/web/lib/services/schedule-service.ts:1317-1339`, `apps/web/lib/services/schedule-service.ts:1341-1345`)
4. **Run is executed on the server.** The executor picks a model route. It refuses the run when no model on the plan keeps chats out of training, and it checks whether the task reads Google user data. (`apps/web/lib/services/scheduled-agent-executor.ts:718-729`, `apps/web/lib/services/scheduled-agent-executor.ts:741-761`, `apps/web/lib/services/scheduled-agent-executor.ts:767-770`)
5. **Completion notice is built.** When a run finishes, a job is queued. The job reads the person's notice settings and the schedule's notice settings, and sends push and email only where allowed. Email is held if quiet hours apply. (`apps/web/lib/jobs/job-handlers.ts:98-127`, `apps/web/lib/services/schedule-notification-service.ts:40-80`, `apps/web/lib/services/schedule-notification-service.ts:105-111`, `apps/web/lib/jobs/job-handlers.ts:350`)
6. **Quiet hours and push delivery.** Quiet hours are read from the person's saved settings. Each push device is kept or dropped. Accepted devices get a request to the push service, and tokens that the service rejects are cleared. (`apps/web/lib/services/quiet-hours-service.ts:41-64`, `apps/web/lib/services/quiet-hours-service.ts:66-86`, `apps/web/lib/services/push-notification-service.ts:92-110`, `apps/web/lib/services/push-notification-service.ts:125-132`, `apps/web/lib/services/push-notification-service.ts:176-215`)
7. **Result appears in history.** The client loads recent runs through the runs endpoint and shows status, timing notes and errors. (`apps/web/app/api/schedules/runs/route.ts:30-40`, `apps/mobile/src/features/schedules/service.ts:140-143`)
8. **Reflection path.** The Reflect page asks the server for a recap for the chosen range and timezone. The server checks Memory, reads the period's conversations, and returns the recap without caching. (`apps/web/features/settings/sections/ReflectSection.tsx:69-76`, `apps/web/app/api/reflect/route.ts:21-47`, `apps/web/lib/services/reflect-service.ts:277-300`, `apps/mobile/src/features/reflect/service.ts:39-50`)

## Files to know

| File | Role |
|---|---|
| `packages/contracts/cloud-contracts/src/schedules.ts` | Shared schedule contract: the Daily briefing template (843-856), default sources, and the run-timing note helper (740-760). |
| `apps/web/lib/services/scheduled-agent-executor.ts` | Runs due schedules on the server: model route choice, the training-policy refusal, and the Google user-data check. |
| `apps/web/lib/services/schedule-service.ts` | Scheduled-task rows: delete rule, claiming due runs, and the log for work left by people who left the workspace. |
| `apps/web/lib/jobs/job-handlers.ts` | Completion notice job: reads notice settings, queues email (held for quiet hours), and sends push. |
| `apps/web/lib/services/schedule-notification-service.ts` | Reads a person's and a schedule's notice settings; decides push and email per status. |
| `apps/web/lib/services/push-notification-service.ts` | Filters push devices by preferences and quiet hours, then sends to the push service and clears rejected tokens. |
| `apps/web/lib/services/quiet-hours-service.ts` | Reads quiet hours from the person's settings and returns when they end. |
| `apps/mobile/src/features/settings/notifications/dailyBrief.ts` | Mobile Daily brief: availability by plan and feature flag, create, pause, and time change. |
| `apps/web/lib/services/reflect-service.ts` | Builds the Reflect recap for a range, after checking Memory. |
| `apps/web/features/time-focus/TimeFocusReminder.tsx` | Web break reminders and quiet-hours nudge, driven by local active time. |
| `apps/web/features/settings/sections/TimeFocusSection.tsx` | Web Time and focus settings page: break length, quiet hours, validation and save. |

## What is stored

- Scheduled tasks (prompt, timing, sources, enabled flag, status, expiry, next run time): Database table public.scheduled_tasks (apps/web/lib/services/schedule-service.ts:1308, 1319-1323)
- Schedule notice settings (on success, on approval, on failure, push, email) and the person's notification preferences: Database table public.user_settings, columns schedule_notifications and notifications; also profiles and email (apps/web/lib/services/schedule-notification-service.ts:40-54)
- Time and focus preferences (quiet hours, break reminder length): public.user_settings.settings under the time-focus namespace (apps/web/lib/services/quiet-hours-service.ts:47-53)
- Daily active time for break reminders, per person and per day: Browser localStorage on web (apps/web/features/time-focus/TimeFocusReminder.tsx:186-191); device storage on mobile (apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx)
- Once-per-session quiet-hours nudge dismissal: Browser sessionStorage on web (TimeFocusReminder.tsx:162)
- Schedule draft handed from chat to the Chrome side panel: chrome.storage.session (apps/extension/src/features/side-panel/schedulesSection.ts:395-398)
- Push device tokens (cleared when the push service rejects them): Database table public.mobile_devices, column push_token (apps/web/lib/services/push-notification-service.ts:135-140)
- Reflect recap: Not stored; computed on request and sent with no-store caching (apps/web/app/api/reflect/route.ts:45-47)
- Mobile Daily brief schedule id: Preference key dailyBriefScheduleId (apps/mobile/src/features/settings/notifications/dailyBrief.ts:25); the storage place was not traced

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Schedules feature flag**: Turns schedules and the mobile Daily brief on or off (apps/mobile/lib/v1FeatureFlags.ts:14 (read in apps/mobile/src/features/settings/notifications/dailyBrief.ts:57))
- **Plan scheduled-task limit**: Zero hides the Daily brief; other values cap how many scheduled tasks a plan can hold (packages/contracts/types/src/billing-catalog.ts:816 (read in dailyBrief.ts:57))
- **Quiet hours on or off, days, start and end times, timezone**: Holds email and drops push during the quiet window; exempt notice types are not affected (apps/web/lib/services/quiet-hours-service.ts:22-29, 58-63; apps/web/lib/services/push-notification-service.ts:105)
- **Break reminder length**: Sets the active minutes before a break reminder; null turns it off (packages/contracts/types/src/time-focus.ts:222, 240-243; apps/web/features/time-focus/TimeFocusReminder.tsx:171-172)
- **Schedule notice settings (success, approval, failure, push, email)**: Decides which statuses send a notice and by which channel (apps/web/lib/services/schedule-notification-service.ts:65-77)
- **Per-channel preference keys for schedule push and email**: Turns schedule push or email off for a person (apps/web/lib/services/schedule-notification-service.ts:76-77)
- **Memory setting**: Reflect returns 409 memory_required when off (apps/web/lib/services/reflect-service.ts:291; apps/web/app/api/reflect/route.ts:33-42)
- **AGIWORKFORCE_API_BASE environment variable**: Sets the API base the CLI schedule commands call (apps/cli/src/schedules.rs:236-239)
- **Rate limits**: Limits Reflect and the runs list per person (apps/web/app/api/reflect/route.ts:22 ('settings-activity'); apps/web/app/api/schedules/runs/route.ts:32 ('chat-conversation'))

## Shared between apps

Shared across apps: the schedule contract, templates and run-timing helper in packages/contracts/cloud-contracts (used by web, mobile and the Chrome extension client at apps/extension/src/features/cloud-bridge/schedulesClient.ts:114-130); the time-focus types and quiet-hours logic in packages/contracts/types (time-focus.ts, billing-catalog.ts). Server logic in apps/web/lib (executor, notifications, push, quiet hours, reflect) is shared by all clients that call the web API. Separate per app: web UI (apps/web/features/schedules, settings/sections, time-focus), mobile store and screens (apps/mobile/src/features/schedules, features/reflect, features/settings/notifications), the Chrome side-panel form (apps/extension/src/features/side-panel/schedulesSection.ts), the desktop cloud views (apps/desktop/src/features/schedules, settings/cloud), the VS Code schedule actions, and the CLI Rust code (apps/cli/src/schedules.rs).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites schedules.ts:722 for Daily briefing setup. That line is in the run-timing note helper; the Daily briefing template is at line 843. (packages/contracts/cloud-contracts/src/schedules.ts:721-760 and 843-856)
- Brief cites push-notification-service.ts:190 for quiet hours. That line is the push request body. The quiet-hours gate is at lines 98-110 and the device filter at 125-132. (apps/web/lib/services/push-notification-service.ts:98-110, 125-132, 190)
- Brief marks Chrome follow-up questions on a briefing (S42.10) as done and cites background.ts:1288 and :1951. Those lines are desktop pairing and run cancellation code. No follow-up question code was found in the lines opened. (apps/extension/src/background.ts:1280-1300, 1941-1965)
- Brief says quiet hours hold proactive notices. For push, the device is dropped from the send list during quiet hours and no re-queue was seen; only email is held (queued to run after quiet hours end). (apps/web/lib/services/push-notification-service.ts:125-132; apps/web/lib/jobs/job-handlers.ts:111-127)
- The Monitor a topic template ships with a literal placeholder in its prompt. Nothing in the template forces the person to replace it before saving. (packages/contracts/cloud-contracts/src/schedules.ts:865)

## Not established

- Whether the web, desktop and mobile schedule forms let the person pick sources (S42.03). The source-picker UI was not opened; the brief says missing.
- How the executor builds the briefing text from the connected calendar, email and recent chats. Only the first 220 lines of selectScheduledRoute and the Google check were read.
- Which route the executor picks for a Daily briefing on each plan, and what the per-plan scheduled-task counts are (billing-catalog.ts:816 read only by name).
- The web reflect hook (apps/web/features/settings/hooks/use-reflect-recap) and the reflect recap builder beyond line 300 were not read, so what counts as a 'topic' in Reflect is unknown.
- Where the mobile Daily brief schedule id is stored on the device (dailyBrief.ts:25 defines the key only).
- Whether a skipped push is retried later; the code read shows no retry path.
- The CLI, VS Code and desktop schedule code was not read in depth; their statuses come from the brief.
- Whether the 'Important-change alerts', 'listen' and 'helpful' items have any code under other names; a name search in the schedule, reflect and extension folders found none, and a wider search was not run.
- No tests were run and no localhost checks were made, because this task was read-only and forbade builds, tests and servers.
