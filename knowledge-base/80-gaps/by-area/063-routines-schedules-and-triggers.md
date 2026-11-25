---
id: "GAPS-AREA-063"
type: "gap-list"
title: "Gaps: Routines, schedules, and triggers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 63. Routines, schedules, and triggers

152 open gaps that touch this area. Area page: [20-features/063-routines-schedules-and-triggers](../../20-features/063-routines-schedules-and-triggers/README.md).

## CMP-C113

**Cloud session from local code when the repo has no remote**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Cloud Code starts only from a GitHub checkout; there is no upload of local files.
- Evidence: apps/cli/src/cloud/code_handoff.rs:29-37,447-463

## CMP-C114

**Cloud session network access level and secrets**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Every cloud session gets one fixed network level and no per-environment secrets are set from the CLI.
- Evidence: apps/cli/src/cloud/code_handoff.rs:11; searched: secret, environment in cloud/code_*

## CMP-C128

**Pick the default cloud environment from the CLI (/remote-env)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Ours /remote-env only prints proxy and API base variables; it picks no environment.
- Evidence: apps/cli/src/claude_parity.rs:1689

## CMP-DP29

**Custom rules and approval tiers for a personal agent**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No free-text custom rules Three approval levels and per-tool Always allow, Needs approval or Blocked exist, but no free-text custom rules.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:52

## CMP-DP34

