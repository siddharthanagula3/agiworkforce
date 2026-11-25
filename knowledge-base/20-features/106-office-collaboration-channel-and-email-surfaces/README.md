---
id: "AREA-106"
type: "area"
title: "Office, collaboration-channel, and email surfaces"
features: ["F106-01", "F106-02", "F106-03", "F106-04", "F106-05", "F106-06", "F106-07", "F106-08", "F106-09", "F106-10", "F106-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 106. Office, collaboration-channel, and email surfaces

This area lets a person reach the AI assistant from outside the AGI apps: in Slack (direct messages, and mentions in channels), and in the document and mail tools they already use. Today only the Slack part has code, and it runs on the server in the web app. Each Slack message becomes an assistant run, and the answer is posted back in Slack, with approvals for risky steps. The Office add-ins, Google Workspace add-ins, Microsoft Teams and email-to-agent items have no code in this project (checked by search, see not_sure).

**Who uses it.** Slack workspace members who link their own AGI account (the link is made by a one-time link message, apps/web/lib/slack/slack-links.ts and slack-assistant.ts:320-327). The person who installed the app in a workspace (the only one who can change channel settings, apps/web/lib/slack/slack-channel-policies.ts:69-82). Paid plans only: Settings > Slack is gated by the slack_app plan capability (apps/web/lib/slack/slack-settings.ts:26-35). Task mode also needs the Work capability and managed compute access (apps/web/lib/slack/slack-tasks.ts:45-76). Developers and the owner set up the Slack app and its secrets (docs/runbooks/connector-oauth-apps.md:275-319).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F106-01](F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md) | Office add-in assistant pane (Word, Excel, PowerPoint, Outlook) | no | no | n/a | n/a | n/a | n/a |
| [F106-02](F106-02-google-docs-sheets-and-slides-assistant.md) | Google Docs, Sheets and Slides assistant | no | no | n/a | n/a | n/a | n/a |
| [F106-03](F106-03-selection-tracked-edits-protected-ranges-and-cross.md) | Selection, tracked edits, protected ranges and cross-file references in host documents | no | no | n/a | n/a | n/a | no |
| [F106-04](F106-04-handoff-between-host-apps-and-the-standalone-app.md) | Handoff between host apps and the standalone app | no | no | n/a | n/a | n/a | no |
| [F106-05](F106-05-slack-direct-message-assistant.md) | Slack direct-message assistant | partly | no | n/a | n/a | n/a | n/a |
| [F106-06](F106-06-slack-channel-agent-and-mention-to-task.md) | Slack channel agent and mention-to-task | partly | no | n/a | n/a | n/a | n/a |
| [F106-07](F106-07-per-channel-controls-and-approvals-in-slack.md) | Per-channel controls and approvals in Slack | partly | partly | n/a | n/a | n/a | n/a |
| [F106-08](F106-08-thread-continuity.md) | Thread continuity | partly | partly | n/a | n/a | n/a | n/a |
| [F106-09](F106-09-microsoft-teams-assistant.md) | Microsoft Teams assistant | no | no | n/a | n/a | n/a | n/a |
| [F106-10](F106-10-email-to-agent.md) | Email-to-agent | no | no | n/a | n/a | n/a | n/a |
| [F106-11](F106-11-results-in-the-main-app.md) | Results in the main app | built | built | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md).

## How this area works in the code

