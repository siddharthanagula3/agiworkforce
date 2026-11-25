---
id: "F042-07"
type: "feature"
title: "Work-completion notices"
aliases: ["Work-completion notifications (S42.17)", "Scheduled task finished", "Routine notifications", "Agent run updates", "schedule_run push", "Task completion notifications (Chrome)", "bell_on_finish (CLI)"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S42.17"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "surface:chrome", "surface:cli", "mode:cloud", "table:notifications", "table:scheduled_tasks", "table:user_settings", "table:mobile_devices", "F042-10", "F042-11", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-observability-and-operations", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-07 Work-completion notices

Tells a signed-in person when background work ends or needs them. The server records a feed notice and sends Expo push and email for scheduled runs (done, failed, needs approval), and push for agent, research and code-session events. Chrome shows local browser notices for browser tasks. The CLI only rings a terminal bell. VS Code has nothing.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.17](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4217).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sends a short notice when a scheduled run succeeds, fails, times out or pauses for approval, and when a cloud agent run, research report or code session finishes, fails or needs input. Delivery goes to an in-app feed row, then Expo push to the phone app and email, depending on per-schedule switches and account switches (apps/web/lib/services/schedule-notification-service.ts:65-80,139-213; apps/web/lib/services/agent-notification-service.ts:140-184).

**Why it exists.** Scheduled and agent work runs while the person is away, so they need a signal to come back, approve a step or read the result. The brief's target is: the user is notified when background work completes (S42.17, doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md).

**Who uses it.** A signed-in person with scheduled tasks or cloud agent runs, on web, desktop, mobile, the browser extension and (as a bell only) the terminal.

**Problems it solves**

- The person does not have to watch a long or unattended run.
- An approval request is not left waiting unseen (approval notices bypass quiet hours, see states).
- Failures are surfaced even when the person had silenced routine notices (failure type is quiet-hours exempt) (packages/contracts/types/src/time-focus.ts:6-11).

**Use cases**

- A daily briefing schedule finishes at 07:00 and the phone gets a push 'Scheduled task finished'.
- A scheduled run needs approval for a tool call and the person gets a push and email naming the step.
- A scheduled run times out and the person gets a failure email even during quiet hours.
- A browser task in the Chrome extension finishes while the person is in another tab and Chrome shows a notification.

## 2. User experience

**Where to find it**

- Web: Settings, Notifications pane, event 'Scheduled task finished' with a channel select (Off, Email, Mobile push, or both) and a 'Manage tasks' link to /tasks; event 'Agent run updates' for browser push (apps/web/features/settings/sections/NotificationsSection.tsx:46-66,80-81).
- Web: per-schedule 'Routine notifications' switches in the schedule form: 'When completed', 'When failed or timed out', 'When approval is needed', 'Mobile push', 'Email' (apps/web/features/schedules/components/ScheduleForm.tsx:696-730).
- Mobile: Settings, Notifications, category list that includes a scheduled-tasks category (apps/mobile/src/features/settings/notifications/index.tsx:83-86; apps/mobile/stores/notificationPrefsStore.ts:28-40).
- Desktop (internal Tauri build, apps/desktop/src): Notifications settings with groups 'Task completions', 'Failures and input needed', 'Permission and system alerts', 'Reminders' (apps/desktop/src/features/settings/NotificationsSettings.tsx:20-39). The public Desktop shows the hosted web app (doc: AGENTS.md section 5), so the web pane applies there [inferred].
- Chrome extension: options row 'Task completion notifications' (apps/extension/_locales/en/messages.json:3485; apps/extension/src/features/options/notifications-row.ts:4).
- CLI: config key ui.bell_on_finish, set as 'bell' (apps/cli/src/config.rs:158,1580-1587).
- VS Code: not available.

**Before you start**

- Cloud sign-in: notices are built on the server from the user id (apps/web/lib/jobs/job-handlers.ts:98-105).
- For push: a registered phone with a device token in mobile_devices (apps/web/lib/services/push-notification-service.ts:121).
- For email: an address on the profile and a configured mail provider (apps/web/lib/services/schedule-notification-service.ts:78; apps/web/lib/services/notification-email-service.ts:13).

**Screens and controls**

