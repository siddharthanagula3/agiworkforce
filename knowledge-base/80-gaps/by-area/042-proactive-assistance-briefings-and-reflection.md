---
id: "GAPS-AREA-042"
type: "gap-list"
title: "Gaps: Proactive assistance, briefings, and reflection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 42. Proactive assistance, briefings, and reflection

88 open gaps that touch this area. Area page: [20-features/042-proactive-assistance-briefings-and-reflection](../../20-features/042-proactive-assistance-briefings-and-reflection/README.md).

## CMP-C411

**Choose how the terminal alerts you (bell, iTerm2, Kitty, Ghostty, OSC 9)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: The only alert is a terminal bell on or off (ui.bell_on_finish); there is no choice of channel or desktop notification.
- Evidence: apps/cli/src/config.rs:158; apps/cli/src/tui/tui_app.rs:8613

## CMP-C413

**Hooks can emit terminal notification, title and progress sequences**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Hook output is captured; a hook cannot send escape sequences to the terminal.
- Evidence: searched: terminalSequence in apps/cli/src/features/hooks

## CMP-CP267

**Run an external program when a turn completes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: The Stop hook fires only on quit, and there is no notify setting An AfterMessage hook can run a command after each assistant message; the Stop hook fires only on quit, and there is no notify setting.
- Evidence: apps/cli/src/agent/chat.rs:1630; apps/cli/src/tui/tui_app.rs:7850

## CMP-CP268

**Alert when the agent needs you or finishes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: There is no built-in desktop notice or sound A Notification hook event fires when the agent needs attention so a hook can run any command; there is no built-in desktop notice or sound.
- Evidence: apps/cli/src/features/hooks/hooks.rs:357; searched: notify-send, osascript, terminal-notifier, bell in apps/cli/src

## CMP-CP269

**Notification hook with types (permission prompt, idle, auth, input needed)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: The Notification hook fires only for loop-detection warnings A PermissionRequest hook fires before approval prompts, but the Notification hook fires only for loop-detection warnings; there is no idle or auth type.
- Evidence: apps/cli/src/features/exec/tools/mod.rs:2013; apps/cli/src/agent/chat.rs:3444

## CMP-CP301

**Desktop notifications when a turn finishes or needs input**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: No desktop notification option Ours can ring the terminal bell when a turn finishes; no desktop notification option.
- Evidence: apps/cli/src/config.rs:158; apps/cli/src/tui/tui_app.rs:8613

## CMP-CP53

**Terminal bell when the agent needs you or finishes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: No bell for long tools Ours rings before each prompt in screen reader mode and after a long turn when bell_on_finish is on in the full-screen UI; no bell for long tools.
- Evidence: apps/cli/src/output.rs:274; apps/cli/src/tui/tui_app.rs:8613

## CMP-CP73

