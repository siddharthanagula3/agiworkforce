---
id: "F042-01"
type: "feature"
title: "Set up a daily briefing"
aliases: ["Daily briefing (schedule template id daily-briefing)", "Daily brief (mobile Notifications switch)", "Morning brief", "Delivery time and timezone (S42.04)", "S42.01", "S42.04"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S42.01", "S42.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-model-catalog-and-routing", "SYS-api-and-contracts", "table:scheduled_tasks", "table:scheduled_task_runs", "api:POST /api/schedules", "F042-06", "F042-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-01 Set up a daily briefing

A recurring scheduled agent run that writes a short start-of-day brief. Web, desktop and Chrome seed it from the Daily briefing template (weekdays 08:00). Mobile has a Daily brief switch in Notifications that creates a daily schedule. The CLI only creates cron schedules. A server sweep runs it; a notice announces the run.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.01](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4201), [S42.04](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4204).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a schedule whose prompt asks the agent to brief the person on calendar, email, recent chats, saved memory and web news, in under 250 words (packages/contracts/cloud-contracts/src/schedules.ts:843). The server runs it at the chosen time and timezone and stores the run result. The person is told through a notice and reads the text in run history.

**Why it exists.** The brief lists 'the user sets up a recurring daily briefing that is generated and delivered to them' as item S42.01 and delivery time and timezone as S42.04 (doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md). Proactive start-of-day help is a way to compete with Claude and ChatGPT scheduled tasks.

**Who uses it.** Signed-in Cloud users on a plan that allows scheduled tasks (billing-catalog.ts:593-723). Local and own-key users cannot (see access_and_usage).

**Problems it solves**

- The person does not have to open the app and ask each morning for a plan of the day.
- One prompt covers several sources, so the person does not check each one.
- Time and timezone mean the brief arrives at local morning, not server time.

**Use cases**

- A manager turns on Daily brief on the phone and gets a notice at 08:00 each day.
- A web user picks the Daily briefing template, moves it to 07:00 and saves.
- A developer runs 'agi schedules create' with a cron expression and a briefing prompt.

## 2. User experience

**Where to find it**

- Web: Schedules page at /chat/schedules (apps/web/app/chat/schedules/page.tsx), 'Start from a template' grid, card 'Daily briefing', cadence label 'Weekdays at 8:00 AM' (SchedulesPage.tsx:1049, schedules.ts:843-856).
- Desktop (Tauri build): Schedules screen, 'Start from a template' (apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1036). The public Electron Desktop shows the hosted web app (doc: AGENTS.md section 5), so the web screen applies there.
- Mobile: Settings > Notifications, switch 'Daily brief' with text 'A short morning summary of your calendar, email and recent chats.' and a 'Time' row (apps/mobile/src/features/settings/notifications/index.tsx:558, dailyBrief.ts). The Schedules list also has a 'Use Daily briefing template' card (apps/mobile/app/(app)/schedules/index.tsx).
- Chrome extension: side panel 'Schedules' section, 'Start from a template' row (schedulesSection.ts:671-693).
- CLI: 'agi schedules create --name --schedule --prompt [--timezone]' (apps/cli/src/lib.rs:1516).
- VS Code: cannot create schedules; not applicable.

**Before you start**

- Signed in to AGI Cloud (mobile, CLI and VS Code refuse otherwise).
- A plan whose scheduled-task limit is above zero (billing-catalog.ts:816, schedule-service.ts:877).
- For calendar and email lines in the brief, a connected calendar or mail connector; connectors are currently 'coming soon' (connector-release.ts:14).

**Screens and controls**

- Web form fields: Schedule Name, Task Instructions, Model, Frequency, Local Time, Time Zone, Active After Save, notification toggles (ScheduleForm.tsx:293-801).
- Web 'What Each Run Can Use': source checkboxes and connector list (ScheduleAccessFields.tsx:93).
- Mobile: Daily brief switch, Time row opening 'Daily Brief Time' picker with quick times 07:00, 08:00, 09:00 (index.tsx:138-142).
- Chrome: name, prompt, repeat (Every day etc.), days, Time, Time zone fields (schedulesSection.ts:487-664).
- CLI flags: --name, --schedule, --prompt, --timezone, --model, --description, --paused, --json.

**Journey**