- Web Notifications pane: one select per event that lists every combination of its channels plus Off (apps/web/features/settings/sections/NotificationsSection.tsx:92-115).
- Web schedule form: five switches under 'Routine notifications' (ScheduleForm.tsx:696-730).
- Mobile Notifications screen: per-category switches and a 'Quiet hours' row that opens 'Time and focus' (apps/mobile/src/features/settings/notifications/index.tsx:640-662).
- Chrome options: one toggle row, default on (apps/extension/src/background.ts:2482-2494).
- CLI: 'bell' true or false.

**Journey**

1. 1. Person creates a schedule on web; the five notice switches default to on (packages/contracts/cloud-contracts/src/schedules.ts:114-125).
2. 2. A run ends (success, failed, timeout) or parks for approval; the server queues a notice job (apps/web/lib/services/schedule-service.ts:1822-1869).
3. 3. The job reads the schedule switches and the account push/email preferences (schedule-notification-service.ts:20-80).
4. 4. It writes the feed row, then sends push and, through a separate job, email (job-handlers.ts:98-154).
5. 5. The phone shows the push; tapping a schedule notice opens the Schedules screen (apps/mobile/services/notifications.ts:587-590).
6. 6. The person reads the run in the schedule's run history (see F042-11).

**What the person sees and gets**

- Push and feed titles: 'Scheduled task finished', 'Scheduled task failed', 'Scheduled task needs your approval' (schedule-notification-service.ts:114-137).
- Agent titles: 'Approval needed', 'Your agent has a question', 'Agent run finished', 'Agent run failed' (agent-notification-service.ts:100-122).
- Research titles: 'Research report ready', 'Research did not finish' (agent-notification-service.ts:226-229).
- Chrome: titles from locale keys such as 'Task finished', 'Task stopped', 'AGI needs your input' (apps/extension/_locales/en/messages.json:3899-3961).
- CLI: a terminal bell character after a turn that took at least 10 seconds (apps/cli/src/tui/tui_app.rs:233,8672-8679).

**Settings**

- Account keys emailScheduleDone and mobilePushScheduleDone (opt-out: only an explicit false silences) (schedule-notification-service.ts:10-11,76-77).
- Account key mobilePushAgentActivity for agent, research and code-session push to phones (agent-notification-service.ts:25,78).
- Mobile device categories scheduled_tasks, tasks, research, code (default on) (apps/mobile/stores/notificationPrefsStore.ts:28-40).
- Chrome storage key agi_task_notifications (default on) (apps/extension/src/background.ts:2485-2487).
- CLI ui.bell_on_finish (apps/cli/src/config.rs:158).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web server builds and sends schedule notices; missing schedule settings default to all on, only invalid settings turn notices off (apps/web/lib/services/schedule-notification-service.ts:53-59,65-77).
- Feed row is written even when push and email are both off, as long as the status switch is on (schedule-notification-service.ts:150-169; test: apps/web/lib/services/__tests__/schedule-notification-service.test.ts:81).
- Dedupe: unique (user, dedupe key) insert; key is run id, plus the approval step for approvals (schedule-notification-service.ts:105-112; apps/web/lib/services/notification-service.ts:62-90). Status is not part of the key.
- Cancelled runs send nothing (schedule-notification-service.ts:147).
- Email goes through its own job so quiet hours can delay it to the end of the window (apps/web/lib/jobs/job-handlers.ts:107-127,156-210).
- A developer webhook event task_run.completed, task_run.failed or task_run.needs_approval is queued for every announced run (job-handlers.ts:138-153).
- Cloud agent runs, research reports, cloud code turns and local code sessions also notify (agent-notification-service.ts:140,209,314,374; apps/web/lib/services/cloud-agent-run-service.ts:160-170).
- Mobile opens the Schedules screen on a schedule push (apps/mobile/services/notifications.ts:587-590).
- Chrome notifies for browser tasks (finished, failed, needs input) unless the side panel is focused (apps/extension/src/background/task-notifications.ts:27-37; apps/extension/src/background.ts:6546,6814,6829).

**Incomplete**

- CLI: only a local bell after long turns; no push, email or server notice (apps/cli/src/tui/tui_app.rs:8672-8679). The brief marks CLI done (S42.17); the brief's cited config.rs:1138 and tui_app.rs:5894 are unrelated code.
- Chrome: notifies for local browser tasks, not for server schedule results; its scheduled-task notice says a task is running, not that it finished (apps/extension/src/background.ts:2506-2522).
- Per-schedule notice switches are in the web schedule form only; none found in mobile, desktop src, extension, CLI or VS Code schedule code (search for onSuccess/onApproval/DEFAULT_NOTIFICATIONS).