**Notification when a session needs input or finishes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md), [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md), [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: The terminal does not ring or send a desktop notice on its own A Notification hook event fires, but the terminal does not ring or send a desktop notice on its own.
- Evidence: apps/cli/src/agent/chat.rs:3444; searched: bell, notify in tui

## CMP-MP52

**Scheduled view shows unread indicator for runs needing attention**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: The Schedules list has no unread mark A notification is raised when a scheduled run finishes, but the Schedules list has no unread mark.
- Evidence: apps/mobile/services/notificationEventTypes.ts:18

## CMP-MP87

**Choose push, email or both for scheduled task results**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Email notifications show as a read-only line that says they are set on the web The phone has a push switch per category. Email notifications show as a read-only line that says they are set on the web.
- Evidence: apps/mobile/src/features/settings/notifications/NotificationCategoryDetailScreen.tsx:126-149; apps/mobile/src/features/settings/notifications/categories.ts:12; :27

## CMP-MP88

**Notification switch for finished research**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md), [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md), [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: A Research complete switch shows only when research is on and the server announces the group A Research complete switch shows only when research is on and the server announces the group.
- Evidence: apps/mobile/src/features/settings/notifications/categories.ts:29; apps/mobile/src/features/settings/notifications/categories.ts:64

## CMP-MP89

**Notification switches for Code and Dispatch**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: A Code switch shows once the server announces that group; the Dispatch switch is off with the dispatch flag A Code switch shows once the server announces that group; the Dispatch switch is off with the dispatch flag.
- Evidence: apps/mobile/src/features/settings/notifications/categories.ts:64; apps/mobile/lib/v1FeatureFlags.ts:12

## CMP-W290

**Dispatch message notifications**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: No notification category for dispatch messages on web.
- Evidence: apps/web/features/settings/sections/NotificationsSection.tsx:47-80

## CMP-W291

**Marketing and personalized tips notifications**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: No tips or marketing category; marketing consent is under Privacy.
- Evidence: apps/web/features/settings/sections/NotificationsSection.tsx:47-80; apps/web/features/settings/components/MarketingEmailConsentRow.tsx

## CMP-W293

**SMS as a notification channel**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Notification settings offer push and email only.
- Evidence: searched: sms in apps/web/features/settings/sections/NotificationsSection.tsx

## CMP-WP136

**Scheduled inbox: unread indicator for runs needing attention**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: No unread marker on the Schedules entry Schedules shows runs with an approval-needed state and recent results, but no unread marker on the Schedules entry.
- Evidence: apps/web/features/schedules/components/RecentScheduleResults.tsx; ScheduleRunHistory.tsx:40-54

## CMP-WP214

**Coding session notifications and permission requests**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F059-02](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Detail: Agent run updates for completions, failures and approval requests in this browser Agent run updates for completions, failures and approval requests in this browser.
- Evidence: apps/web/features/settings/sections/NotificationsSection.tsx:78-80,443-460

## CMP-WP215

**Per-category channel picker (Push, Email)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Four event categories and agent runs, each with a channel select; far fewer categories Four event categories and agent runs, each with a channel select; far fewer categories.
- Evidence: apps/web/features/settings/sections/NotificationsSection.tsx:47-115

## CMP-WP60

**Prompt to be notified when a reply finishes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: No banner offers it while streaming A browser notification fires when a reply finishes if permission is granted and the setting is on; no banner offers it while streaming.
- Evidence: apps/web/shared/lib/reply-ready-notification.ts:3-12; features/chat/pages/WebChatPage.tsx:2296-2320

## GAP-AREA042-LW05

**The Monitor a topic template ships with a literal placeholder in its prompt. Nothing in the template forces the person to replace it before saving.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-042
- Detail: Area 42. Proactive assistance, briefings, and reflection
- Evidence: packages/contracts/cloud-contracts/src/schedules.ts:865

## GAP-CAP-notifications-01

**Alert when a reply finishes while you are away: No banner offering to turn it on (W289). VS Code has no finish alert.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-notifications-02

**Choose when completion alerts appear: No never/background/always choice found; not checked on desktop beyond the web section.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-notifications-03

**Separate alerts for permission requests and questions: No separate question toggle; CLI hook fires only for loop detection, not approval prompts.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-notifications-07

**Per-category channel picker (push, email, SMS): No SMS, no tips or marketing category, no dispatch category on web; mobile cannot set email.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-notifications-08

**Scheduled task result by push or email: No unread marker on the Schedules list. VS Code has none.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-notifications-10

**Phone push for long tasks and decisions: CLI-to-phone push off by owner decision (Remote Control hidden in v1, 2026-11-14).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude yes, ChatGPT partly; AGI off by decision

## GAP-CAP-notifications-14

**Terminal alert channel: No channel choice and no desktop alert.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-notifications-16

**Run a command or hook on finish or need: Approval and idle types, per-turn finish hook, terminal sequences.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-notifications-18

**Editor alerts in VS Code: Ledger and comparison disagree; no finish alert confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-notifications-21

**Quiet hours: CLI, VS Code, Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md), [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Requirement items: S42.16, S42.23
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-notifications-22

**Break reminders: CLI, VS Code, Chrome missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Requirement items: S42.22
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-notifications-25

**Morning brief and proactive digest: Topics, sources, briefing home, important-change alerts.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-01](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-01-set-up-a-daily-briefing.md), [F042-03](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-03-briefing-home-and-content.md), [F042-08](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-08-important-change-alerts.md)
- Requirement items: S42.01, S42.05, S42.18
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-notifications-30