**Record a workflow once and replay it as a skill (Record and Replay)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: The row's own difference says clicks and typing are not captured (apps/web/features/skill-recorder/components/SkillReco… The row's own difference says clicks and typing are not captured (apps/web/features/skill-recorder/components/SkillRecorder.tsx:54 takes a screenshot every few seconds). The leader records the demonstrated actions and replays them. The same feature is Partial in two other rows ('Record and Replay: t
- Evidence: apps/web/features/skill-recorder/components/SkillRecorder.tsx:54; apps/desktop/electron/recorderOverlayWindow.ts:5

## CMP-DP54

**Scheduled recurring coding tasks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Return text only, without research or media Routines run on a schedule but return text only, without research or media; they do not run repository tasks.
- Evidence: apps/web/features/schedules/components/ScheduleForm.tsx:157; apps/web/features/code/code-surface.ts:routines

## CMP-M204

**Share a scheduled task as a link**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Schedules have no share link or copy-from-link flow.
- Evidence: searched: share in app/(app)/schedules, src/features/schedules

## CMP-M75

**Share a scheduled task by link**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Schedules have no share link or copy-from-link.
- Evidence: apps/mobile/src/features/schedules/components/ScheduleForm.tsx:228-360

## CMP-MP45

**Create a scheduled task**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Repeat choices are once, daily, weekly and monthly, so no hourly A Plus button opens a create form (prompt, model, repeat, time, timezone). Repeat choices are once, daily, weekly and monthly, so no hourly.
- Evidence: apps/mobile/app/(app)/schedules/index.tsx:467; apps/mobile/src/features/schedules/policy.ts:3

## CMP-MP47

**Scheduled tasks page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Only Basic and above can create them Schedules screen lists tasks with filters, templates, run history and event triggers, but only Basic and above can create them; Free gets 0.
- Evidence: apps/mobile/app/(app)/schedules/index.tsx:42; apps/mobile/src/features/drawer/components/DrawerContent.tsx:131; packages/contracts/types/src/billing-catalog.ts:617

## CMP-MP49

**Flexible morning, afternoon or evening schedule windows**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Schedules run in the daily Cloud window, with no morning or evening window choice Exact times through the recurrence picker; schedules run in the daily Cloud window, with no morning or evening window choice.
- Evidence: apps/mobile/src/features/schedules/policy.ts:17; components/RecurrencePicker.tsx

## CMP-MP50

**Monitoring tasks that notify only on changes and stop at an end condition**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: There is no notify-on-change rule or end condition A Monitor topic template makes a recurring task, but there is no notify-on-change rule or end condition.
- Evidence: apps/mobile/src/features/schedules/templates.ts:24

## CMP-MP51

**Scheduled task caps by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Free users cannot schedule at all Caps come from the plan catalog: Free 0, Basic 3, Pro 5, Max 25, Team 10. Free users cannot schedule at all.
- Evidence: packages/contracts/types/src/billing-catalog.ts:617; :644; :663; :683; apps/mobile/app/(app)/schedules/index.tsx:62

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

## CMP-W143

**Admin permissions to browse, build, share and publish agents**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Workspace controls have no switch for building, sharing or publishing agents; only a fixed list of features.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:38-52 (no agents entry)

## CMP-W156

**Duplicate an agent as a draft copy**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: An agent can be exported, imported, transferred or deleted, but there is no duplicate action.
- Evidence: searched: duplicate in apps/web/features/agents; app/api/custom-agents has import and export only

## CMP-W163

**Run an agent from any chat by typing @ and its name**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: An agent opens in its own chat from the Agents page; typing @ in the composer only offers skills.
- Evidence: packages/ui/unified-chat/src/components/SkillMentionPicker.tsx (no agent entries); searched: agentMention

## CMP-W166

**Schedule a task inside an existing chat so results return to that chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Schedules run on their own and are made from a prompt; a run never reports back into the chat it came from.
- Evidence: searched: conversationId, in-chat schedule in apps/web/features/schedules and scheduled-agent-executor.ts:558 (conversationId undefined)

## CMP-W168

**Scheduled runs can publish an artifact**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: A scheduled run returns text results only; it cannot publish a page or site as part of the run.
- Evidence: searched: artifact, publish in apps/web/lib/services/scheduled-agent-executor.ts

## CMP-W169

**Self-hosted cloud environments on your own runners**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Cloud sessions run only on our managed sandboxes.
- Evidence: searched: self-hosted, runners in apps/web/lib and features

## CMP-W171

**Team tasks: shared recurring tasks run by a workspace with approved tools**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Schedules belong to one person; a workspace cannot keep a shared recurring task that teammates edit and run with admin-approved apps.
- Evidence: searched: teamTask, team task, organization schedules in apps/web/features/schedules and app/api/schedules

## CMP-W175

**Cloud task opens your app in a browser to reproduce and verify a fix**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Cloud code sessions run commands only; no browser to start the app and check it.
- Evidence: apps/web/lib/services/cloud-code-agent-tools.ts:451-484 (read file, list files, run command)

## CMP-W225

**Choose which connectors a scheduled task may use**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: The form keeps a connector list (apps/web/features/schedules/components/ScheduleForm.tsx:734), but while connectors are unreleased it shows 'Connectors for scheduled runs are coming soon.' (ScheduleAccessFields.tsx:134-137), and the executor asks connectorsAllowedWithoutRequest with no connector id
- Evidence: apps/web/features/schedules/components/ScheduleForm.tsx:734; apps/web/features/schedules/lib/schedule-form.ts:152

## CMP-WP119

**Active scheduled task limit by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10 Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10.
- Evidence: packages/contracts/types/src/billing-catalog.ts:593; packages/contracts/types/src/billing-catalog.ts:683

## CMP-WP121

**Automations that react to events in any connected app (plugin events)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Triggers fire only for GitHub, Slack, Gmail, Google Calendar and webhooks, not for events from any connected app Triggers fire only for GitHub, Slack, Gmail, Google Calendar and webhooks, not for events from any connected app.
- Evidence: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:58-66; apps/web/app/api/webhooks/

## CMP-WP122

**Cloud code environments: network level, variables, secrets, setup**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: No saved environments, variables or secrets Cloud Code lets each session pick none, trusted or full network access, but no saved environments, variables or secrets.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:163-164; packages/contracts/types/src/cloud-code.ts:4

## CMP-WP123

**Event triggers for a task (GitHub, Slack, Gmail, webhook)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Tasks can fire on GitHub, Slack and webhook events; Gmail and Google Calendar triggers are off while connectors are com… Tasks can fire on GitHub, Slack and webhook events; Gmail and Google Calendar triggers are off while connectors are coming soon.
- Evidence: apps/web/lib/triggers/trigger-types.ts:24; apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:59

## CMP-WP128

**Agents page with Recently used, Built by me and a team directory**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: The Agents page lists your agents and agents shared with you, with no recently used list or workspace-wide directory The Agents page lists your agents and agents shared with you, with no recently used list or workspace-wide directory.
- Evidence: apps/web/features/agents/components/AgentsPage.tsx:220-226

## CMP-WP129

**Builder limits which actions an agent may take in each connected app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Not which actions in each app An agent picks which connected apps it can use, but not which actions in each app; only websites have allow and block lists.
- Evidence: apps/web/features/agents/components/AgentConfigForm.tsx:104-135,273-284

## CMP-WP134

**Pick model, effort, repositories and environment for each scheduled run**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md), [F079-10](../../20-features/079-routing-and-model-neutral-orchestration/F079-10-specialist-workers-with-their-own-model.md)
- Detail: Has no reasoning effort, repository or sandbox environment choice A schedule picks a model and a project or agent, but has no reasoning effort, repository or sandbox environment choice.
- Evidence: apps/web/features/schedules/types/index.ts (model, projectId, agentId; no effort or repo fields)

## CMP-WP136

**Scheduled inbox: unread indicator for runs needing attention**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: No unread marker on the Schedules entry Schedules shows runs with an approval-needed state and recent results, but no unread marker on the Schedules entry.
- Evidence: apps/web/features/schedules/components/RecentScheduleResults.tsx; ScheduleRunHistory.tsx:40-54

## CMP-WP137

**Several tasks at once, and starting tasks from a phone**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x.
- Evidence: packages/contracts/types/src/billing-catalog.ts:622; packages/contracts/types/src/billing-catalog.ts:678

## CMP-WP139

