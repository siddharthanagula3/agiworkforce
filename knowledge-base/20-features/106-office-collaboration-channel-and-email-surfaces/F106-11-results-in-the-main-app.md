---
id: "F106-11"
type: "feature"
title: "Results in the main app"
aliases: ["Results mirrored into the main application (S106.24)", "Slack task conversation", "Task from Slack", "slack_assistant_runs.agent_run_id"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.24"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:pro", "plan:max", "table:web_conversations", "table:cloud_agent_runs", "table:slack_assistant_runs", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F106-07", "F106-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-11 Results in the main app

When a Slack channel mention runs as a task, AGI creates a normal conversation in the web app, saves the request and the final answer there, and creates an agent run marked ready for review. The Slack reply links to it. Answer-mode runs and direct messages are not mirrored. Desktop shows the same web app.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.24](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10624).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a permanent, non-temporary AGI conversation and an agent run for each Slack task, and links the Slack run to it (apps/web/lib/slack/slack-tasks.ts:78-91,121-128,180-190).

**Why it exists.** S106.24: work done from a channel should show up in the main app for review.

**Who uses it.** The Slack user who asked, reviewing results later in AGI.

**Problems it solves**

- Results living only in a Slack thread
- Having no run history or review state for channel work

**Use cases**

- Open the task link from Slack to see steps and result
- Find the conversation in the list and continue it in AGI
- See a task that is waiting for approval or was stopped

## 2. User experience

**Where to find it**

- Web: the conversation list and the Work page reached from the link in the Slack reply (slack-tasks.ts:209-211 builds the 'work' link).
- Web: Settings, Slack, 'Waiting for your approval' shows 'A task from a channel mention' with a 'View task' link (SlackSection.tsx:190-215).
- Desktop: the public Electron desktop shows the hosted web app (doc: AGENTS.md section 5). Other apps: n/a per brief.

**Before you start**

- Task mode run in a channel (answer mode is not mirrored) (slack-assistant.ts:401)
- Account allowed to use AGI Work and Slack (slack-assistant-turn.ts:415-428)

**Screens and controls**

- Conversation titled from the first line of the request, up to 80 characters, or 'Task from Slack' (slack-tasks.ts:26,39-43)
- Link in the Slack answer to the task (slack-assistant.ts:151-155)

**Journey**

1. Linked person mentions AGI in a channel set to task or default.
2. AGI starts the run; once a model route is chosen it creates the conversation, saves the request and creates an agent run (slack-tasks.ts:167-192).
3. Tool steps are journalled to the agent run (slack-tasks.ts:193-195).
4. AGI posts the answer in Slack with the task link.
5. The answer is saved as the assistant message and the run becomes ready_for_review (slack-tasks.ts:216-223).
6. Person opens the task in AGI to review.

**What the person sees and gets**

- Slack answer plus task link
- AGI conversation with user and assistant messages
- Agent run state: ready_for_review, awaiting_approval, cancelled or failed (slack-tasks.ts:222-232)

**Settings**

- Per-channel mode (F106-07) decides whether a task is created

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Normal conversation insert with is_temporary false, owned by the same user and organization (slack-tasks.ts:83-88).
- User message and agent run created; run row linked via attachAgentRun (slack-tasks.ts:121-128,175-190).
- Event journal appended during the run and flushed at settle (slack-tasks.ts:193-195,213).
- Final answer saved; state set to ready_for_review, awaiting_approval, cancelled or failed (slack-tasks.ts:216-238).
- Stop in AGI is honoured during the run (slack-tasks.ts:196-207).

**Incomplete**

- Only task mode is mirrored; answer-mode and DM answers are not saved in AGI (slack-assistant.ts:401).
- The brief cites schedule and trigger files for S106.24 (ScheduleCard, trigger-fire, scheduled-agent-executor); those cover scheduled runs, not Slack tasks. Slack mirroring is a separate path [inferred].
- How the Work page renders a Slack task: unknown (not opened).

**Present but disconnected or switched off**