1. Web/desktop/Chrome: open Schedules and choose the Daily briefing template; the form opens filled in and no schedule exists yet (SchedulesPage.tsx:443-445).
2. Check or change the time and the time zone, and the source checkboxes on web and desktop.
3. Save. The server checks the plan limit and stores the schedule.
4. Mobile: switch Daily brief on in Cloud mode; the app creates 'Daily brief' at 08:00 in the phone timezone, or changes time through the Time row (useCloudReminders.ts:266, dailyBrief.ts:179).
5. CLI: run create with a 5-field cron expression; timezone defaults to the machine zone (schedules.rs:67).
6. At the due time the server runs the prompt; the person gets a notice and opens the schedule's run history to read the brief.

**What the person sees and gets**

- Web card shows Timing, Time Zone, Next Run, Last Run, Runs and Credits (ScheduleCard.tsx:200-300).
- Mobile: footnote 'Each brief counts toward your usage limits.' (index.tsx:161); failure text 'Could not set up the daily brief.' (dailyBrief.ts:30); 'Could not change the daily brief time.'
- Notice 'Scheduled task finished' with body of the form '<name> completed.' (schedule-notification-service.ts:130). The notice does not carry the brief text.
- Run text is read from run history (web, mobile, Chrome, CLI 'agi schedules runs').

**Settings**

- Per-schedule notification toggles (success, failure, approval, push, email) (schedules.ts:114).
- Account setting 'Mobile push' and schedule email preference keys (schedule-notification-service.ts:10).
- Quiet hours (F042-06) affect only success push and email.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Template with fixed prompt, weekdays, 08:00, sources with recentChats on (schedules.ts:843-856).
- Web, desktop and Chrome seed their create form from the shared template list (schedule-templates.ts, DesktopCloudSchedules.tsx:614-617, schedulesSection.ts:671).
- Mobile Daily brief: create, change time, turn off, detect brief living in another workspace (dailyBrief.ts:109-220; useCloudReminders.ts:266-310).
- Server create route checks the plan limit (route.ts:108, schedule-service.ts:877).
- Cron sweep runs due schedules every 15 minutes (vercel.json:50, run-schedules/route.ts:22).
- Executor honours sources.project, sources.memory, sources.web, sources.recentChats (scheduled-agent-executor.ts:926-1004).
- CLI creates cron schedules with an IANA timezone (schedules.rs:89-113).

**Incomplete**

- Mobile template cards drop the template's sources (templates.ts:37-49), so a schedule made from the mobile Daily briefing card uses the server default (scheduled-agent-executor.ts:926) with recent chats off [inferred].
- Mobile Daily brief is recurrence 'daily' (dailyBrief.ts:77), so it also runs on weekends, unlike the weekday template.
- Notice body names the schedule only; the brief text is not in the push or email (schedule-notification-service.ts:130).
- Calendar and email lines rely on connectors that are 'coming soon'; the prompt tells the agent to say so in one line (schedules.ts:843).

**Present but disconnected or switched off**

- Connector choices on web show 'Connectors for scheduled runs are coming soon.' (ScheduleAccessFields.tsx:136) because CONNECTOR_RELEASE_STATE is 'coming_soon' (connector-release.ts:14).

**Not available**

- VS Code: no schedule creation (doc: docs/decisions/2026-09-27-founder-decisions.md, VS Code extras).
- CLI: no briefing template by decision (doc: docs/decisions/2026-09-27-founder-decisions.md, line 462 and cell S42.01 at line 471); the CLI creates cron schedules only.
- Mobile Local mode and signed-out: switch opens the Cloud gate (apps/mobile/__tests__/NotificationReminders.test.tsx:217).

## 4. Required behaviour

**Established requirements**

- The user sets up a recurring daily briefing that is generated and delivered to them (S42.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.01)
- The user sets the delivery time and timezone of the briefing (S42.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.04)
- The CLI does not add a briefing template; it follows the leaders' terminals. (source: doc: docs/decisions/2026-09-27-founder-decisions.md)
- The plan's scheduled-task limit applies to scheduling. (source: packages/contracts/types/src/billing-catalog.ts:816)

**Acceptance criteria**