**Start an agent from an API call with an access token**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: An outside system can start an agent run: a trigger must belong to a scheduled task (apps/web/lib/triggers/trigger-serv… An outside system can start an agent run: a trigger must belong to a scheduled task (apps/web/lib/triggers/trigger-service.ts:198-199), a task can be bound to an agent (apps/web/lib/services/schedule-service.ts:705,843), and the trigger gets a signing secret and its own endpoint that accepts any cal
- Evidence: searched: accessToken, apiTrigger in apps/web/app/api/custom-agents and apps/web/app/api/v1

## CMP-WP313

**Always allow tools apply in scheduled tasks and auto-approve**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F059-09](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: I could not confirm they also govern scheduled runs Per-tool Always allow, Needs approval and Blocked exist for connectors; I could not confirm they also govern scheduled runs.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:30-40

## CMP-WP48

**Title menu: Schedule, Turn into skill, Copy session ID**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: There is no Copy session ID Schedule and Save as skill exist on each answer's More menu, not the title menu; there is no Copy session ID.
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:4053-4060

## CMP-X10

**Schedule a saved shortcut to run in the browser**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Dead code. The replay runs only for a locally scheduled task with a shortcutId (apps/extension/src/background.ts:3987-3998), and such a task is created only by the CREATE_SCHEDULED_TASK message (5858), which no page in apps/extension/src sends (the only hits are the handler, types.ts:105 and backgro
- Evidence: apps/extension/src/features/background/scheduled-shortcut-replay.ts:13; apps/extension/src/features/background/tasks.ts:189

## CMP-X9

**Record an animated GIF of the browser work**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: No GIF export; searched: gif in apps/extension/src (only image types).
- Evidence: searched: gif, recordGif in apps/extension/src

## CMP-XP10

**Always asks before downloads, sensitive input and granting access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341) The row text is also wrong: these steps ask in every mode including Full access (apps/extension/src/features/computer-use/askBeforeActing.ts:36, crucialActions.ts:11-30), not only outside it. But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341)
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:11-28

## CMP-XP11

**Approval mode: skip all approvals**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Still asks for protected steps and never completes a purchase Full access skips routine confirmations but still asks for protected steps and never completes a purchase.
- Evidence: apps/extension/src/side_panel.ts:14785-14795; apps/extension/src/features/options/site-permission-policy.ts:12

## CMP-XP20

**Approval mode: automatic with pauses for risky steps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: It does not run a model safety review Auto is the default and asks before crucial steps by fixed rules; it does not run a model safety review.
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:1-45; apps/extension/src/side_panel.ts:14773-14783

## CMP-XP24

**Notice shown when Auto or Full access is on**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: A dismissible notice appears for Full access only, not for Auto A dismissible notice appears for Full access only, not for Auto.
- Evidence: apps/extension/src/side_panel.ts:14909

## CMP-XP6

**Scheduled recurring tasks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: No yearly repeat Cloud schedules once, daily, weekly or monthly with time zone and model; run when the browser is closed; no yearly repeat.
- Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:447; locale spSchedulesRepeat*

## CMP-XP8

**Record your clicks and typing as a shortcut**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Typed values are optional and passwords and card numbers are never kept Start recording on a site, name it and save; typed values are optional and passwords and card numbers are never kept; no voice narration.
- Evidence: apps/extension/src/features/options/shortcuts-section.ts:454; apps/extension/src/background.ts:82

## GAP-AREA063-LW07

**Delete is a hard delete with no Trash step, while the repo rule says removals go to Trash first. The web asks first, but nothing can restore it.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-063
- Detail: Area 63. Routines, schedules, and triggers
- Evidence: apps/web/lib/services/schedule-service.ts:1291-1312

## GAP-AREA063-LW08

**Cron expression via CLI is sent as recurrence 'custom'; the CLI can only make cron schedules, not once or daily.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-063
- Detail: Area 63. Routines, schedules, and triggers
- Evidence: apps/cli/src/schedules.rs:89-110

## GAP-AREA063-LW09

**A manual run is cut at 40 seconds inside the request (timeoutMs 40000, maxDuration 60), so long routines end as timeouts when run now.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-063
- Detail: Area 63. Routines, schedules, and triggers
- Evidence: apps/web/app/api/schedules/[id]/runs/route.ts:80-86

## GAP-AREA063-LW10

**Missing features confirmed in code: no repository field, no per-routine effort field, no pause-until-date, no duplicate, no held run until allowance reset, no connector-expiry repair.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-063
- Detail: Area 63. Routines, schedules, and triggers
- Evidence: apps/web/lib/services/schedule-service.ts:139-167 (ScheduleInput has none of these)

## GAP-CAP-agent-actions-02

**Plan review, questions and approvals during a run: VS Code has no clarification request. A read-only PDF read was labelled high risk when seen on Web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Requirement items: S60.13, S60.18, S60.19, S63.32
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-agent-actions-09