**Mobile notification settings and OS permission: Code and research switches appear only when the server announces them.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-F042-01-01

**Calendar and email cannot be read because connectors are 'coming soon'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-01](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-01-set-up-a-daily-briefing.md)
- Detail: Affects: All apps; the briefing falls back to chats, memory and web.. Work needed: Release the calendar and mail connectors or state the limit in the template description.
- Evidence: packages/contracts/types/src/connector-release.ts:14; ScheduleAccessFields.tsx:136

## GAP-F042-01-02

**Notice carries no brief text, so the brief is not delivered, only announced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-01](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-01-set-up-a-daily-briefing.md)
- Detail: Affects: Mobile push, email, in-app notice.. Work needed: Add a summary excerpt or a deep link to the run.
- Evidence: apps/web/lib/services/schedule-notification-service.ts:130

## GAP-F042-01-03

**Mobile template cards drop sources; mobile Daily brief is daily not weekdays.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-01](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-01-set-up-a-daily-briefing.md)
- Detail: Affects: Mobile.. Work needed: Carry sources and cadence from the shared template.
- Evidence: apps/mobile/src/features/schedules/templates.ts:37-49; dailyBrief.ts:77

## GAP-F042-01-04

**Brief marks CLI S42.01 as missing and S42.04 as done; code has only cron create, by decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-01](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-01-set-up-a-daily-briefing.md)
- Detail: Affects: CLI.. Work needed: None for the template; keep the brief row n/a.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:462,471; apps/cli/src/lib.rs:1516

## GAP-F042-01-05

**Brief cites apps/extension-vscode/src/core/commandSetup.ts:2220 for pause, but that line is account-tier code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-01](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-01-set-up-a-daily-briefing.md)
- Detail: Affects: Documentation accuracy.. Work needed: Correct the brief citation.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2200-2235

## GAP-F042-02-01

**No topic model, add topic or dismiss topic.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-02](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-02-choose-briefing-topics-and-sources.md)
- Detail: Affects: All six apps.. Work needed: Design a topic list on the schedule and UI on each app.
- Evidence: Brief S42.02, S42.13, S42.14 missing; no code found.

## GAP-F042-02-02

**Brief says S42.03 is missing but web and desktop have source switches.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-02](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-02-choose-briefing-topics-and-sources.md)
- Detail: Affects: Documentation; web and desktop.. Work needed: Mark S42.03 partial on web and desktop.
- Evidence: ScheduleAccessFields.tsx:93; DesktopScheduleAccessFields.tsx:33-38

## GAP-F042-02-03

**Desktop lacks Recent chats; mobile and Chrome lack source controls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-02](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-02-choose-briefing-topics-and-sources.md)
- Detail: Affects: Desktop, mobile, Chrome.. Work needed: Add the control on each app.
- Evidence: DesktopScheduleAccessFields.tsx:33-38; no sources in apps/mobile/src/features/schedules

## GAP-F042-02-04

**Mail and calendar cannot be selected by name while connectors are 'coming soon'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-02](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-02-choose-briefing-topics-and-sources.md)
- Detail: Affects: All apps.. Work needed: Release connectors and name them in the form.
- Evidence: connector-release.ts:14

## GAP-F042-02-05

**Monitor a topic template needs a manual edit of a placeholder.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-02](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-02-choose-briefing-topics-and-sources.md)
- Detail: Affects: Web, desktop, mobile, Chrome templates.. Work needed: Required topic field.
- Evidence: schedules.ts:858

## GAP-F042-02-NOTBUILT