1. On web, the Daily briefing template opens the form with weekdays, 08:00 and the fixed prompt, and creates nothing until Save.
2. After Save, the card shows the chosen Time Zone and a Next Run in that zone.
3. On a plan with limit 0, create is refused with a message naming the plan.
4. On mobile in Cloud mode, switching Daily brief on creates one schedule at 08:00 and the Time row shows 08:00.
5. At the due time a run appears in run history with the brief text and a notice is recorded.
6. On mobile in Local mode, the switch leads to the Cloud gate and no schedule request is sent.
7. CLI create with --timezone stores that zone and 'agi schedules list' shows it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A brief that covers connectors should say which sources it could not read [inferred from the prompt text at schedules.ts:843].
- Run time can lag up to the 15-minute sweep interval [inferred from vercel.json:50].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put the first lines of the brief in the push and email body.
- [proposed] Make the mobile Daily brief use the template's weekday cadence and sources, or say why it is daily.
- [proposed] Offer a one-tap Daily briefing on web, not only a template.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | MANAGED_CLOUD_SCHEDULE_TEMPLATES (daily-briefing) | `packages/contracts/cloud-contracts/src/schedules.ts` | Template id, name, fixed prompt, weekdays, 08:00, sources (lines 843-856). |
| schema | ManagedCloudScheduleSourcesSchema and defaults | `packages/contracts/cloud-contracts/src/schedules.ts` | project, memory, web, recentChats flags (lines 93-106). |
| screen | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Template grid and create-from-template (lines 443, 1049). |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Local Time, Time Zone, source fields (lines 387, 510, 731). |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Tauri build schedules screen with templates (lines 614-617, 1036). |
| service | dailyBrief.ts | `apps/mobile/src/features/settings/notifications/dailyBrief.ts` | Create, resume, pause and locate the mobile Daily brief schedule. |
| hook | useCloudReminders | `apps/mobile/src/features/settings/notifications/useCloudReminders.ts` | State, optimistic writes and error text for Daily brief. |
| screen | Notifications settings | `apps/mobile/src/features/settings/notifications/index.tsx` | Daily brief switch, Time row, picker, footnotes (lines 138-161, 558-620). |
| service | mobile schedule templates | `apps/mobile/src/features/schedules/templates.ts` | Maps shared templates to mobile drafts, dropping sources. |
| service | mobile schedules service | `apps/mobile/src/features/schedules/service.ts` | Create, update, delete, toggle against /api/schedules. |
| component | schedulesSection | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome side-panel form, templates and time zone. |
| service | schedulesClient | `apps/extension/src/features/cloud-bridge/schedulesClient.ts` | Chrome calls to the schedules API. |
| command | agi schedules create | `apps/cli/src/lib.rs` | Create subcommand and handler (lines 1516, 4384). |
| service | cron_create_request | `apps/cli/src/schedules.rs` | Builds the 'custom' cron body; local_timezone default (lines 67, 89). |
| endpoint | POST /api/schedules | `apps/web/app/api/schedules/route.ts` | Auth, rate limit, CSRF, plan quota, create. |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | Quota, storage, due-run claim, run finalise, announce. |
| job | run-schedules cron | `apps/web/app/api/cron/run-schedules/route.ts` | Sweeps due schedules in waves. |
| config | cron entry | `vercel.json` | Runs the sweep every 15 minutes (line 50). |
| service | scheduled-agent-executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Route choice, context sources, tool plan, model call (lines 926-1004). |
| service | schedule-notification-service | `apps/web/lib/services/schedule-notification-service.ts` | Completion notice text, push and email. |
| table | scheduled_tasks | `apps/web/lib/services/schedule-service.ts` | One row per schedule (insert at line 1009). |
| table | scheduled_task_runs | `apps/web/lib/services/schedule-service.ts` | One row per run, with result text. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens a template; the form is filled in on the device and nothing is saved until Save. | device | apps/web/features/schedules/components/SchedulesPage.tsx:443-445 |
| Save sends POST /api/schedules; the server checks login, rate limit, CSRF and the plan's scheduled-task limit, then stores the schedule. | our servers | apps/web/app/api/schedules/route.ts:96-127; apps/web/lib/services/schedule-service.ts:877-903 |
| Mobile Daily brief creates the schedule through the same API and saves its id in the account notification preferences under 'dailyBriefScheduleId'. | device and our servers | apps/mobile/src/features/settings/notifications/dailyBrief.ts:25,150-165; useCloudReminders.ts:254-264 |
| Every 15 minutes the cron endpoint claims due schedules and runs up to ten at a time. | our servers | vercel.json:50; apps/web/app/api/cron/run-schedules/route.ts:22-60 |
| The executor picks a model route for an unattended run, loads allowed context (project, memory, recent chats), builds the tool plan (web, connectors) and calls the model. | our servers | apps/web/lib/services/scheduled-agent-executor.ts:926-1004 |
| The model provider answers the prompt. | outside service | apps/web/lib/services/scheduled-agent-executor.ts:946-957 (dispatch provider chosen from the route) |
| The run result is stored and a 'notifications.schedule-completed' job is queued; it records an in-app notice, sends push through Expo and queues email. | our servers | apps/web/lib/services/schedule-service.ts:1822-1840; apps/web/lib/jobs/job-handlers.ts:98-150 |
| Push reaches the phone through the Expo push service. | outside service | apps/web/lib/services/push-notification-service.ts:25 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Schedule definition (name, prompt, recurrence, time, timezone, sources, connectors, notification settings) | table:scheduled_tasks | Read by every app through /api/schedules | Kept until the person deletes it; delete is refused while a run is in progress (schedule-service.ts:1305). |
| Run result text and status | table:scheduled_task_runs | Listed through /api/schedules/runs and the per-schedule runs route | Retention period unknown. |
| Mobile Daily brief schedule id | Account notification preference namespace (server); table not opened | Yes, account-wide | Unknown. |