**Custom and workspace agents: No @ mention to run an agent in any chat, no duplicate, no per-action limits in each connector, no admin switch for who may build or publish.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F061-01](../../20-features/061-persistent-agents-and-agent-rosters/F061-01-agent-roster-and-identity.md), [F061-02](../../20-features/061-persistent-agents-and-agent-rosters/F061-02-create-and-manage-agents.md), [F061-03](../../20-features/061-persistent-agents-and-agent-rosters/F061-03-agent-instructions-and-agent-conversation.md), [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Requirement items: S61.02, S61.04, S61.05, S63.09
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-10

**Scheduled tasks and monitoring: Missing: pause until a date, duplicate, deferred run after allowance reset, connection-expiry repair, team shared tasks, scheduling from inside a chat, publishing an artifact from a run. Per-routine effort (S63.10) was ruled not to be built by D-2026-09-27-02, yet cc1**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S63.02, S63.11, S63.12, S63.14, S63.19, S63.20, S63.21, S63.22, S63.24, S63.25, S63.27, S63.28, S63.31, S63.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-11

**Event-triggered tasks: Triggers cover GitHub, Slack and webhooks fully; events from other connected apps are not covered.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Requirement items: S63.15, S63.16, S63.17, S63.18
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-12

**Cloud coding agents and environments: Each session gets one network level and no secrets. No self-hosted runners.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Requirement items: S63.07
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-14

**Approval modes and per-tool permission levels: No notice when Auto is on in Chrome; no free-text standing rules; no per-chat approval for sending messages.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.19, S63.32, S65.23
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-agent-actions-22

**Recorded workflows, shortcuts and scheduled browser tasks: Typed values optional and passwords not recorded; scheduling saved shortcuts missing; no GIF export.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Requirement items: S63.03
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-agent-actions-28

**Usage accounting and limits for agent runs: No spend or time budget for tasks on Web, Desktop or Mobile; held runs do not resume after an allowance reset; Billing showed no renewal info when a limit error pointed to it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S60.10, S61.20, S63.31, S63.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-01

**One-time scheduled task: CLI and Chrome cannot create a one-time schedule in the ledger. A completed one-time task also shows a Paused label (seen defect).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Requirement items: S63.11
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-scheduled-tasks-02

**Recurring schedule with presets: Mobile offers only once, daily, weekly, monthly. Checks run every 15 minutes, so a run may start late.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Requirement items: S63.12, S63.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-scheduled-tasks-03

**Advanced recurrence and time zone: Chrome has no advanced recurrence or time zone. Daylight-saving behaviour has not been run by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Requirement items: S63.13, S63.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-04

**Create a task by describing it in chat: Free chat reply has no Upgrade pointer (seen defect).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Requirement items: S63.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-05

**Turn a finished chat answer or task into a schedule: Mobile and VS Code cannot do it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Requirement items: S63.03
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-scheduled-tasks-07

**Manage tasks: run now, pause, resume, edit, delete: CLI cannot run now or edit. Duplicate task (S63.28) missing everywhere.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Requirement items: S63.19, S63.24, S63.26, S63.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-08

**Scheduled page with next run, last run and unread indicator: Unread indicator partial. Credits differ between card and Recent results (0.2 vs 0.17, seen). A Free account sees a usage meter on the upgrade page, against the owner rule.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Requirement items: S63.20, S63.21
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-09

**Run history and per-run results: 'Open chat' on a result opens an empty chat with the prompt prefilled, not the answer (seen). Chrome has no history list.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Requirement items: S63.22, S63.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-10

**Missed-run and skipped-run explanation: Chrome missing; not run by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S63.33
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-scheduled-tasks-14

**Event triggers (mail, chat, code host, webhook): Mobile ledger and comparison files disagree; some event kinds partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Requirement items: S63.15, S63.17
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-15

**Trigger filters and conditions: Mobile and Chrome cannot set conditions.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Requirement items: S63.16
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-16

**Token-authenticated API trigger: No UI for token management; owner declined routine webhook token creation in the CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Requirement items: S63.18
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-scheduled-tasks-19

**Task result notifications: Mobile channel choice partial; per-task setting vs account-wide setting is inconsistent with owner decision.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Requirement items: S63.30
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-20

**Approval pauses for unattended runs: Always-allow tool rules in scheduled runs only partial (WP313); connection-expiry repair flow (S63.35) missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Requirement items: S63.32
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-scheduled-tasks-21

**Per-task model, sources, connectors and agent: Repository selection missing; Mobile cannot choose sources, connectors or agent; Cloud runs return text only, without research or media.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Requirement items: S63.06, S63.07, S63.08, S63.09, S63.10
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-scheduled-tasks-23

**Budget caps and deferred runs after allowance reset: No deferred execution; Mobile and CLI no budget control.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S63.31, S63.34
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-scheduled-tasks-24

**Share a task by link: Mobile cannot share.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Requirement items: S63.29
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-scheduled-tasks-27

**Isolated worktree or repository for scheduled coding runs: No worktree or repo choice on any app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Requirement items: S63.07
- Detail: Claude yes, ChatGPT yes; AGI not built

## GAP-F063-01-01

**Mobile templates drop the template's sources**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-01](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)
- Detail: Affects: Mobile users picking 'Daily briefing'. Work needed: Carry draft.sources into the mobile draft and create request
- Evidence: apps/mobile/src/features/schedules/templates.ts:24-46 versus schedules.ts:854

## GAP-F063-01-02

**Brief lists Chrome gallery as missing but code has one**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-01](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)
- Detail: Affects: Brief accuracy; Chrome users. Work needed: Correct brief S63.01 status for Chrome to built
- Evidence: apps/extension/src/features/side-panel/schedulesSection.ts:683-695