**Choose briefing topics and sources: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F042-02](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-02-choose-briefing-topics-and-sources.md)
- Requirement items: S42.02, S42.03, S42.13, S42.14
- Detail: Mobile: S42.02, S42.03, S42.13, S42.14; CLI: S42.02, S42.03, S42.13, S42.14; VS Code: S42.02, S42.03, S42.13, S42.14; Chrome: S42.02, S42.03, S42.13, S42.14

## GAP-F042-03-01

**No briefing home, cards or all-caught-up state.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-03](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-03-briefing-home-and-content.md)
- Detail: Affects: All six apps.. Work needed: Design and build home, structured output and states.
- Evidence: Brief S42.05-S42.09, S42.24 missing; no code found.

## GAP-F042-03-02

**No structured briefing output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-03](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-03-briefing-home-and-content.md)
- Detail: Affects: Any card UI.. Work needed: Result schema with sections.
- Evidence: schedules.ts:843 asks for prose.

## GAP-F042-03-03

**Calendar and mail inputs unavailable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-03](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-03-briefing-home-and-content.md)
- Detail: Affects: Calendar and email cards.. Work needed: Release connectors.
- Evidence: connector-release.ts:14

## GAP-F042-03-NOTBUILT

**Briefing home and content: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F042-03](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-03-briefing-home-and-content.md)
- Requirement items: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24
- Detail: Web: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24; Desktop: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24; Mobile: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24; CLI: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24; VS Code: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24; Chrome: S42.05, S42.06, S42.07, S42.08, S42.09, S42.24

## GAP-F042-04-01

**No follow-up, listen or rating on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-04](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-04-ask-listen-to-and-rate-a-briefing.md)
- Detail: Affects: All six apps.. Work needed: Build the three controls and storage.
- Evidence: Brief S42.10-S42.12; no code found.

## GAP-F042-04-02

**Brief marks Chrome S42.10 done but its code citations do not match.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-04](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-04-ask-listen-to-and-rate-a-briefing.md)
- Detail: Affects: Chrome; documentation.. Work needed: Correct the status or find the real code.
- Evidence: apps/extension/src/background.ts:1288,1951

## GAP-F042-04-03

**No rating storage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-04](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-04-ask-listen-to-and-rate-a-briefing.md)
- Detail: Affects: Any app.. Work needed: Schema and API.
- Evidence: No column or endpoint found.

## GAP-F042-04-NOTBUILT

**Ask, listen to and rate a briefing: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F042-04](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-04-ask-listen-to-and-rate-a-briefing.md)
- Requirement items: S42.10, S42.11, S42.12
- Detail: Web: S42.10, S42.11, S42.12; Desktop: S42.10, S42.11, S42.12; Mobile: S42.10, S42.11, S42.12; CLI: S42.10, S42.11, S42.12; VS Code: S42.10, S42.11, S42.12; Chrome: S42.10, S42.11, S42.12

## GAP-F042-05-01

**Pause on the server was not traced against a running run; effect on an in-flight run unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-05](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-05-pause-and-resume-schedules.md)
- Detail: Affects: All apps.. Work needed: Test and document.
- Evidence: schedule-service.ts:1234-1289 edits the row only.

## GAP-F042-05-02

**Brief cites commandSetup.ts:2220 for VS Code pause, which is unrelated.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-05](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-05-pause-and-resume-schedules.md)
- Detail: Affects: Documentation.. Work needed: Fix citation to scheduleActions.ts.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2200-2235

## GAP-F042-05-03

**VS Code is by decision a viewer; it cannot create schedules.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-05](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-05-pause-and-resume-schedules.md)
- Detail: Affects: VS Code.. Work needed: None.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md (VS Code extras)

## GAP-F042-06-01

**Held push is dropped, not delivered after the window.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md)
- Detail: Affects: Mobile users with routine schedule notices.. Work needed: Queue a push at quiet end like email, or document the drop.
- Evidence: push-notification-service.ts:289-290

## GAP-F042-06-02

**Web copy says reminders apply on the Website; server also enforces for phone push.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md)
- Detail: Affects: Web and desktop users.. Work needed: Correct the copy.
- Evidence: TimeFocusSection.tsx:375; push-notification-service.ts:281-292