**Models and providers.** The schedule stores a model choice; the mobile brief and CLI default to automatic selection (dailyBrief.ts:74; schedules.rs help text 'Defaults to the account's automatic selection'). The executor admits a route through admitManagedCloudRoute and refuses runs that read Google data when no route keeps inputs out of training (scheduled-agent-executor.ts:738-800). Provider folder names for the route are unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account required on every app. CLI and mobile refuse Local and own-key sessions (apps/cli/src/schedules.rs:800-810; useCloudReminders.ts:129). |
| Permissions | Create needs authentication, rate limit and CSRF token (route.ts:96-106). Workspace scope applies on mobile (dailyBrief.ts:109-130). |
| Subscription | Scheduled-task limit by plan: local-only 0, byok 0, free 0, basic 3, pro 5, max 15, max_15x 25, team 10, enterprise custom (billing-catalog.ts:572-723). Mobile hides the switch when the limit is 0 (dailyBrief.ts:56). |
| Limits and metering | Count limit per account; each brief counts toward usage limits (index.tsx:161). Per-schedule credit cap and max runs exist on web (ScheduleForm.tsx:744-775). |
| Feature flags | Mobile FEATURES.schedules (apps/mobile/lib/v1FeatureFlags.ts:14). Connectors release state 'coming_soon' (connector-release.ts:14). |
| Model compatibility | A model that must keep inputs out of training is required when the run reads Google data (scheduled-agent-executor.ts:738-800). Other compatibility rules unknown. |
| Provider restrictions | none found in the code for the briefing itself; route admission decides. |
| Local mode | Not available. Scheduled runs are server-side; Local mode shows a Cloud gate on mobile and the CLI refuses it. A separate desktop-only 'Local routines' section exists (apps/web/features/schedules/components/LocalRoutinesSection.tsx:44) but its link to the briefing is not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile footnote 'Loading your account settings…'; web running-state poll shows 'Running now'. | index.tsx:147-152; ScheduleCard.tsx:216 |
| Signed out or Local (mobile) | Footnotes 'Sign in to AGI Cloud…' and 'Switch to AGI Cloud to use these reminders.' | apps/mobile/src/features/settings/notifications/index.tsx:144-150 |
| Setup failure (mobile) | Switch reverts and 'Could not set up the daily brief.' shows. | useCloudReminders.ts:231-250; dailyBrief.ts:30 |
| Load failure (mobile) | 'Could not load your daily brief. Check your connection and retry.' with a Retry button. | useCloudReminders.ts:48; index.tsx:630 |
| Brief lives in another workspace | Switch disabled; text 'Your daily brief runs in <name>. Switch to that workspace to change it.' | index.tsx:158-159 |
| Plan limit reached or zero | Server refuses with a message naming the plan; mobile shows 'View Plans'. | schedule-service.ts:887-902; apps/mobile/app/(app)/schedules/index.tsx:526 |
| Missed or late run | Run notes 'Ran late' or 'Skipped the run scheduled for ...' per the schedule's missed policy. | schedules.ts:740-760 |
| Run failed, timed out or awaiting approval | Run shown as failed or awaiting approval; the schedule pauses on approval. | ScheduleCard.tsx:349; schedule-service.ts:1915 |
| Offline | Not handled in the code beyond request errors on web; mobile shows load/save errors. | useCloudReminders.ts:231-250 |
| Accessibility | Mobile switch and Time row have accessibility labels; web fields have labels. | index.tsx:574,596; ScheduleForm.tsx:173-801 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/NotificationReminders.test.tsx`: Daily brief switch: Local-mode gate, turn on shows 'Daily Brief Time' picker with 08:00, failure reverts, existing brief at 07:30, turn off, workspace-elsewhere text, brief load failure leaves usage reset usable (cases at lines 217-422).
- `apps/mobile/__tests__/schedule-templates.test.ts`: Mobile templates equal the shared set, map to mobile drafts and resolve only known ids (lines 7-56).
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Schedules page including a 'Daily briefing' template case near line 1207; other cases not read.
- `apps/web/lib/services/schedule-service.test.ts`: Schedule service; file matched by name, cases not read.
- `apps/cli/src/schedules.rs`: Inline unit tests: cron request fields, timezone, Local/own-key refusal (lines 694-810).
- `apps/extension/__tests__/scheduled-task-lifecycle.test.ts`: Chrome local alarm-based scheduled tasks, not the cloud schedule form.

**Test scenarios**

- **Web template to schedule**
  1. Sign in on a paid plan.
  2. Open /chat/schedules and choose 'Daily briefing'.
  3. Check weekdays, 08:00, prompt text; set Time Zone; Save.
  - Expected: Card shows the zone and a Next Run at the chosen local time; nothing existed before Save.
- **Free plan refusal**
  1. Sign in on Free.
  2. Try to Save a template schedule.
  - Expected: Refused with 'Free plans do not include scheduled tasks. Upgrade to schedule unattended runs.'
- **Mobile switch**
  1. Cloud mode, paid plan.
  2. Settings > Notifications, switch Daily brief on.
  3. Change Time to 07:00.
  - Expected: One schedule named 'Daily brief' exists, daily, at 07:00 in the phone zone; the web Schedules page lists it.
- **Run and notice**
  1. Create a schedule due within 15 minutes.
  2. Wait for the sweep.
  3. Open run history and notifications.
  - Expected: A run with text appears; notice 'Scheduled task finished' is recorded; push arrives on a phone unless inside quiet hours.
- **CLI timezone**
  1. agi schedules create --name Brief --schedule '0 8 * * 1-5' --prompt '...' --timezone Europe/Paris
  2. agi schedules list
  - Expected: Listing shows the cron cadence and Europe/Paris.

**Where to look when it fails**

- Logs '[notifications] schedule notify failed' (schedule-notification-service.ts).
- Log 'Scheduled-task sweep ended with schedules still due' (run-schedules/route.ts).
- Tables scheduled_tasks (status, next_execution_at, paused_reason) and scheduled_task_runs.
- Error names ScheduleLimitError, NoTrainingRouteError, UnattendedPolicyUnreadableError.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)
- CLI: [70-qa/test-plans/cli/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/cli/042-proactive-assistance-briefings-and-reflection.md)
- Chrome: [70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **Calendar and email cannot be read because connectors are 'coming soon'.** Affects: All apps; the briefing falls back to chats, memory and web.. Evidence: packages/contracts/types/src/connector-release.ts:14; ScheduleAccessFields.tsx:136. Work needed: Release the calendar and mail connectors or state the limit in the template description.
- **Notice carries no brief text, so the brief is not delivered, only announced.** Affects: Mobile push, email, in-app notice.. Evidence: apps/web/lib/services/schedule-notification-service.ts:130. Work needed: Add a summary excerpt or a deep link to the run.
- **Mobile template cards drop sources; mobile Daily brief is daily not weekdays.** Affects: Mobile.. Evidence: apps/mobile/src/features/schedules/templates.ts:37-49; dailyBrief.ts:77. Work needed: Carry sources and cadence from the shared template.
- **Brief marks CLI S42.01 as missing and S42.04 as done; code has only cron create, by decision.** Affects: CLI.. Evidence: docs/decisions/2026-09-27-founder-decisions.md:462,471; apps/cli/src/lib.rs:1516. Work needed: None for the template; keep the brief row n/a.
- **Brief cites apps/extension-vscode/src/core/commandSetup.ts:2220 for pause, but that line is account-tier code.** Affects: Documentation accuracy.. Evidence: apps/extension-vscode/src/core/commandSetup.ts:2200-2235. Work needed: Correct the brief citation.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- table:scheduled_tasks
- table:scheduled_task_runs
- api:POST /api/schedules
- F042-06
- F042-05

## Unknown

- Retention of scheduled_task_runs rows.
- Which table holds the account notification preference namespace that stores dailyBriefScheduleId.
- Which provider folder the briefing route uses for a given plan.
- Whether desktop Local routines can carry a briefing.
- Whether the Chrome template path sends the mobile-style sources (templateSources) end to end.