## GAP-F063-01-03

**ui-gaps GAP-028 names four old mobile templates**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-01](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)
- Detail: Affects: Doc readers. Work needed: Update the audit row to the shared six
- Evidence: audit/registers/ui-gaps.md GAP-028 versus apps/mobile/__tests__/schedule-templates.test.ts

## GAP-F063-01-04

**Template prompts assume connected calendar and email while connectors are coming soon**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-01](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)
- Detail: Affects: Web, mobile, Tauri, Chrome users of meeting prep and daily briefing. Work needed: Product decision on wording until connectors ship
- Evidence: schedules.ts:850; connector-release.ts:14

## GAP-F063-01-05

**No gallery in CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-01](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)
- Detail: Affects: CLI users. Work needed: Product decision; likely not needed
- Evidence: apps/cli/src/lib.rs:1514-1545

## GAP-F063-01-NOTBUILT

**Routine gallery (templates): not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F063-01](../../20-features/063-routines-schedules-and-triggers/F063-01-routine-gallery-templates.md)
- Requirement items: S63.01
- Detail: CLI: S63.01

## GAP-F063-02-01

**Brief says CLI edit is missing; code has agi schedules edit**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: Brief accuracy (CLI). Work needed: Correct brief S63.26 for CLI
- Evidence: apps/cli/src/lib.rs:1553-1572, 4436-4470

## GAP-F063-02-02

**Brief says mobile has no create-from-task; code has 'Make it a routine' from a cloud task**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: Brief accuracy (mobile). Work needed: Correct brief S63.03; add create from a chat answer
- Evidence: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:629

## GAP-F063-02-03

**Brief says Chrome has no create-from-task; code stages a draft from a chat entry**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: Brief accuracy (Chrome). Work needed: Correct brief S63.03 for Chrome
- Evidence: apps/extension/src/side_panel.ts:13121-13127

## GAP-F063-02-04

**CLI can only create cron routines with no sources, connectors or agent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: CLI users. Work needed: Extend create flags or document the limit
- Evidence: apps/cli/src/schedules.rs:73-115

## GAP-F063-02-05

**Chrome edit cannot change timing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: Chrome users. Work needed: Add timing fields to Chrome edit
- Evidence: schedulesSection.ts:1207

## GAP-F063-02-06

**VS Code has no create**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: VS Code users. Work needed: Product decision
- Evidence: apps/extension-vscode/package.json:602-637

## GAP-F063-02-07

**Duplicate routine missing everywhere**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: All apps. Work needed: Build one action
- Evidence: Brief S63.28

## GAP-F063-02-08

**Brief says mobile S63.03 missing but also names 'prompt editor done'; 'create from share link' not found on mobile or Tauri**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Detail: Affects: Mobile, Tauri users. Work needed: Confirm Tauri share flow and add mobile open-link flow
- Evidence: No fromShare handling outside apps/web/features/schedules

## GAP-F063-02-NOTBUILT

**Create a routine (from a prompt, from a chat turn, from a share link): not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md)
- Requirement items: S63.03
- Detail: Mobile: S63.03; VS Code: S63.03; Chrome: S63.03

## GAP-F063-03-01

**Repository selection does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: All apps. Work needed: Design checkout for unattended runs, then add field
- Evidence: No repository field in schedule-service.ts:139-168; brief S63.07

## GAP-F063-03-02

**Reasoning effort per routine does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: All apps. Work needed: Add field, validation, router input and UI
- Evidence: schedule-service.ts:139-168; brief S63.10

## GAP-F063-03-03

**Mobile has no source choice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: Mobile users. Work needed: Add the sources section
- Evidence: No sources under apps/mobile/src/features/schedules

## GAP-F063-03-04

**Tauri lacks Recent chats and agent picker**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: Tauri desktop users. Work needed: Add both
- Evidence: DesktopScheduleAccessFields.tsx:29-38

## GAP-F063-03-05

**Chrome and CLI cannot set sources, connectors or agent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: Chrome, CLI users. Work needed: Add controls or accept as scoped
- Evidence: schedulesSection.ts:727-775; schedules.rs:73-115

## GAP-F063-03-06

**Connector choice is off while connectors are coming soon**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: Web, mobile, Tauri users. Work needed: Follows the connector release
- Evidence: connector-release.ts:14