**Present but disconnected or switched off**

- Schedule notices do not go to browser push: web transport is passed as false (schedule-notification-service.ts:184), while agent notices include web (agent-notification-service.ts:176).
- The comment in agent-notification-service.ts:16-24 says schedule consent is opt-in; the code is opt-out (schedule-notification-service.ts:76-77). Code wins.

**Not available**

- VS Code: no work-completion notice (audit/partial/042-proactive-assistance-briefings-and-reflection.md S42.17 lists vscode missing).
- Email for agent, research or code-session events: none found (only schedule notices call the email service).

## 4. Required behaviour

**Established requirements**

- The user is notified when background work (a scheduled run or agent task) completes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.17)
- During quiet hours the product holds proactive notifications and nudges. (source: S42.16 (same brief))
- Vscode is left at Claude Code in VS Code's scope; S42.17 is open for vscode in the audit. (source: doc: audit/partial/042-proactive-assistance-briefings-and-reflection.md)
- Features ChatGPT and Claude do not offer are not built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-27-02))

**Acceptance criteria**

1. With default switches, a successful scheduled run produces one feed row titled 'Scheduled task finished' and one push to a registered phone.
2. Turning 'When completed' off for a schedule stops the success notice but a failed run still notifies.
3. A stored schedule notice setting that is not valid sends nothing and logs a warning.
4. Two deliveries of the same run id produce one feed row and one email (idempotency key).
5. A cancelled run sends nothing.
6. During quiet hours a success push is not delivered and a failure or approval push is delivered.
7. An approval-needed run notifies once per approval step.
8. With mobilePushScheduleDone set to false the phone gets no push but the feed row remains.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A skipped run (status cancelled) never notifies, because skipped runs are finalized as cancelled and cancelled runs are not announced [inferred from apps/web/lib/services/schedule-service.ts:2257-2278,1825].
- Every surface that shows a notice should respect the same Time and focus quiet hours [inferred from S42.16].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the CLI a real completion notice for cloud schedules, or mark S42.17 partial for CLI.
- [proposed] Expose the five per-schedule notice switches on mobile and desktop.
- [proposed] Decide whether success push during quiet hours should be deferred like email instead of dropped.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | schedule-notification-service | `apps/web/lib/services/schedule-notification-service.ts` | Reads switches, builds copy, dedupes, sends push and email. |
| job | notifications.schedule-completed handler | `apps/web/lib/jobs/job-handlers.ts` | announceScheduleCompletion: queues email job, records feed and push, queues developer webhook (lines 98-154,348-350). |
| job | email.schedule-completed handler | `apps/web/lib/jobs/job-handlers.ts` | Sends the email, re-checks quiet hours and preferences at send time (lines 156-210). |
| service | announceScheduleRun / announceScheduleApproval | `apps/web/lib/services/schedule-service.ts` | Enqueue the notice job when a run ends or parks (lines 1822-1869). |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | sendPushToUser: quiet-hours check, fan out to Expo and browser transports (lines 281-298). |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | recordNotification writes the feed row with the dedupe key (lines 62-120). |
| service | notification-email-service | `apps/web/lib/services/notification-email-service.ts` | sendScheduleCompletionEmail. |
| service | agent-notification-service | `apps/web/lib/services/agent-notification-service.ts` | Agent run, research, cloud code and local code notices. |
| service | quiet-hours-service | `apps/web/lib/services/quiet-hours-service.ts` | Holds non-urgent notices during saved quiet hours. |
| schema | ManagedCloudScheduleNotificationSettingsSchema | `packages/contracts/cloud-contracts/src/schedules.ts` | The five per-schedule switches, strict, all default true (lines 114-125). |
| component | NotificationsSection | `apps/web/features/settings/sections/NotificationsSection.tsx` | Web account notification pane. |
| component | ScheduleForm routine notifications | `apps/web/features/schedules/components/ScheduleForm.tsx` | Per-schedule switches (lines 696-730). |
| table | notifications | `apps/web/db/neon/0016_misc.sql` | In-app feed rows; dedupe column added in 0199_notification_feed_targets.sql. |
| table | scheduled_tasks (metadata.notificationSettings) | `apps/web/db/neon/0009_scheduling.sql` | Stores the per-schedule switches in metadata (read at schedule-notification-service.ts:37). |
| table | mobile_devices | `apps/web/lib/services/push-notification-service.ts` | Device tokens read for push (line 121). |
| store | notificationPrefsStore | `apps/mobile/stores/notificationPrefsStore.ts` | Per-device push categories and quiet hours. |
| service | mobile notifications handler | `apps/mobile/services/notifications.ts` | Shows or suppresses a push, routes taps (lines 587-590). |
| component | Mobile Notifications screen | `apps/mobile/src/features/settings/notifications/index.tsx` | Category switches and Quiet hours row. |
| component | Desktop NotificationsSettings | `apps/desktop/src/features/settings/NotificationsSettings.tsx` | Internal-build notification groups. |
| service | extension task notifier | `apps/extension/src/background/task-notifications.ts` | createTaskNotifier: skip when disabled or side panel focused. |
| service | extension background notifications | `apps/extension/src/background.ts` | showNotification, taskNotificationsEnabled, click handler (lines 2455-2545). |
| config | ui.bell_on_finish | `apps/cli/src/config.rs` | CLI terminal bell setting (lines 158,1580). |
| command | TUI bell | `apps/cli/src/tui/tui_app.rs` | Writes the bell after a turn of 10 seconds or more (lines 233,8672-8679). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A run ends or parks; the schedule service queues a notifications.schedule-completed job with task, run id and status. Running and cancelled and parked-for-approval end states are not announced by announceScheduleRun; approvals use announceScheduleApproval. | our servers | apps/web/lib/services/schedule-service.ts:1822-1869 |
| The job reads account notification preferences, profile email and the schedule's notificationSettings in one query scoped to the user and workspace. | our servers | apps/web/lib/services/schedule-notification-service.ts:33-47 |
| If the status switch is on, the job queues the email job (delayed to the end of quiet hours for non-urgent types), then records the feed row. | our servers | apps/web/lib/jobs/job-handlers.ts:107-131; schedule-notification-service.ts:155-165 |
| Push: quiet hours are checked, then Expo push is posted for registered phones. | our servers | apps/web/lib/services/push-notification-service.ts:281-298 |
| Expo's push service delivers to the device. | outside service | apps/web/lib/services/push-notification-service.ts:25,179 |
| The phone applies its own category and quiet-hours gate before showing the banner. | device | apps/mobile/services/notifications.ts:111-125; apps/mobile/services/notificationGate.ts:14-20 |
| Email is sent by the mail provider through the email job, idempotent per run. | outside service | apps/web/lib/jobs/job-handlers.ts:202-206 |
| Chrome: the background worker decides locally and calls chrome.notifications.create. | device | apps/extension/src/background.ts:2459-2478 |
| CLI: after a long turn the TUI writes a bell to stdout. | device | apps/cli/src/tui/tui_app.rs:8672-8679 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Feed row (category schedule or agent_run or research, severity, title, message, target, dedupe key) | table:notifications | Server-side; clients read the feed over the API | unknown (no retention rule read) |
| Per-schedule notice switches | table:scheduled_tasks metadata.notificationSettings | Server-side | Deleted with the schedule (apps/web/db/neon/0009_scheduling.sql:36 cascade covers runs; the schedule delete is in schedule-service.ts) |
| Account push and email keys | table:user_settings settings.notifications | Server-side | Kept with account settings |
| Device push categories | store:notificationPrefsStore (MMKV on phone) | Pushed to server by pushPreferenceSync (apps/mobile/services/pushPreferenceSync.ts, name seen at notifications.ts:35-39; contents not read) | On device until app data is cleared |
| Chrome toggle | chrome.storage.local agi_task_notifications | Listed in synced preferences (apps/extension/src/features/background/synced-preferences.ts:4) | Browser profile |