## GAP-F042-06-03

**No quiet hours on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md)
- Detail: Affects: Those apps.. Work needed: Decide whether those surfaces need it.
- Evidence: Brief S42.16 missing; no code found.

## GAP-F042-06-04

**Browser push is excluded for schedule notices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md)
- Detail: Affects: Web users.. Work needed: Confirm intent.
- Evidence: schedule-notification-service.ts:184

## GAP-F042-06-05

**Two stores (account and per-device) can differ.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md)
- Detail: Affects: Mobile.. Work needed: Single source or a sync check.
- Evidence: quiet-hours-service.ts:48; push-notification-service.ts:92-113

## GAP-F042-06-NOTBUILT

**Quiet hours: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F042-06](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-06-quiet-hours.md)
- Requirement items: S42.16
- Detail: CLI: S42.16; VS Code: S42.16; Chrome: S42.16

## GAP-F042-07-01

**CLI has no completion notice beyond a terminal bell, but the brief marks it done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: CLI users. Work needed: Decide scope, then add a server-backed or local-run notice, or correct the brief.
- Evidence: apps/cli/src/tui/tui_app.rs:8672-8679; brief S42.17

## GAP-F042-07-02

**No VS Code notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: VS Code users. Work needed: Add an editor notification or record a founder decision.
- Evidence: audit/partial/042-proactive-assistance-briefings-and-reflection.md

## GAP-F042-07-03

**Per-schedule switches only editable on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: Mobile, desktop, extension, CLI, VS Code schedule editors. Work needed: Add the five switches to those forms.
- Evidence: ScheduleForm.tsx:696-730; no matches elsewhere

## GAP-F042-07-04

**Success push during quiet hours is dropped, not deferred, while email is deferred.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: All users with quiet hours. Work needed: Decide the rule and align push and email.
- Evidence: push-notification-service.ts:289-291 vs job-handlers.ts:103-126

## GAP-F042-07-05

**Schedule notices skip browser push.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: Web users who allow browser notifications. Work needed: Decide whether browser consent should cover schedule notices.
- Evidence: schedule-notification-service.ts:184

## GAP-F042-07-06

**Stale comment says schedule consent is opt-in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: Engineers. Work needed: Fix the comment.
- Evidence: agent-notification-service.ts:16-24

## GAP-F042-07-07

**Chrome has no server-originated schedule completion notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: Affects: Chrome users. Work needed: Poll or push schedule results to the extension.
- Evidence: apps/extension/src/background.ts:2506-2522

## GAP-F042-07-NOTBUILT

**Work-completion notices: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Requirement items: S42.17
- Detail: VS Code: S42.17

## GAP-F042-08-01

**The whole feature is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-08](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-08-important-change-alerts.md)
- Detail: Affects: All six apps. Work needed: Product definition of 'follow', then build on the notice pipeline.
- Evidence: audit/missing/042-proactive-assistance-briefings-and-reflection.md:75-79

## GAP-F042-08-NOTBUILT

**Important-change alerts: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F042-08](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-08-important-change-alerts.md)
- Requirement items: S42.18
- Detail: Web: S42.18; Desktop: S42.18; Mobile: S42.18; CLI: S42.18; VS Code: S42.18; Chrome: S42.18

## GAP-F042-09-01

**No periodic (week or month) delivered recap.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-09](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-09-reflection-and-annual-recap.md)
- Detail: Affects: All apps. Work needed: None while the founder decision holds.
- Evidence: Brief S42.20; docs/decisions/2026-09-27-founder-decisions.md:134

## GAP-F042-09-02

**Annual recap is a rolling 365-day view, no calendar year or share.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-09](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-09-reflection-and-annual-recap.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Product decision, then a year-in-review view.
- Evidence: reflect-service.ts:22-27

## GAP-F042-09-03

**Not on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-09](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-09-reflection-and-annual-recap.md)
- Detail: Affects: Those apps. Work needed: Decide scope per surface.
- Evidence: audit/partial/042-proactive-assistance-briefings-and-reflection.md S42.19, S42.21