1. **Slack sends an event to the web app.** Slack posts to /api/webhooks/slack. The handler rate-limits the request (trigger-webhook), reads the body (limit 256 KB), and checks the Slack signature against SLACK_SIGNING_SECRET. If the secret is missing it refuses with 503. It answers the one-time URL check with the challenge. Non-event callbacks get 'received'. (`apps/web/app/api/webhooks/slack/route.ts:41`, `apps/web/app/api/webhooks/slack/route.ts:49-63`, `apps/web/app/api/webhooks/slack/route.ts:72-74`, `apps/web/app/api/webhooks/slack/route.ts:16-17`)
2. **The event is filtered.** readSlackAssistantEvent keeps direct messages and app mentions. It drops bot messages, most subtypes, empty text and code-only messages. It also handles app uninstall and token revoked events. A mention in a direct-message channel is dropped. (`apps/web/lib/slack/slack-events.ts:46-99`, `apps/web/lib/slack/slack-events.ts:67-85`, `apps/web/app/api/webhooks/slack/route.ts:84`)
3. **Handler runs after the reply is sent.** Slack gets its acknowledgement first. The assistant handler then runs in an after() callback, so Slack does not retry while the answer is being made. Every event is also passed to the trigger ingest, which is a separate path for routines. (`apps/web/app/api/webhooks/slack/route.ts:86-91`, `apps/web/app/api/webhooks/slack/route.ts:93-99`)
4. **Account link and channel policy checks.** The workspace installation is found by team id. The Slack user is resolved to an AGI account. If unlinked, a link prompt is sent. If the channel is off, a notice is sent. The run mode (answer or task) is chosen from the channel policy and task availability. (`apps/web/lib/slack/slack-assistant.ts:305-327`, `apps/web/lib/slack/slack-assistant.ts:349-366`, `apps/web/lib/slack/slack-channel-policies.ts:60-67`, `apps/web/lib/slack/slack-links.ts:66`)
5. **Run row is started, idempotently.** A run row is inserted per installation and Slack event id, so a repeated delivery does nothing. The working reaction is added to the message. (`apps/web/lib/slack/slack-assistant.ts:367-379`, `apps/web/lib/slack/slack-runs.ts:177-186`, `apps/web/lib/slack/slack-assistant.ts:113-128`)
6. **Context is built from Slack history.** Thread messages (or the last 12 hours of direct messages) are read from Slack with the bot token. Text is cleaned and limited. Task mode creates or reuses a conversation when the route is chosen. (`apps/web/lib/slack/slack-assistant.ts:389-399`, `apps/web/lib/slack/slack-context.ts:92-110`, `apps/web/lib/slack/slack-api.ts:273-300`, `apps/web/lib/slack/slack-tasks.ts:163-176`)
7. **The turn runs under the person's account.** Content is checked (moderation, the user's content-safety preference, secret handling). A model route is chosen through managed-cloud admission. The request runs in work mode for tasks. Output streams into the run. Tools are limited to the channel allow-list. (`apps/web/lib/slack/slack-assistant-turn.ts:367-394`, `apps/web/lib/slack/slack-assistant-turn.ts:326-365`, `apps/web/lib/slack/slack-assistant-turn.ts:262-324`, `apps/web/lib/slack/slack-assistant-turn.ts:408`, `apps/web/lib/slack/slack-assistant.ts:409`)
8. **The answer or approval is posted to Slack.** An answer is split into Slack blocks and posted in the thread, then the run is marked completed. If approval is needed, an ephemeral (private to the person) approval message with Approve and Deny buttons is posted, a notification is recorded, and the run waits. A click goes to the interactions webhook and resumes the run. Any failure posts a generic notice and marks the run failed. (`apps/web/lib/slack/slack-assistant.ts:134-166`, `apps/web/lib/slack/slack-assistant.ts:178-206`, `apps/web/app/api/webhooks/slack-interactions/route.ts:24-30`, `apps/web/lib/slack/slack-interactions.ts:62-91`, `apps/web/lib/slack/slack-assistant.ts:223-258`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/webhooks/slack/route.ts` | Slack Events API receiver: signature check, challenge answer, hands events to the assistant and trigger ingest. |
| `apps/web/lib/slack/slack-events.ts` | Decides which Slack events are assistant messages (direct messages and mentions) and which are app-uninstall or token-revoke events. |
| `apps/web/lib/slack/slack-assistant.ts` | Main Slack flow: link check, channel mode, run start, answer or approval posting, failure notices. |
| `apps/web/lib/slack/slack-assistant-turn.ts` | Runs the assistant turn: content checks, model route, streaming output, approval pause and resume. |
| `apps/web/lib/slack/slack-context.ts` | Builds the conversation from Slack history (thread or direct-message window) with size limits. |
| `apps/web/lib/slack/slack-api.ts` | Calls to the Slack Web API: post message, ephemeral message, reactions, read thread and history, rate-limit retry. |
| `apps/web/lib/slack/slack-config.ts` | Bot scopes, environment reads (Slack app id, secret, app origin), context limits, TTLs and the working reaction name. |
| `apps/web/lib/slack/slack-channel-policies.ts` | Per-channel mode (off, answer, task), tool allow-list, and installer-only writes. |
| `apps/web/lib/slack/slack-tasks.ts` | Task mode: creates the AGI conversation, reuses a thread's conversation, settles the task. |
| `apps/web/lib/slack/slack-interactions.ts` | Reads Approve and Deny clicks and decides the approval. |
| `apps/web/lib/slack/slack-links.ts` | Links a Slack user to an AGI account through a one-time link request. |
| `apps/web/features/slack/components/SlackChannelPolicies.tsx` | Settings UI for channel mode and tools (web only). |

## What is stored

- Workspace install: team id, scopes, bot user id, app id, bot token stored encrypted: Table public.slack_installations (apps/web/db/neon/0330_slack_app.sql:31); written by apps/web/lib/slack/slack-installations.ts:81-91
- Link requests: token stored only as a SHA-256 hash, one per Slack user per workspace: Table public.slack_link_requests (apps/web/db/neon/0330_slack_app.sql:63-71)
- Slack user to AGI account links: Table public.slack_account_links (apps/web/db/neon/0330_slack_app.sql:82)
- One row per Slack event that starts a run: channel, thread, message time, surface, mode, status, approval expiry: Table public.slack_assistant_runs (apps/web/db/neon/0330_slack_app.sql:140); inserted by apps/web/lib/slack/slack-runs.ts:177-186
- Per-channel mode and allowed tools: Table public.slack_channel_policies (apps/web/db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql:28-45) plus allowed_tools column (apps/web/db/neon/0385_slack_channel_tool_allow_list.sql:18-24)
- Task conversation (not temporary) and the agent run it belongs to: Tables web_conversations and cloud_agent_runs (apps/web/lib/slack/slack-tasks.ts:83-88 and 135)
- Approval notice for the account owner: Notification service, recordNotification (apps/web/lib/slack/slack-assistant.ts:193-204)
- Slack message text used as context is read from Slack on demand and not kept by this code path: apps/web/lib/slack/slack-context.ts:92-110 and apps/web/lib/slack/slack-api.ts:273-300

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **SLACK_SIGNING_SECRET**: Without it, every Slack event is refused with 503; with a wrong value, 401. (apps/web/app/api/webhooks/slack/route.ts:49-63; name defined in apps/web/lib/triggers/trigger-signatures.ts:6)
- **SLACK_APP_CLIENT_ID and SLACK_APP_CLIENT_SECRET**: Both needed for the install (OAuth) flow; without them Settings > Slack reports unavailable. (apps/web/lib/slack/slack-config.ts:52-56; apps/web/app/api/slack/install/route.ts:42-47)
- **NEXT_PUBLIC_APP_URL**: Must be https, or http on localhost. Otherwise links, OAuth and replies are refused and messages are not answered. (apps/web/lib/slack/slack-config.ts:58-69; apps/web/lib/slack/slack-assistant.ts:300-304)
- **Connector token storage availability**: Needed for Slack to be configured at all. (apps/web/lib/slack/slack-config.ts:71-78)
- **slack_app plan capability**: Decides whether the workspace may use Slack on the plan. (apps/web/lib/slack/slack-settings.ts:26-35)
- **Work capability and managed compute access**: Decides whether a channel run may be a task; otherwise it is an answer. (apps/web/lib/slack/slack-tasks.ts:45-76; apps/web/lib/slack/slack-channel-policies.ts:60-67)
- **Channel mode (off, answer, task)**: off stops answers in that channel; answer never runs tasks; task runs tasks when allowed. (apps/web/lib/slack/slack-channel-policies.ts:60-67; apps/web/lib/slack/slack-assistant.ts:349-366)
- **Channel tool allow-list**: Limits the tools a channel run may use; an unreadable list gives no tools. (apps/web/lib/slack/slack-channel-policies.ts:22-26 and 44-58; apps/web/lib/slack/slack-assistant.ts:409)
- **Rate limits**: Per workspace and per Slack user limits on assistant messages; per-event rate limit on the webhook. (apps/web/lib/slack/slack-assistant.ts:284-293; apps/web/app/api/webhooks/slack/route.ts:41)
- **Context limits**: How many messages, pages and characters the assistant reads from Slack. (apps/web/lib/slack/slack-config.ts:32-41)
- **Approval window (24 hours) and link window (15 minutes)**: How long an approval or a link request stays valid. (apps/web/lib/slack/slack-config.ts:28 and 30; used in apps/web/lib/slack/slack-runs.ts:256 and slack-links.ts:123)
- **Answer time budget**: Caps how long one answer may run. (apps/web/lib/slack/slack-assistant.ts:234 (CHAT_TOOL_LOOP_BUDGET_MS from apps/web/lib/deadline-policy))
- **Bot token scopes**: The permissions the Slack app asks for at install. (apps/web/lib/slack/slack-config.ts:13-21)
- **Settings > Slack section**: Shows the Slack section only when the workspace has the plan capability. (apps/web/features/settings/lib/web-settings-sections.ts:39; apps/web/lib/slack/slack-settings.ts:61-69)

## Shared between apps

Server logic for Slack is all in apps/web/lib/slack and apps/web/app/api/slack and apps/web/app/api/webhooks/slack*, used only by the web app. The desktop app has no Slack code in apps/desktop/src (only a type in apps/desktop/src/types/mcp.ts); it reaches Slack features through the hosted web app. Settings UI is in apps/web/features/slack and apps/web/features/settings/sections/SlackSection.tsx. Shared contracts come from @agiworkforce/cloud-contracts (channel tool list schema, Slack contract constants in apps/web/lib/slack/slack-contract.ts). Chrome, VS Code, CLI and Mobile have no code for any item in this area. Microsoft 365 and Google connector code exists under apps/web/lib/connectors (for example microsoft-graph.ts), but it is a data connector, not an Office add-in or email handler.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief status says S106.20 (channel approvals) is missing on web and desktop, but Slack approvals are implemented: a private approval message with buttons, a notification, and a click handler. Only Teams and email approvals are missing. (apps/web/lib/slack/slack-assistant.ts:178-206; apps/web/lib/slack/slack-interactions.ts:62-91; apps/web/app/api/webhooks/slack-interactions/route.ts:24-30)
- Brief status says S106.22 (channel-specific permissions) is missing, but per-channel mode and tool allow-list exist. Writes are limited to the installer, and a channel with no policy defaults to task mode when tasks are available. (apps/web/lib/slack/slack-channel-policies.ts:60-67 and 69-82; apps/web/lib/slack/slack-assistant.ts:349-366)
- Brief status says S106.23 (thread to session) is missing, but thread reuse exists for task mode only. Answer mode rebuilds context from Slack each time. (apps/web/lib/slack/slack-tasks.ts:93-119 and 170-172; apps/web/lib/slack/slack-context.ts:92-110)
- Brief runbook pointer for the Slack app setup (docs/runbooks/connector-oauth-apps.md:249-256) points into the Microsoft 365 section. The Slack section is at lines 275 and 296-319. (docs/runbooks/connector-oauth-apps.md:245-256 (Microsoft 365) and :275-319 (Slack))
- Brief code pointers for S106.24 do not show result mirroring. ScheduleCard lines are Edit and related buttons; trigger-fire.ts:135 is replay handling; scheduled-agent-executor.ts:588 is pricing; manifest-store.ts:54 writes context manifests. The real mirror is the non-temporary conversation created in slack-tasks.ts:78-91. (apps/web/features/schedules/components/ScheduleCard.tsx:400-412; apps/web/lib/triggers/trigger-fire.ts:128-140; apps/web/lib/services/scheduled-agent-executor.ts:582-592; packages/platform/context-engine/src/manifest-store.ts:48-58)
- Brief code pointers for S106.16 are off: slack-assistant.ts:340 is the rate-limit check and 379-380 are the no-run return. The mode choice and task creation are at slack-assistant.ts:349-366 and 401. (apps/web/lib/slack/slack-assistant.ts:340, 379-380, 349-366, 401)
- Desktop is marked partial for Slack, but no Slack code exists in the desktop source tree. The partial status depends on the hosted web app. (apps/desktop/src/types/mcp.ts (only Slack reference found under apps/desktop/src))
- Every Slack event, including direct-message text, is also passed to the trigger ingest, even when the assistant ignores it. Where the trigger ingest keeps that data was not read. (apps/web/app/api/webhooks/slack/route.ts:93-99)

## Not established

- Whether the Slack app is live in production: the brief says the owner must create the Slack app and set three secrets, and that migration 0333 must be applied before deploy. I did not check the environment or the migration status. Note: the brief's migration 0333 is slack_run_cancel_and_delete.sql, and 0330 is the table-creating migration.
- Teams, Outlook, Word, Excel, PowerPoint, Google Docs, Sheets and Slides add-ins, and email-to-task: I searched apps, packages and services for Office.js, Outlook, Teams bot, inbound email and Google add-in terms and found no such code. The search was not exhaustive; no add-in manifest was checked under the desktop or chrome folders.
- Whether the 24-hour approval window is enforced on every path: the constant is in slack-config.ts:30 and used in slack-runs.ts:256, but I did not read the expiry handling.
- What happens to the event text passed to the trigger ingest (apps/web/lib/triggers/trigger-ingest.ts), including storage and retention.
- Plan tiers that include slack_app: the capability table in packages/contracts was not read.
- Whether the Slack interactions route verifies the signing secret the same way as the events route; I read the file header and the handler start only.
- Desktop and Chrome behaviour for S106.25 and the Chrome items (09 to 11, 25): no code was found; the brief status is taken as given.
- No builds, tests, installs or servers were run (read-only task). No localhost check was done, so nothing here is verified by running the app.
