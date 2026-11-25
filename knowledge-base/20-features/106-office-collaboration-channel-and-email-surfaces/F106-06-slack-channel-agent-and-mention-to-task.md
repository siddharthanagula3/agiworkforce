---
id: "F106-06"
type: "feature"
title: "Slack channel agent and mention-to-task"
aliases: ["Slack channel agent", "Mention-to-task handoff", "Agent identity distinct from a human account", "AGI Work task from Slack", "@AGI mention", "S106.14", "S106.16", "S106.21"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.14", "S106.16", "S106.21"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:pro", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "F106-05", "table:slack_channel_policies", "table:cloud_agent_runs", "table:web_conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-06 Slack channel agent and mention-to-task

A person mentions the AGI app in a Slack channel it was invited to. It answers in the thread, or, when the person can use AGI Work and the channel allows it, runs the mention as a task with a link to the task. It posts as the app, not as the person. Web service only; setup needed.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.14](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10614), [S106.16](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10616), [S106.21](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10621).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Reads app mentions in channels, builds thread context, applies the channel's mode and tool allow-list, runs an answer or an AGI Work task on the mentioner's account, and replies in the thread as the Slack app (apps/web/lib/slack/slack-assistant.ts:349-417; slack-channel-policies.ts:60-67; slack-tasks.ts:147-241).

**Why it exists.** Briefs S106.14, S106.16 and S106.21 require a channel agent, mention-to-task and a bot identity distinct from the human. Replies read by a whole channel need stricter safety than a DM, so the code treats other people's messages as information, not instructions (slack-assistant-turn.ts:109-112).

**Who uses it.** Teams in Slack. Installers set channel modes; any linked member can mention the app.

**Problems it solves**

- Getting work done where the team already talks.
- Keeping a record: task mentions become AGI Work tasks the person can review.
- Clear authorship: the app posts, with a footer naming who asked.

**Use cases**

- @AGI summarise this thread.
- @AGI research this topic as a task, then open the task link.
- Installer sets a channel to 'Answers only' so no tasks start.
- Installer turns a channel Off.

## 2. User experience

**Where to find it**

- Slack channel: invite the app (/invite) and type @AGI plus the request (SlackSection.tsx workspace card text: 'Add the app, then /invite it to channels. Anyone there can link their account.').
- Web: Settings, Slack app, card 'Slack workspaces you added', per-channel controls (apps/web/features/slack/components/SlackChannelPolicies.tsx).
- Desktop: Cloud settings, Slack, button 'Open Slack app settings' opens the web page (apps/desktop/src/features/settings/cloud/CloudSlackSection.tsx:45). No Slack logic on desktop.
- Mobile, CLI, VS Code, Chrome: nothing found.

**Before you start**

- App installed in the workspace and the app invited to the channel.
- The mentioner has linked their Slack account (same as F106-05) and is on a plan with Chat in Slack; task mode also needs a plan with AGI Work (slack-assistant-turn.ts:422-428).
- For task mode: the Work capability is available and managed compute access allows it (slack-tasks.ts:45-76).

**Screens and controls**

- Per channel select, label 'What AGI may do in <channel>' with options 'Answers and runs tasks', 'Answers only, never starts a task', 'Off: does not answer here' (SlackChannelPolicies.tsx:22-26, 259); a default option when nothing is saved.
- Per channel checkboxes: 'Search and read the web', 'Run code', 'Use connected apps and integrations' (SlackChannelPolicies.tsx:27-31).
- In Slack: answer blocks with a 'View task' button in task mode (slack-messages.ts:177-179).
- Approval card visible only to the asker (ephemeral in channels) with Approve, Deny and 'Review in AGI' (slack-assistant.ts:80-97).

**Journey**