## GAP-F042-09-04

**Local chats are not included.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-09](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-09-reflection-and-annual-recap.md)
- Detail: Affects: Mobile Local-mode users. Work needed: On-device recap or a clear statement.
- Evidence: reflect.tsx:104-107; reflect-service.ts reads cloud tables

## GAP-F042-09-05

**Ongoing work and topics rely on keyword rules, so topic accuracy is limited.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-09](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-09-reflection-and-annual-recap.md)
- Detail: Affects: All users. Work needed: Evaluate accuracy; consider a better classifier.
- Evidence: conversation-classification-service.ts:162-187

## GAP-F042-09-NOTBUILT

**Reflection and annual recap: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F042-09](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-09-reflection-and-annual-recap.md)
- Requirement items: S42.19, S42.21
- Detail: CLI: S42.19, S42.21; VS Code: S42.19, S42.21; Chrome: S42.19, S42.21

## GAP-F042-10-01

**Web reminder mounts only on the chat page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Detail: Affects: Web users on other pages. Work needed: Mount at the app shell or document the limit.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:7987 is the only mount found

## GAP-F042-10-02

**Active time does not sync between devices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Detail: Affects: People using several devices. Work needed: Decide whether per-device counting is intended.
- Evidence: TimeFocusReminder.tsx:31; focusActivityStore.ts

## GAP-F042-10-03

**No reminder component in apps/desktop/src; the internal desktop has only settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Detail: Affects: Internal Tauri desktop users. Work needed: Confirm Electron shows the web reminder and, if the Tauri build ships, add one.
- Evidence: CloudTimeFocusSection.tsx; search results

## GAP-F042-10-04

**CLI, VS Code and Chrome have neither break reminders nor quiet-hours holding.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Detail: Affects: Those apps. Work needed: Scope decision per surface.
- Evidence: audit/partial/042-proactive-assistance-briefings-and-reflection.md S42.16, S42.22, S42.23

## GAP-F042-10-05

**Dismissal timing differs between web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Detail: Affects: Consistency. Work needed: Align to one rule.
- Evidence: see states

## GAP-F042-10-NOTBUILT

**Break reminders and Time and focus settings: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F042-10](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-10-break-reminders-and-time-and-focus-settings.md)
- Requirement items: S42.22, S42.23
- Detail: CLI: S42.22, S42.23; VS Code: S42.22, S42.23; Chrome: S42.22, S42.23

## GAP-F042-11-01

**Brief says Chrome missing, but the side panel has a 'Runs' list; CLI and VS Code also list runs while the brief says n/a.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-11](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-11-briefing-history.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Update the audit ledger or document the limits.
- Evidence: schedulesSection.ts:925-937; apps/cli/src/lib.rs:4502; scheduleActions.ts:199

## GAP-F042-11-02

**Mobile per-schedule history is capped at 5 and has no paging; desktop recent list has no paging.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-11](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-11-briefing-history.md)
- Detail: Affects: Mobile, internal desktop. Work needed: Add cursor paging.
- Evidence: ScheduleRunHistory.tsx:269; DesktopCloudSchedules.tsx:519-527

## GAP-F042-11-03

**Mobile hides the real error text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-11](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-11-briefing-history.md)
- Detail: Affects: Mobile users diagnosing failures. Work needed: Decide whether to show the safe summary the server stores.
- Evidence: service.ts:125-131

## GAP-F042-11-04

**No saved editions or briefing-specific view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-11](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-11-briefing-history.md)
- Detail: Affects: All apps. Work needed: Product decision.
- Evidence: No code found; briefing is a schedule template (apps/mobile/src/features/schedules/templates.ts:22 per brief)

## GAP-F042-11-05

**Retention of run rows unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F042-11](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-11-briefing-history.md)
- Detail: Affects: Storage and privacy. Work needed: Confirm and document.
- Evidence: No retention job found in schedule-service.ts