## GAP-F063-03-07

**Brief says Chrome has no model choice; code has one; brief says mobile has no agent or connectors; code has both**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: Brief accuracy. Work needed: Correct statuses in S63.08, S63.09, S63.10
- Evidence: schedulesSection.ts:518; ScheduleAccessSection.tsx

## GAP-F063-03-08

**Brief cites apps/desktop/electron/config.ts:39 and product-routes.ts:20 as source selection code; they only list allowed hosts and routes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Detail: Affects: Brief accuracy. Work needed: Replace citations
- Evidence: apps/desktop/electron/config.ts:39-47; packages/contracts/types/src/product-routes.ts:19-28

## GAP-F063-03-NOTBUILT

**What a run may use: sources, connectors, agent, model: not built on Web, Desktop, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md)
- Requirement items: S63.07, S63.09
- Detail: Web: S63.07; Desktop: S63.07; VS Code: S63.07, S63.09

## GAP-F063-04-01

**CLI only supports cron**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: CLI users. Work needed: Add other cadences or document
- Evidence: apps/cli/src/lib.rs:1514-1545

## GAP-F063-04-02

**Tauri desktop form omits recurrence rule, event, run windows, retries**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: Tauri desktop users. Work needed: Add or decide to rely on web
- Evidence: DesktopCloudSchedules.tsx:1646-1651

## GAP-F063-04-03

**Chrome cannot edit timing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: Chrome users. Work needed: Add timing edit
- Evidence: schedulesSection.ts:1207

## GAP-F063-04-04

**Brief says Chrome has no time zone; code has a Time zone select**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: Brief accuracy. Work needed: Correct S63.13
- Evidence: schedulesSection.ts:520-524

## GAP-F063-04-05

**Brief says CLI has no one-time (S63.11); true, and brief says cron only done for advanced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: CLI users. Work needed: Add one-time
- Evidence: apps/cli/src/schedules.rs:89-115

## GAP-F063-04-06

**Pause until a date missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: All apps. Work needed: Add field and sweep rule
- Evidence: Brief S63.25

## GAP-F063-04-07

**Fastest cadence is 15 minutes, also late by up to the window**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Detail: Affects: All users expecting exact times. Work needed: Product decision; show expected window on pick
- Evidence: schedule-time.ts:259

## GAP-F063-04-NOTBUILT

**When it runs: one-time, repeating, time zone, advanced rules: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md)
- Requirement items: S63.11, S63.13, S63.14
- Detail: CLI: S63.11; Chrome: S63.11, S63.13, S63.14

## GAP-F063-05-01

**Brief says mobile has no triggers; code has a screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: Brief and matrix accuracy. Work needed: Correct brief S63.15-S63.17 and the matrix
- Evidence: apps/mobile/src/features/schedules/ScheduleTriggersScreen.tsx; docs/product/surface-feature-matrix.md:108 says absent

## GAP-F063-05-02

**Gmail and Calendar triggers off while connectors are coming soon**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: All apps. Work needed: Follows the connector release
- Evidence: trigger-service.ts:302

## GAP-F063-05-03

**API runs recorded as manual, not api**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: Run history readers. Work needed: Pass a trigger source for API callers or drop the unused value
- Evidence: schedule-service.ts:1495-1500; contract enum schedules.ts:248

## GAP-F063-05-04

**No regenerate secret on mobile and Tauri**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: Mobile, Tauri users. Work needed: Add the control
- Evidence: triggersService.ts; DesktopScheduleTriggersPanel.tsx

## GAP-F063-05-05

**API keys rejected on run endpoint; documentation says token-authenticated**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: Developers using API keys. Work needed: Decide whether API keys may start runs
- Evidence: openapi.json BearerAuth description

## GAP-F063-05-06

**CLI daemon triggers and cloud triggers are two systems under one name**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: CLI users. Work needed: Document the difference
- Evidence: daemon.rs:1-10 versus schedules/triggers.rs:1-13

## GAP-F063-05-07

**Brief cites desktop config.ts and product-routes.ts for filters; they hold route lists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: Brief accuracy. Work needed: Replace citations
- Evidence: apps/desktop/electron/config.ts:39-47

## GAP-F063-05-08

**Chrome and VS Code have no triggers**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Detail: Affects: Those users. Work needed: Product decision
- Evidence: Matrix lines 572-580

## GAP-F063-05-NOTBUILT

**Event triggers and webhooks: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F063-05](../../20-features/063-routines-schedules-and-triggers/F063-05-event-triggers-and-webhooks.md)
- Requirement items: S63.15, S63.16, S63.17
- Detail: Chrome: S63.15, S63.16, S63.17

## GAP-F063-06-01

**Brief says CLI run missing; code has agi schedules run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: Brief accuracy. Work needed: Correct S63.19 for CLI
- Evidence: apps/cli/src/lib.rs:1584-1590, 4488-4500

## GAP-F063-06-02