1. 1. Installer adds the app and invites it to a channel; optionally sets the channel's mode and tools in Settings.
2. 2. A linked person types @AGI and the request in the channel. Unlinked people get a private prompt to connect.
3. 3. The bot adds an eyes reaction to the message.
4. 4. The app reads the thread, or the last 10 channel messages, as context information (slack-config.ts:34-41).
5. 5. With no saved policy, the run is a task if tasks are available, else an answer; with a saved mode the mode decides (slack-channel-policies.ts:60-67).
6. 6. The reply is posted in the thread (the mention's own thread if it was top level) with a footer 'For @requester' and a model name.
7. 7. In task mode a 'View task' button opens the task in AGI Work.

**What the person sees and gets**

- Thread reply as the app, text split into blocks of at most 2,900 characters, 4 sections per message (slack-messages.ts:26-28, 159-184).
- 'AGI is turned off in this channel by the person who added it to Slack. You can still message it directly.' shown privately to the asker when the mode is off (slack-assistant.ts:61-62, 363-365).
- 'You stopped this task in AGI, so it has no answer to post.' if the task was stopped (slack-assistant.ts:63).
- The failure notice and rate limit notice as in DMs, sent privately (ephemeral) in channels (slack-assistant.ts:80-97).
- A task conversation and run appear in AGI Work (slack-tasks.ts:167-192).

**Settings**

- Channel mode and tool allow-list per channel, stored per installation and channel (slack_channel_policies, migrations 0374 and 0385).
- Plan and workspace: the person picks which AGI workspace answers when linking (app/slack/link/page.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- App mention events are parsed; mentions in direct message channels are ignored (apps/web/lib/slack/slack-events.ts:68, 80).
- Channel mode lookup and 'off' notice (slack-assistant.ts:349-366); mode choice function (slack-channel-policies.ts:60-67).
- Task mode: creates or reuses a conversation, saves the request, creates a cloud agent run, journals events, honors stop, saves the answer and moves the run to ready for review (slack-tasks.ts:147-241).
- Thread continuity: a follow-up in the same thread reuses the first task's conversation (slack-tasks.ts:93-119; test slack-tasks.thread.test.ts).
- Bot identity: replies use the bot token (slack-api.ts:175-197; encrypted token at slack-installations.ts:87); footer names the requester (slack-messages.ts:165-167).
- Per-channel tool allow-list: web, code and apps; empty list when policy unreadable (slack-channel-policies.ts:44-58; slack-assistant-turn.ts:482-503).
- Approve or deny in Slack by the asker only (slack-interactions.ts:88-120).
- Settings UI to set channel mode and tools (SlackChannelPolicies.tsx).
- Channel text from other people is fenced as untrusted context (slack-context.ts:175-196; slack-assistant-turn.ts:246).

**Incomplete**

- Channel list in Settings shows channel ids (aria-label uses channel.channelId), not names (SlackChannelPolicies.tsx:259); a channel appears only after the app has been mentioned there or a policy exists (slack-channel-policies.ts:103-113).
- Connectors are not offered in channels unless the allow-list includes apps; channel runs start with no connectors (slack-assistant-turn.ts:491).
- Memory is not loaded in channel answers (slack-assistant-turn.ts:521-522).

**Present but disconnected or switched off**

- Off until the Slack app is configured and the plan allows it (same as F106-05).
- Brief marks S106.22 (channel-specific permissions) and S106.23 (conversation-to-session mapping) as missing, but the code has channel policies and thread-to-conversation reuse for tasks. The brief appears stale for those two items; they are outside this feature's item list, so this page does not claim their status.

**Not available**

- Plain channel messages without a mention are not answered by the assistant (slack-events.ts:67-69). Routines can still fire on other Slack events if subscribed (docs/runbooks/connector-oauth-apps.md).
- Desktop, mobile, CLI, VS Code and Chrome have no Slack runtime.
- Local and own-key modes (managed routing only).

## 4. Required behaviour

**Established requirements**

- An agent listens in a Slack channel and acts and reports back when channel messages or events arrive. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S106.14)
- Mentioning the assistant in a channel message turns that message into a task the agent runs. (source: S106.16 (same brief))
- In channels the agent acts under its own bot identity, distinct from the human user. (source: S106.21 (same brief))
- The Slack app uses bot scopes only; event subscriptions include app_mention. (source: doc: docs/runbooks/connector-oauth-apps.md)

**Acceptance criteria**

1. @AGI in an invited channel gets a reply in the thread, authored by the app.
2. A channel set to Off replies privately with the off notice and runs nothing.
3. A channel set to 'Answers only' never creates a task.
4. With no policy and an eligible plan the mention creates an AGI Work task and the reply has a 'View task' button.
5. A follow-up in the same thread continues the same task conversation.
6. A message in the channel without a mention gets no reply.
7. With 'Run code' unchecked the run is not offered code tools.
8. Only the asker can approve a pending step.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The reply footer tells readers who asked, supporting the identity requirement [inferred from slack-messages.ts:165-167].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show channel names in the policy list.
- [proposed] Update the brief rows S106.22 and S106.23 after verification.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Event reader | `apps/web/lib/slack/slack-events.ts` | Accepts app_mention events and sets surface to channel. |
| service | Assistant handler | `apps/web/lib/slack/slack-assistant.ts` | Chooses mode, starts run, posts replies and notices. |
| service | Channel policies | `apps/web/lib/slack/slack-channel-policies.ts` | Reads and writes mode and tool allow-list; slackRunModeFor. |
| service | Tasks | `apps/web/lib/slack/slack-tasks.ts` | Creates AGI Work task, conversation, run journal; thread reuse; settle. |
| service | Turn | `apps/web/lib/slack/slack-assistant-turn.ts` | Channel directive, tool plan from the allow-list, plan checks (slack_app, agi_work). |
| service | Context | `apps/web/lib/slack/slack-context.ts` | Thread or last 10 channel messages as untrusted context. |
| service | Messages | `apps/web/lib/slack/slack-messages.ts` | Blocks, footer naming requester, View task button. |
| service | Slack API client | `apps/web/lib/slack/slack-api.ts` | Posts with the bot token; ephemeral and thread replies; reactions. |
| service | Installations | `apps/web/lib/slack/slack-installations.ts` | Encrypted bot token per workspace; bot user id. |
| service | Run records | `apps/web/lib/slack/slack-runs.ts` | Run rows, stopped-task detection, approval parking. |
| service | Interactions | `apps/web/lib/slack/slack-interactions.ts` | Approve or Deny from Slack. |
| endpoint | POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Receives mention events. |
| endpoint | Channel policy endpoints | `apps/web/app/api/slack/installations/[installationId]/channels/route.ts` | Lists and sets channel policies (route file exists; handlers not read in depth). |
| component | SlackChannelPolicies | `apps/web/features/slack/components/SlackChannelPolicies.tsx` | Per-channel mode and tool controls. |
| screen | SlackSection | `apps/web/features/settings/sections/SlackSection.tsx` | Hosts the policy controls in web Settings. |
| screen | Desktop Slack section | `apps/desktop/src/features/settings/cloud/CloudSlackSection.tsx` | Opens the web settings. |
| table | slack_channel_policies | `apps/web/db/neon/0374_slack_channel_policy_and_agent_credit_cap.sql` | Stores channel mode per installation and channel. |
| table | allowed_tools column | `apps/web/db/neon/0385_slack_channel_tool_allow_list.sql` | Adds the per-channel tool list. |
| service | Cloud agent run service | `apps/web/lib/services/cloud-agent-run-service.ts` | Creates and transitions the task run (cloud_agent_runs) used by task mode. |
| schema | Channel policy contract | `packages/contracts/cloud-contracts/src/slack-channel-policies.ts` | Defines SlackChannelToolListSchema and related types used by the policy code. |
| config | Context limits | `apps/web/lib/slack/slack-config.ts` | Channel messages 10, thread messages 40, max characters. |
| test | Channel policy tests | `apps/web/lib/slack/slack-channel-policies.test.ts` | Mode choice, installer-only, tools saved and read. |
| test | Thread conversation test | `apps/web/lib/slack/slack-tasks.thread.test.ts` | Thread continues one conversation. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Slack posts the mention event; the receiver verifies it and schedules the assistant after acknowledging. | our servers | apps/web/app/api/webhooks/slack/route.ts:36-94 |
| Installation and account link are resolved; unlinked users get a private link prompt in the thread. | our servers | slack-assistant.ts:305-327 |
| The channel's saved mode is read; with no saved policy the system checks whether tasks are available (Work capability and compute access). | our servers | slack-assistant.ts:349-362; slack-tasks.ts:45-76 |
| A run row is written; the bot adds the eyes reaction. | our servers | slack-assistant.ts:367-378, 232 |
| The thread or last 10 channel messages are read from Slack and fenced as untrusted context. | outside service | slack-context.ts:92-120, 175-196 |
| The turn checks plan, access, route, screening and usage; builds the tool plan using the channel allow-list; runs the model. | our servers | slack-assistant-turn.ts:412-642 |
| In task mode a conversation and cloud agent run are created at routing time and events are journaled; the final text is saved as the assistant message and the run set to ready for review. | our servers | slack-tasks.ts:166-223 |
| The reply is posted in the thread with the bot token, with a footer naming the requester and a View task button in task mode. | outside service | slack-assistant.ts:150-166; slack-messages.ts:159-184 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Task conversation and messages | tables web_conversations and its messages; run state in cloud_agent_runs | Server; visible in the AGI Work page on web and through the hosted web app on desktop | Tasks stay in the person's tasks after Disconnect (SlackSection.tsx disconnect text); normal conversation deletion rules apply. |
| Run row with channel, message time and status | table slack_assistant_runs | Server only | Deleted on Disconnect. |
| Channel policy (mode, allowed tools) | table slack_channel_policies | Server only | Cleared when mode is set back to default (slack-channel-policies.ts:156-162). |
| Channel messages used as context | Not stored; read live and put in the prompt [inferred] | not applicable | A task conversation stores the request and the answer only (slack-tasks.ts:175-179, 217-221). |

**Models and providers.** Same managed route admission as F106-05, using the mentioner's plan and workspace model policy. Task mode asks for the agiwork work mode (slack-assistant-turn.ts:286). The run uses the person's account, but the post is authored by the app.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The mentioner must have a linked AGI account; the app identity is the Slack bot, not the person (slack-api.ts:175-197). |
| Permissions | Only the installer can read or change channel policies (slack-channel-policies.ts:69-82). Only the asker can approve (slack-interactions.ts:88-89). Tools offered are limited by the channel allow-list (slack-assistant-turn.ts:489-503). |
| Subscription | Chat in Slack plan tiers for any run; AGI Work plan tiers additionally for task mode (billing-catalog.ts:341,358,360; slack-assistant-turn.ts:415-428). Task mode needs the Work capability and workspace compute access (slack-tasks.ts:45-76). |
| Limits and metering | Same rate limits as DMs (120 per workspace and 12 per user per minute, rate-limit.ts:479-488). Usage workload is 'work' for tasks and 'chat' for answers (slack-assistant-turn.ts:581). Time budget 240 seconds (slack-assistant.ts:234). Approvals expire after 24 hours. |
| Feature flags | Work capability kill switch via WORK_CAPABILITY (slack-tasks.ts:8, 50-62). Same Slack setup settings as F106-05. |
| Model compatibility | Any admitted model; resume after approval needs a model that can still use tools (slack-assistant-turn.ts:506-511). |
| Provider restrictions | Google connector tools are never offered in Slack (slack-assistant-turn.ts:494-503). Media models are refused. |
| Local mode | Not available; the feature runs on our servers with managed routing. Desktop only opens web settings. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Channel off | Private notice; no run created. | slack-assistant.ts:363-366 |
| Policy unreadable on resume | The run gets no tools. | slack-channel-policies.ts:44-58 |
| Channel turned off while waiting for approval | The resume is refused and the task is marked failed. | slack-assistant.ts:497-507; slack-assistant.approval.test.ts:131-160 |
| Task stopped in AGI | Private notice that there is no answer to post; run cancelled. | slack-assistant.ts:169-177 |
| Top-level mention | Reply goes in a thread under the mention. | slack-assistant.ts:99-101 |
| Follow-up in thread | Reuses the earlier task conversation for the same person, workspace and channel. | slack-tasks.ts:93-119 |
| Long answer | Split into multiple messages of up to four sections. | slack-messages.ts:169-182 |
| Timeout or failure | Private failure notice; task marked failed. | slack-assistant.ts:236-254 |
| Private channel | Scope groups:history is requested, so history can be read if the app is a member. | slack-config.ts:14-22 |
| Offline and reconnect | not handled in the code beyond Slack retries. | route.ts:85 |
| Accessibility | Policy select and checkboxes have labels; mobile touch target class is set. | SlackChannelPolicies.tsx:259, 297, SELECT_CLASS |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/slack/slack-channel-policies.test.ts`: Mode choice, installer-only access, saving and reading tools, unreadable policy gives no tools.
- `apps/web/lib/slack/slack-tasks.thread.test.ts`: Thread continues one conversation; new thread starts a new one; scope limits.
- `apps/web/lib/slack/slack-assistant-turn.channel-tools.test.ts`: Allow-list offers all, some, only apps, or no tools.
- `apps/web/lib/slack/slack-assistant.approval.test.ts`: Resume refused when channel turned off; saved tools passed; DM unaffected by channel policy.
- `apps/web/lib/slack/slack-interactions.test.ts`: Approve and Deny click handling.
- `apps/web/features/slack/components/SlackChannelPolicies.test.tsx`: Channel policy controls.
- `apps/web/features/slack/components/SlackChannelPolicies.lifetime.test.tsx`: Policy component lifetime.
- `apps/web/db/neon/slack-channel-policy-and-agent-credit-cap-migration.test.ts`: Migration 0374 shape.
- `apps/web/db/neon/slack-channel-tool-allow-list-migration.test.ts`: Migration 0385 shape.
- `apps/web/app/api/webhooks/slack/route.test.ts`: Receiver checks shared with DMs.

**Test scenarios**

- **Mention gets a threaded answer**
  1. Invite the app to a test channel.
  2. As a linked paid user type '@AGI say hello'.
  - Expected: A threaded reply authored by the app, footer 'For @you', eyes reaction removed.
- **Task mode**
  1. Use an account with AGI Work and no channel policy.
  2. Mention the app with a multi-step request.
  - Expected: Reply has a View task button; the task shows in AGI Work as ready for review.
- **Answers-only channel**
  1. Settings, Slack app, set channel to 'Answers only, never starts a task'.
  2. Mention the app.
  - Expected: A normal answer; no new task.
- **Off channel**
  1. Set the channel to 'Off: does not answer here'.
  2. Mention the app.
  - Expected: Private off notice.
- **Tool allow-list**
  1. Uncheck 'Run code'.
  2. Ask for a calculation that needs code.
  - Expected: The run has no code tool and says so or answers without it.
- **Plain message**
  1. Post in the channel without a mention.
  - Expected: No reply.

**Where to look when it fails**

- Log 'Slack channel tool policy unreadable; the run gets no tools' (slack-channel-policies.ts:53).
- Log 'Slack task could not be settled' and 'The Slack task run state was not recorded' (slack-assistant.ts:147; slack-tasks.ts:235).
- Log 'Slack working reaction was not updated' (slack-assistant.ts:126).
- Tables slack_assistant_runs (status, error codes such as slack_channel_off, task_stopped), slack_channel_policies, cloud_agent_runs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md)

## 10. Gaps and dependencies

- **Needs owner setup of the Slack app and applied migrations before it works.** Affects: All web users and desktop users via the web service.. Evidence: Brief S106.14, S106.16 and S106.21 Unfinished notes; slack-config.ts:57-64.. Work needed: Create the app per docs/runbooks/connector-oauth-apps.md; confirm migrations.
- **Brief rows S106.22 and S106.23 say missing while code exists for channel policies and thread to conversation reuse.** Affects: Planning accuracy.. Evidence: slack-channel-policies.ts; slack-tasks.ts:93-119.. Work needed: Verify live and update the brief.
- **Policy list shows channel ids, not names, and lists only channels seen or with a policy.** Affects: Installers.. Evidence: SlackChannelPolicies.tsx:259; slack-channel-policies.ts:103-113.. Work needed: Resolve channel names (needs a Slack scope not requested today: channels:read is not in slack-config.ts:14-22).
- **No live end-to-end run recorded.** Affects: Release confidence.. Evidence: No log or test file records a live Slack run.. Work needed: Run the scenarios in a test workspace.
- **Plain channel messages without a mention are never answered by the agent.** Affects: Users expecting an always-listening channel agent.. Evidence: slack-events.ts:67-69; brief S106.14 wording 'listens in a Slack channel'.. Work needed: Product decision; the current mention-only design is deliberate [inferred].
- Not built on: Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- F106-05
- table:slack_channel_policies
- table:cloud_agent_runs
- table:web_conversations

## Unknown

- Whether the Slack app and migrations are live in each environment.
- How the channel policy endpoint validates inputs; the channels route was not read in depth.
- Where results mirror in the main app beyond the Work link (brief S106.24 cites other files; not part of this feature).
- Retention of task conversations after a Slack workspace is removed; not read.