**Models and providers.** No model is called. Delivery uses Expo's push service and a transactional email provider; no folder under packages/ai/providers is involved. Notice text never carries task output (test: schedule-notification-service.test.ts:153).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a signed-in cloud account; notices are keyed to the user id (apps/web/lib/jobs/job-handlers.ts:98-105). Chrome and CLI bell work without server notice. |
| Permissions | Phone must grant OS notification permission (apps/mobile/services/notifications.ts, permission handling at lines 1-60 imports). Chrome needs the notifications permission [inferred]. Workspace scope: the preference query is limited to the current workspace (schedule-notification-service.ts:38-41). |
| Subscription | No plan gate on sending a notice was found. Creating scheduled tasks is limited by plan: free 0, byok 0, basic 3, pro 5, team 10 (packages/contracts/types/src/billing-catalog.ts:600-701). Plans are therefore a precondition for schedule notices. |
| Limits and metering | No notice quota or metering found in the notice code. The web feed API and Expo batch size limits exist for push but were not traced. |
| Feature flags | Web Notifications pane hides the Mobile push channel until the mobile surface is released (apps/web/features/settings/sections/NotificationsSection.tsx:117-124). Mobile FEATURES.schedules is true (apps/mobile/lib/v1FeatureFlags.ts:14). |
| Model compatibility | Not applicable: no model involved. |
| Provider restrictions | Push depends on Expo's push service; email depends on a configured provider, and without one the email job settles quietly (apps/web/lib/jobs/__tests__/job-handlers.test.ts:355). |
| Local mode | Server schedule notices exist only for Cloud schedules. In Local mode no server notice is sent. Chrome browser-task notices and the CLI bell run on the device with no sign-in and no payment (apps/extension/src/background.ts:2459; apps/cli/src/tui/tui_app.rs:8672). Whether mobile local runs raise local notices: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid stored schedule settings | Notices off for that schedule; warning logged. | schedule-notification-service.ts:53-59 |
| Preferences cannot be read | The schedule job throws and is retried; the email job retries rather than recording an opt-out. | schedule-notification-service.ts:48-51; apps/web/lib/jobs/__tests__/job-handlers.test.ts:162,252 |
| Schedule deleted before delivery | enabled is false, nothing sent. | schedule-notification-service.ts:67; test: schedule-notification-service.test.ts:344 |
| Duplicate delivery | Second insert hits the unique key and sends no push or email. | schedule-notification-service.ts:167; notification-service.ts:79 |
| Push fails | Error swallowed; email still sent; result reports pushed false. | schedule-notification-service.ts:185,201,205-208 |
| Quiet hours, success | Push returns no delivery and is not retried; email is queued to run after the window. | push-notification-service.ts:289-291; job-handlers.ts:103-126 |
| Quiet hours, failure, timeout or approval | Not held (exempt types agent_failed and agent_approval_needed). | schedule-notification-service.ts:82-88; packages/contracts/types/src/time-focus.ts:6-14 |
| Quiet hours cannot be read | Push is queued as a deferred job; email waits. | push-notification-service.ts:292-295,304-324 |
| No phone registered or no address | That channel is skipped. | schedule-notification-service.ts:187; test line 97,244 |
| Chrome, side panel focused | No notification. | apps/extension/src/background/task-notifications.ts:33 |
| Chrome, setting unreadable | Stays quiet. | apps/extension/src/background.ts:2488-2491 |
| Offline or reconnect | Not handled in the code for server notices (push delivery is the OS's); Chrome and CLI are local. | not handled in the code |
| Accessibility | Web pane uses labelled selects; mobile rows carry accessibilityLabel with state. | apps/mobile/src/features/settings/notifications/index.tsx:436 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/schedule-notification-service.test.ts`: Consent defaults, fail-closed on bad settings, copy for failed and timeout, no task output, long names, cancelled, push or email failure, dedupe, deleted schedule.
- `apps/web/lib/jobs/__tests__/job-handlers.test.ts`: Schedule notice job and email job: quiet hours defer, retries, provider errors, idempotency.
- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: Agent, research and code notice behaviour (22 cases).
- `apps/web/lib/services/cloud-agent-run-notifications.test.ts`: Cloud agent run notification triggers.
- `apps/web/lib/workflows/cloud-agent-terminal-notifications.test.ts`: Terminal state notices for cloud agent workflows.
- `apps/web/lib/services/__tests__/quiet-hours-service.test.ts`: Quiet-hours hold, urgent exemption, unreadable settings.
- `apps/web/features/settings/sections/NotificationsSection.permission.test.tsx`: Web pane permission behaviour.
- `apps/mobile/__tests__/notificationPrefs.test.ts`: Mobile category preferences.
- `apps/mobile/__tests__/notification-gate-unreadable.test.ts`: Gate when preferences are unreadable.
- `apps/desktop/src/features/settings/NotificationsSettings.test.tsx`: Desktop notification groups.
- `apps/extension/__tests__/task-notifications-toggle.test.ts`: Toggle default and gating.
- `apps/extension/__tests__/scheduled-task-notifications.test.ts`: Owner authority for scheduled-task notices.

**Test scenarios**

- **Default success notice**
  1. Create a daily schedule on web with default notice switches.
  2. Register the phone app on the same account.
  3. Run it now and let it succeed.
  - Expected: One feed row 'Scheduled task finished' and one push; tapping opens Schedules.
- **Switch off completion**
  1. Turn off 'When completed' in the schedule form and save.
  2. Run it successfully, then force a failure.
  - Expected: No success notice; the failure notice arrives.
- **Approval during quiet hours**
  1. Enable quiet hours covering now.
  2. Run a schedule that needs approval.
  - Expected: Approval push and email still arrive; a success run in the same window sends no push and its email is held.
- **Duplicate run id**
  1. Replay the notice job for one run.
  - Expected: Only one feed row and one email.
- **Chrome task notice**
  1. Start a browser task in the side panel.
  2. Switch to another window until it ends.
  - Expected: A Chrome notification 'Task finished'; none while the panel is focused.
- **CLI bell**
  1. Run 'agi' config set bell true.
  2. Run a turn longer than 10 seconds in the TUI.
  - Expected: Terminal bell at the end; none for short turns.

**Where to look when it fails**

- Log lines '[notifications] schedule notify failed', '[notifications] could not read preferences', '[notifications] stored schedule notification settings are invalid'.
- Rows in table:notifications by dedupe_key prefix 'schedule-run:'.
- Background job kinds notifications.schedule-completed and email.schedule-completed.
- Push log '[push] Expo rejected the batch'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)
- CLI: [70-qa/test-plans/cli/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/cli/042-proactive-assistance-briefings-and-reflection.md)
- Chrome: [70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/chrome/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **CLI has no completion notice beyond a terminal bell, but the brief marks it done.** Affects: CLI users. Evidence: apps/cli/src/tui/tui_app.rs:8672-8679; brief S42.17. Work needed: Decide scope, then add a server-backed or local-run notice, or correct the brief.
- **No VS Code notice.** Affects: VS Code users. Evidence: audit/partial/042-proactive-assistance-briefings-and-reflection.md. Work needed: Add an editor notification or record a founder decision.
- **Per-schedule switches only editable on web.** Affects: Mobile, desktop, extension, CLI, VS Code schedule editors. Evidence: ScheduleForm.tsx:696-730; no matches elsewhere. Work needed: Add the five switches to those forms.
- **Success push during quiet hours is dropped, not deferred, while email is deferred.** Affects: All users with quiet hours. Evidence: push-notification-service.ts:289-291 vs job-handlers.ts:103-126. Work needed: Decide the rule and align push and email.
- **Schedule notices skip browser push.** Affects: Web users who allow browser notifications. Evidence: schedule-notification-service.ts:184. Work needed: Decide whether browser consent should cover schedule notices.
- **Stale comment says schedule consent is opt-in.** Affects: Engineers. Evidence: agent-notification-service.ts:16-24. Work needed: Fix the comment.
- **Chrome has no server-originated schedule completion notice.** Affects: Chrome users. Evidence: apps/extension/src/background.ts:2506-2522. Work needed: Poll or push schedule results to the extension.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- surface:chrome
- surface:cli
- mode:cloud
- table:notifications
- table:scheduled_tasks
- table:user_settings
- table:mobile_devices
- F042-10
- F042-11
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-observability-and-operations
- SYS-execution-boundaries

## Unknown

- How long feed rows in table:notifications are kept.
- What the mobile shouldNotify body does with quiet hours (only its imports were read).
- Which mail provider is used.
- Whether mobile Local-mode runs raise local notices.
- What the Chrome extension's side panel does for scheduled results beyond the running notice.
- Which desktop build (Tauri or Electron) ships the desktop notification groups beyond the AGENTS.md statement.