**Brief says Chrome runs list missing; code has a Runs view**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: Brief accuracy. Work needed: Correct S63.22 for Chrome
- Evidence: schedulesSection.ts:1065-1140

## GAP-F063-06-03

**Deferred execution after the allowance resets is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: All apps. Work needed: Design held runs and a resume sweep
- Evidence: Brief S63.34; executor records a cancelled run when access is denied (executor:889-911)

## GAP-F063-06-04

**Connection-expiry repair flow not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: All apps. Work needed: Detect expired connector on run, show on routine, link to reconnect
- Evidence: Brief S63.35

## GAP-F063-06-05

**Mobile shows generic error text**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: Mobile users. Work needed: Show a safe reason
- Evidence: apps/mobile/src/features/schedules/service.ts:132-141

## GAP-F063-06-06

**Manual run is waited inside one request limited to 60 s**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: Long routines on every app. Work needed: Return a pending run and let clients poll
- Evidence: runs route.ts:26, 95

## GAP-F063-06-07

**API-started runs are marked manual**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: History readers. Work needed: Record the real source
- Evidence: schedule-service.ts:1495-1500

## GAP-F063-06-08

**Run notification preferences are web-form only for routines (brief S63.30 CLI missing)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Detail: Affects: CLI users. Work needed: Decide parity
- Evidence: ScheduleForm.tsx:696-710

## GAP-F063-06-NOTBUILT

**Run now and run results: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md)
- Requirement items: S63.19, S63.22
- Detail: CLI: S63.19; Chrome: S63.22

## GAP-F063-07-01

**Pause until a chosen date is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: All apps and users who want a holiday pause.. Work needed: Add a resume-at field, API support, and UI on each app.
- Evidence: Brief S63.25 lists missing on every app; no code found.

## GAP-F063-07-02

**Duplicate routine is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: All apps.. Work needed: Client action that opens create with copied fields.
- Evidence: Brief S63.28; no code found.

## GAP-F063-07-03

**A share link cannot be revoked after its routine is deleted: delete sets the share's task_id to null and only keeps the share, while unshare matches on task_id, and no other revoke route was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: Web and Tauri desktop owners who delete a shared routine.. Work needed: Revoke shares on delete or add an owner-level share list with revoke; tell the person in the delete dialog.
- Evidence: apps/web/db/neon/0311_scheduled_task_shares.sql:15-17, :31; apps/web/lib/services/schedule-share-service.ts:74-84; searched apps/web for other revoked_at writes: none [inferred]

## GAP-F063-07-04

**The delete dialog says the delete is permanent, but offers no recovery; AGENTS section 9 requires a user's data to go to a recoverable place unless the user explicitly names the loss. The dialog does name it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: All apps.. Work needed: Decide whether routines count as user data that needs a trash step; if yes add Recently deleted.
- Evidence: schedule-service.ts:1307-1311; SchedulesPage.tsx:1405-1408

## GAP-F063-07-05

**The internal Tauri desktop delete uses window.confirm, not the shared confirm dialog, and does not mention event triggers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: Tauri desktop.. Work needed: Use useConfirmAction (already used for Stop sharing in the same file, line 727).
- Evidence: apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:747

## GAP-F063-07-06

**Share is Web and Tauri desktop only; the Electron Local routines, Mobile, CLI, VS Code and Chrome have no share.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: Those apps.. Work needed: Add share to each or document web-only.
- Evidence: Brief S63.29 statuses; code search of those apps.

## GAP-F063-07-07

**Edit coverage is uneven: none on VS Code and Local routines; Chrome edits three fields; CLI cannot edit caps, notifications, retries or missed-run policy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: VS Code, Chrome, CLI, Electron Local users.. Work needed: Add the fields or open the web editor from those apps.
- Evidence: scheduleActions.ts:233; schedulesSection.ts:1221-1225; apps/cli/src/schedules.rs:460-482; localRoutineService.ts:190-206

## GAP-F063-07-08

**The brief's S63.26 and S63.27 statuses disagree with the code for CLI edit and Chrome edit (code has them).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: Documentation accuracy.. Work needed: Update the brief rows.
- Evidence: Brief says cli missing and chrome missing for edit; apps/cli/src/lib.rs:1552; schedulesSection.ts:940-953

## GAP-F063-07-09

**Delete is allowed while a run waits for approval.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Detail: Affects: Web, Mobile, CLI, Chrome.. Work needed: Decide if that is intended; the checkpoint is removed with the run by cascade.
- Evidence: schedule-service.ts:1297-1306 checks only running

## GAP-F063-07-NOTBUILT

**Pause, resume, edit, delete, share: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md)
- Requirement items: S63.25, S63.26, S63.28, S63.29
- Detail: Web: S63.25, S63.28; Desktop: S63.25, S63.28; Mobile: S63.29, S63.25, S63.28; CLI: S63.26, S63.29, S63.25, S63.28; VS Code: S63.25, S63.28; Chrome: S63.26, S63.29, S63.25, S63.28