- Slack itself needs owner setup: app, secrets, migrations (brief S106.13 note).

**Not available**

- Email- and Teams-originated results: no code (F106-09, F106-10)
- Mobile, CLI, VS Code, Chrome: n/a per brief

## 4. Required behaviour

**Established requirements**

- Work the agent does from a channel or host shows up in the main app (run history, results) for review. (source: S106.24)
- A task creates a normal, non-temporary conversation owned by the same user and organization. (source: apps/web/lib/slack/slack-tasks.ts:78-91)
- The Slack run row links to the agent run. (source: apps/web/lib/slack/slack-tasks.ts:121-128)

**Acceptance criteria**

1. A channel task creates one conversation visible in the web app.
2. The conversation is not temporary and belongs to the same user and organization.
3. The final answer appears as an assistant message.
4. The agent run reaches ready_for_review after a normal answer.
5. Stopping the task in AGI cancels the Slack run.
6. A task waiting for approval shows awaiting_approval and a 'View task' link in Settings.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Answer-mode runs probably need no mirror if S106.24 is limited to tasks [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mirror answer-mode runs as run history, with a lighter record.
- [proposed] Correct the brief's code list for S106.24.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | slackTask | `apps/web/lib/slack/slack-tasks.ts` | Creates conversation and agent run, journals events, settles |
| service | slackTaskAvailable | `apps/web/lib/slack/slack-tasks.ts` | Checks Work capability and workspace access |
| service | createCloudAgentRun | `apps/web/lib/services/cloud-agent-run-service.ts` | Creates the agent run |
| service | transitionCloudAgentRun | `apps/web/lib/services/cloud-agent-run-service.ts` | Moves run state |
| service | cloud-agent-event-journal | `apps/web/lib/services/cloud-agent-event-journal.ts` | Records run events |
| service | persistConversationMessage | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Saves messages |
| table | web_conversations | `apps/web/lib/slack/slack-tasks.ts` | Conversation insert at lines 83-88 |
| table | cloud_agent_runs | `apps/web/db/neon/0330_slack_app.sql` | agent_run_id references it (line 155) |
| table | slack_assistant_runs | `apps/web/db/neon/0330_slack_app.sql` | Slack run linked to the agent run |
| service | slack-assistant publishOutcome | `apps/web/lib/slack/slack-assistant.ts` | Posts answer with task link and settles the task |
| service | slack-settings | `apps/web/lib/slack/slack-settings.ts` | Gives approvals a task path |
| screen | SlackSection | `apps/web/features/settings/sections/SlackSection.tsx` | Shows 'View task' link |
| config | productLinkUrl | `packages/contracts/types/src/index.ts` | Builds the 'work' link (imported in slack-tasks.ts:4); exact file: unknown |
| service | account-erasure | `apps/web/lib/server/account-erasure.ts` | Deletes slack_assistant_runs on account erasure |
| test | slack-tasks.thread.test | `apps/web/lib/slack/slack-tasks.thread.test.ts` | Covers conversation reuse |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mention received and a task-mode run row created. | our servers | slack-assistant.ts:367-379 |
| On model route chosen, conversation, user message and agent run are created. | our servers | slack-tasks.ts:167-192 |
| Tool loop runs and envelopes are journalled. | our servers | slack-tasks.ts:193-195 |
| Answer posted to Slack with the task link. | outside service | slack-assistant.ts:151-162 |
| Assistant message saved and run moved to ready_for_review. | our servers | slack-tasks.ts:216-223 |
| Person opens the web app (or the desktop app showing it) to review. | device and our servers | doc: AGENTS.md section 5 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and messages | web_conversations and message tables on our servers | Read by the web app; desktop shows the hosted app | Kept when the Slack link is removed (SlackSection.tsx:616); deleted by account erasure per its table list [inferred] |
| Agent run and event journal | cloud_agent_runs and the journal | Server only | unknown |
| Slack run record | slack_assistant_runs | Server only | Deleted with the installation, link or account (account-erasure.ts:106-107) |

**Models and providers.** Model and provider come from server routing and are stored on the conversation and the agent run (slack-tasks.ts:171-188). Cloud only; no Local or own-key path found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Linked AGI account; conversation owned by that user (slack-tasks.ts:83-88). |
| Permissions | The organization is copied from the link; reads in the Slack path are scoped to user and organization (slack-tasks.ts:135-143). |
| Subscription | Slack and AGI Work capabilities on pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:354,360; slack-assistant-turn.ts:415-428). |
| Limits and metering | Managed compute access check for work (slack-assistant-turn.ts:429-437); rate limits per Slack message (slack-assistant.ts:284-293). Values unknown. |
| Feature flags | WORK capability kill switch (slack-tasks.ts:45-65). |
| Model compatibility | none found in the code specific to mirroring. |
| Provider restrictions | Same Slack rules as F106-07. |
| Local mode | Not applicable: none found in the code for Local; the task runs on our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Conversation not created | Throws 'The task conversation was not created'; the run fails and the person gets a failure notice | slack-tasks.ts:89; slack-assistant.ts:236-254 |
| Awaiting approval | Agent run state awaiting_approval | slack-tasks.ts:225-232 |
| Stopped in AGI | State cancelled and Slack notice | slack-tasks.ts:196-207; slack-assistant.ts:169-177 |
| State write fails | Logged 'The Slack task run state was not recorded' | slack-tasks.ts:233-238 |
| Failure | Run state failed; Slack notice 'I could not finish that answer. Please try again.' | slack-assistant.ts:60,241-254 |
| Empty first line | Title 'Task from Slack' | slack-tasks.ts:41 |
| Offline or retry | Request id slack-task-<run id> ties the agent run to the Slack run; retry handling beyond duplicate events: not handled in the code | slack-tasks.ts:182 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/slack/slack-tasks.thread.test.ts`: conversation creation and reuse for threads
- `apps/web/lib/slack/slack-assistant.approval.test.ts`: parked and resumed task settling

**Test scenarios**

- **Task appears in AGI**
  1. Mention AGI in a task-enabled channel with a request
  2. Open the link in the Slack reply
  - Expected: A non-temporary conversation with the request and answer; run ready_for_review
- **Answer-only channel**
  1. Set channel to answer only
  2. Mention AGI
  - Expected: No new conversation in AGI
- **Approval pending**
  1. Trigger a step needing approval in a task
  - Expected: Settings, Slack shows 'A task from a channel mention' and 'View task'; run state awaiting_approval
- **Stop the task**
  1. Stop the task in AGI while it runs
  - Expected: Slack gets 'You stopped this task in AGI...'; run cancelled
- **Desktop**
  1. Open the desktop app and sign in
  2. Find the conversation
  - Expected: Same conversation as on web

**Where to look when it fails**

- Table slack_assistant_runs columns agent_run_id, status, error
- Table cloud_agent_runs state and conversation_id
- Log 'Slack task could not be settled'
- Log 'The Slack task run state was not recorded'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md)
- Desktop: [70-qa/test-plans/desktop/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/desktop/106-office-collaboration-channel-and-email-surfaces.md)

## 10. Gaps and dependencies

- **Answer-mode and DM answers not mirrored** Affects: Slack users in answer channels and DMs. Evidence: slack-assistant.ts:401. Work needed: Decide scope of S106.24; save run history
- **Brief evidence lists scheduled-run files** Affects: Planning accuracy. Evidence: Brief S106.24 code list. Work needed: Replace with Slack task files
- **No test seen for conversation creation and final message saving** Affects: Quality. Evidence: Only thread test and approval test found in lib/slack. Work needed: Add tests
- **Not run by anyone: no file records a live check** Affects: All. Evidence: No verification record found. Work needed: Run the scenarios with a real Slack app

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- plan:max
- table:web_conversations
- table:cloud_agent_runs
- table:slack_assistant_runs
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F106-07
- F106-08

## Unknown

- How the Work page and conversation list show a Slack task
- Where productLinkUrl is defined
- Retention of agent run journals
- Rate limit values