## GAP-F063-08-01

**Credit Cap exists on the Web form only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome, Tauri desktop and Electron Local routines.. Work needed: Add the field or a link to the web editor; add a cap to Local routines.
- Evidence: ScheduleForm.tsx:763; no creditCap in apps/desktop/src/features/schedules or mobile source

## GAP-F063-08-02

**The brief says Desktop has caps; the internal Tauri form has only Maximum executions, and the Electron Desktop shows the Web form.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Desktop documentation and the Tauri build.. Work needed: Correct the brief and decide which desktop code is the product.
- Evidence: DesktopCloudSchedules.tsx:1802-1810 (no cap field)

## GAP-F063-08-03

**Per-routine notification choices cannot be set on CLI, Mobile, VS Code, Chrome or the Tauri form.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Those apps.. Work needed: Add controls or document web-only.
- Evidence: Brief S63.30 (cli missing); no notificationSettings code in those apps

## GAP-F063-08-04

**An expired approval notifies nobody and leaves the routine paused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: All Cloud routine owners who miss the notice.. Work needed: Queue a notice on expiry.
- Evidence: schedule-service.ts:1827 (cancelled not announced), :2441-2457

## GAP-F063-08-05

**Mobile hides the real cancel reason (cap or expiry text).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Mobile users.. Work needed: Show the stored message for cancelled runs.
- Evidence: apps/mobile/src/features/schedules/service.ts:126-131

## GAP-F063-08-06

**The cap is only enforced between runs, so one run can overshoot.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Owners with expensive prompts.. Work needed: Optional: reserve against the remaining cap before a run.
- Evidence: ScheduleForm.tsx:772 helper text; schedule-service.ts:2238

## GAP-F063-08-07

**Tools that would ask are withheld (web search, code execution), not paused for, so the run may complete without them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Routines that rely on those tools under an Ask policy.. Work needed: Decide whether to pause for approval instead; the output note is the only signal.
- Evidence: scheduled-agent-executor.ts:263-333, :374-400

## GAP-F063-08-08

**Local routines have no credit cap.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Detail: Affects: Desktop Local routine owners using paid models via the cloud.. Work needed: Define how a cap applies to device-run sessions.
- Evidence: localRoutineEngine.ts:74-75

## GAP-F063-08-NOTBUILT

**Cost and safety controls: caps, notifications, approvals: not built on Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, Chrome
- Features: [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Requirement items: S63.30, S63.31
- Detail: Mobile: S63.31; CLI: S63.30, S63.31; Chrome: S63.31

## GAP-F063-09-01

**Held run after the usage allowance resets is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: All apps; paid and Free users who hit an allowance.. Work needed: Define the hold state, the reset time source, and the resume job; show it in history.
- Evidence: Brief S63.34; no hold code found in schedule-service.ts or scheduled-agent-executor.ts

## GAP-F063-09-02

**Expired connector repair flow is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: All apps; routines with connectors.. Work needed: Detect an expired connector at run time, mark the routine, and link to the reconnect screen.
- Evidence: Brief S63.35; no reconnect handling found in the schedule feature code read

## GAP-F063-09-03

**Missed and retry settings can be set only on the Web form (and Electron Local missed choice).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome, Tauri desktop users.. Work needed: Add fields or document web-only.
- Evidence: No such fields in those apps' schedule code

## GAP-F063-09-04

**CLI does not label a skipped run as skipped; Mobile replaces the cancelled error text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: CLI and Mobile users.. Work needed: Use the shared note wording.
- Evidence: apps/cli/src/schedules.rs:489-499; apps/mobile/src/features/schedules/service.ts:126-131

## GAP-F063-09-05

**The brief says Chrome has no missed-run note, but code has one; its run history also exists although the brief marks it missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: Documentation accuracy.. Work needed: Update brief rows S63.22 and S63.33.
- Evidence: schedulesSection.ts:1067-1090

## GAP-F063-09-06

**No notice when a routine silently stops because its owner left the workspace.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: Workspace routines.. Work needed: Show a reason on the routine and tell an admin.
- Evidence: schedule-service.ts:1317-1335 logs only

## GAP-F063-09-07

**The missed-run grace is a fixed multiple of the sweep, not a user setting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: Owners who want a tighter or looser rule.. Work needed: Decide whether to expose it; rate limits and similar values should be configuration (doc: AGENTS.md section 8).
- Evidence: schedule-service.ts:83-85

## GAP-F063-09-08

**No test title found that checks the Chrome missed note or the CLI ran-late line.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Affects: Test coverage.. Work needed: Add tests.
- Evidence: Searched apps/extension/__tests__ and apps/cli/src/schedules.rs test titles

## GAP-F063-09-NOTBUILT

**Missed runs, retries and held runs: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S63.34, S63.35
- Detail: Web: S63.34, S63.35; Desktop: S63.34, S63.35; Mobile: S63.34, S63.35; CLI: S63.34, S63.35; VS Code: S63.34, S63.35
