---
id: "F106-08"
type: "feature"
title: "Thread continuity"
aliases: ["Conversation-to-session mapping (S106.23)", "Slack thread continuity", "Thread-to-conversation lookup", "findSlackThreadConversation"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.23"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:pro", "plan:max", "table:slack_assistant_runs", "table:cloud_agent_runs", "table:web_conversations", "api:POST /api/webhooks/slack", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-memory-projects-and-context", "F106-07", "F106-11"]
basis: "code inspection"
second_reader: "10 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-08 Thread continuity

In a Slack channel, when a person mentions AGI again inside a thread where AGI already ran a task for them, the new message continues the same AGI conversation. Answer-mode and direct-message runs keep no session; they rebuild context from Slack history. Web only; desktop shows the same hosted app.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.23](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10623).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Maps a Slack thread to one AGI conversation for task-mode runs, so follow-ups add to the same conversation (apps/web/lib/slack/slack-tasks.ts:93-119,167-174). For answers, it re-reads the Slack thread or recent history on each message (apps/web/lib/slack/slack-context.ts:92-122).

**Why it exists.** S106.23 requires each channel thread to map to one persistent agent session so follow-ups continue it. Without it each mention would start a fresh conversation with no memory of the task.

**Who uses it.** A linked Slack user working with AGI in a channel thread.

**Problems it solves**

- Losing earlier work when asking a follow-up
- Many one-off conversations for one thread
- Repeating context in each message

**Use cases**

- Ask AGI to draft a report, then reply in the thread 'make it shorter' with a mention
- Ask a question in a thread and follow up; AGI reads the thread to see earlier messages
- Open the single AGI conversation to see the whole thread's work

## 2. User experience

**Where to find it**

- Slack: reply in the thread of an earlier AGI task and mention the app. A plain reply without a mention is not read: only app_mention and direct-message events are taken up (apps/web/lib/slack/slack-events.ts:67-68).
- Web: the one conversation appears in the normal conversation list; Desktop shows the same hosted web app (doc: AGENTS.md section 5).

**Before you start**

- Channel mode is task (or default) and task is available for the account (slack-assistant.ts:354-362)
- The first message in the thread ran in task mode and created an agent run (slack-tasks.ts:169-192)
- Same AGI person, workspace, installation and channel (slack-tasks.ts:105-117)
- A Pro-or-higher plan: Free and other non-Pro plans are refused for every Slack run, so they get no thread continuity or even answers (packages/contracts/types/src/billing-catalog.ts:341,360; apps/web/lib/slack/slack-assistant-turn.ts:415-421)

**Screens and controls**

- No dedicated control. The thread itself is the control.

**Journey**

1. Person mentions AGI in a channel; task mode starts and a conversation is created titled from the first line (slack-tasks.ts:39-43,171-174).
2. AGI replies in the thread (slack-assistant.ts:99-101).
3. Person mentions AGI again in that thread.
4. AGI looks for the earliest earlier run in the same thread by the same person and reuses its conversation (slack-tasks.ts:93-119).
5. The new request is saved as a user message and a new agent run is created in that conversation (slack-tasks.ts:175-189).
6. AGI answers in the thread.

**What the person sees and gets**

- The answer in the thread with a link to the task (slack-assistant.ts:151-155)
- The AGI conversation grows with each follow-up (slack-tasks.ts:175-179,216-222)

**Settings**

- Per-channel mode (F106-07): answer mode disables sessions
- No setting for context sizes; they are constants (apps/web/lib/slack/slack-config.ts:32-41)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Task runs find an earlier run in the same thread and reuse its conversation; otherwise create one (slack-tasks.ts:167-174).
- Lookup matches thread root as earlier.thread_ts or earlier.message_ts, excludes the current run, and requires same user, organization, installation, channel and a non-deleted conversation (slack-tasks.ts:98-117).
- Answer-mode and DM runs read Slack: thread up to 40 messages (20 in DMs), DM history up to 20 messages within 12 hours, channel history last 10 (slack-context.ts:92-122; slack-config.ts:32-41).
- Task runs also read Slack context: buildSlackTurnContext runs before slackTask, so Slack API reads occur for task runs too, not only answer/DM runs (apps/web/lib/slack/slack-assistant.ts:~385-400).
- The conversation is created in the run's organization with the model from the first routed turn (apps/web/lib/slack/slack-tasks.ts:167-190).

**Incomplete**

- Only task-mode runs get a persistent AGI conversation; answer-mode runs have none (slack-assistant.ts:401; slack-tasks.ts).
- Continuity is per person: another person mentioning AGI in the same thread gets their own conversation, because the lookup requires the same user_id (slack-tasks.ts:109).
- A follow-up needs a mention; thread replies without a mention are ignored (slack-events.ts:67-68).
- Direct messages never use task mode (slackRunModeFor with no policy and task unavailable for DMs, slack-assistant.ts:354-362), so DM threads are answer-only [inferred].
- Overall status is partial on web: task-mode channel runs only; answer-mode and DM runs keep no conversation. Desktop is not separately built, it shows the hosted app (apps/web/lib/slack/slack-tasks.ts:93-119,167-192).

**Present but disconnected or switched off**

- Brief says missing; the code exists for task mode, so the brief is out of date [inferred].

**Not available**

- Teams and email thread continuity: no code (F106-09, F106-10)
- Mobile, CLI, VS Code, Chrome: n/a per brief

## 4. Required behaviour

**Established requirements**

- Each channel conversation or thread maps to one persistent agent session, so follow-ups in the thread continue it. (source: S106.23)
- Only task-mode runs are linked to a conversation; the lookup reuses an earlier run's conversation in the same thread. (source: apps/web/lib/slack/slack-tasks.ts:93-119,170-172)
- Answer-mode runs rebuild context from Slack history each message. (source: apps/web/lib/slack/slack-context.ts:92-110)

**Acceptance criteria**

1. Two mentions in one thread by one person in task mode produce one conversation with both requests.
2. A mention in a new thread or a top-level message creates a new conversation.
3. Another Slack workspace or channel never reuses the conversation.
4. A deleted conversation is not reused; a new one is created.
5. In answer mode no conversation is created and the second answer sees earlier thread messages.
6. Two people in one thread each get their own conversation.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The thread should survive the first run failing: a run with no agent_run_id is skipped by the join [inferred from the join on cloud_agent_runs].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share one conversation per thread across people in the same workspace, if the product wants that.
- [proposed] Also read unmentioned thread replies once AGI has joined a thread.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | findSlackThreadConversation | `apps/web/lib/slack/slack-tasks.ts` | Finds earlier conversation for the thread |
| service | slackTask observer routed | `apps/web/lib/slack/slack-tasks.ts` | Reuses or creates conversation, creates agent run |
| service | slack-assistant answerMessage | `apps/web/lib/slack/slack-assistant.ts` | Chooses task or answer mode, builds task holder |
| service | buildSlackTurnContext | `apps/web/lib/slack/slack-context.ts` | Reads Slack thread or history for context |
| config | SLACK_CONTEXT_LIMITS | `apps/web/lib/slack/slack-config.ts` | Message counts, window, character limits |
| service | readSlackAssistantEvent | `apps/web/lib/slack/slack-events.ts` | Accepts only mentions and DMs; carries thread_ts |
| endpoint | POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Receives Slack events and hands them to the assistant |
| table | slack_assistant_runs | `apps/web/db/neon/0330_slack_app.sql` | Stores channel_id, message_ts, thread_ts, agent_run_id |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-service.ts` | Agent run with conversation_id (created by createCloudAgentRun) |
| table | web_conversations | `apps/web/lib/slack/slack-tasks.ts` | Conversation row inserted for a new thread |
| service | persistConversationMessage | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Saves the request and the answer into the conversation |
| service | slackRunModeFor | `apps/web/lib/slack/slack-channel-policies.ts` | Decides task or answer |
| test | slack-tasks.thread.test | `apps/web/lib/slack/slack-tasks.thread.test.ts` | Covers thread reuse |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Slack posts an app_mention event with thread_ts; server verifies and queues handling after the response. | outside service | apps/web/app/api/webhooks/slack/route.ts:84-91; slack-events.ts:67-68 |
| AGI resolves the link, mode and creates a run row with channel, message and thread timestamps. | our servers | slack-assistant.ts:320-379; slack-runs.ts:177-202 |
| Context is read from Slack's API (thread or history), for task runs as well as answer and DM runs. | outside service | slack-context.ts:92-122; apps/web/lib/slack/slack-assistant.ts:~385-400 |
| When the model route is chosen, the observer looks up an earlier conversation, else inserts one, saves the user message and creates an agent run. A run refused before routing (plan, compute access) gets no agent run, so no agent_run_id is stored and later follow-ups cannot join to it. | our servers | slack-tasks.ts:167-192; slack-assistant-turn.ts:415-437 |
| The answer is saved as an assistant message and the agent run moves to ready_for_review. | our servers | slack-tasks.ts:216-223 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Slack run with thread timestamps and agent_run_id | slack_assistant_runs | Server only | Deleted with the installation or account erasure (apps/web/lib/server/account-erasure.ts:106-107); the agent run link is set null if the agent run goes |
| Conversation and messages | web_conversations and its messages | Available to the web app; desktop shows the same hosted app | Stay after the Slack link is removed (SlackSection.tsx:616 says tasks stay in your tasks) |

**Models and providers.** The model is picked per turn by server routing and stored on the conversation when it is created (slack-tasks.ts:171-174). A follow-up reuses the conversation but picks its model again [inferred from selectRoute running each turn]. No Local or own-key route found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Linked AGI account (slack-assistant.ts:320-338). |
| Permissions | Lookup is limited to the same user and organization (slack-tasks.ts:105-109). |
| Subscription | Task mode needs the Slack and AGI Work capabilities: pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:354,360; slack-assistant-turn.ts:415-428). Free and other non-Pro plans are refused for every Slack run (slack_app uses PRO_TIERS), so no thread continuity or even answers exist for them (packages/contracts/types/src/billing-catalog.ts:341,360; apps/web/lib/slack/slack-assistant-turn.ts:415-421). |
| Limits and metering | Team and user rate limits per message (slack-assistant.ts:284-293); compute access check per turn (slack-assistant-turn.ts:429-437). Values unknown. |
| Feature flags | WORK capability kill switch (slack-tasks.ts:45-65). |
| Model compatibility | none found in the code that is specific to continuity. |
| Provider restrictions | Same Slack rules as F106-07 (Google tools never offered). |
| Local mode | Not applicable: none found in the code for Local; runs on our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Top-level message | No thread, so lookup returns null and a new conversation is made | slack-tasks.ts:97 |
| Earlier conversation deleted | Join requires deleted_at is null; a new conversation is created | slack-tasks.ts:104-108 |
| Earlier run had no agent run | Not found by the join; new conversation | slack-tasks.ts:99-103 |
| Earlier run refused before routing (plan or compute access) | The agent run is created only when the model route is chosen (observer.routed), so a refused run leaves no agent_run_id and later follow-ups cannot join to it | apps/web/lib/slack/slack-tasks.ts:167-190; slack-assistant-turn.ts:415-437 |
| Free or non-Pro plan | Every Slack run is refused, so there is no continuity and no answer | packages/contracts/types/src/billing-catalog.ts:341,360; apps/web/lib/slack/slack-assistant-turn.ts:415-421 |
| Task stopped in AGI | Run settles cancelled and the person gets 'You stopped this task in AGI...' | slack-assistant.ts:63,169-177 |
| Duplicate Slack delivery | Ignored by unique (installation, event id) | slack-runs.ts:186; 0330_slack_app.sql:165 |
| Very long threads | Context bounded to 40 messages, 24000 characters | slack-config.ts:32-41 |
| Offline, timeout | Answer turn aborts after the tool loop budget; person gets 'I could not finish that answer. Please try again.' | slack-assistant.ts:60,234-254 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/slack/slack-tasks.thread.test.ts`: continues the earlier conversation, new thread starts new, lookup limited to same person, workspace, installation, channel and thread

**Test scenarios**

- **Follow-up in thread**
  1. In a task-enabled channel mention AGI with a request
  2. In the thread mention AGI again with a follow-up
  3. Open the AGI web app
  - Expected: One conversation holds both requests and answers
- **New thread**
  1. Mention AGI at top level twice
  - Expected: Two conversations
- **Answer-only channel**
  1. Set channel to answer only
  2. Mention AGI twice in a thread
  - Expected: No conversation in AGI; second answer reflects first via Slack history
- **Reply without mention**
  1. Reply in the thread without mentioning AGI
  - Expected: No run is created
- **Second person**
  1. A different linked person mentions AGI in the same thread
  - Expected: A separate conversation for that person

**Where to look when it fails**

- slack_assistant_runs rows (thread_ts, message_ts, agent_run_id)
- cloud_agent_runs.conversation_id
- Log 'Slack task run state was not recorded'
- Log 'Slack answer failed; the person was told'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/web/106-office-collaboration-channel-and-email-surfaces.md)
- Desktop: [70-qa/test-plans/desktop/106-office-collaboration-channel-and-email-surfaces.md](../../70-qa/test-plans/desktop/106-office-collaboration-channel-and-email-surfaces.md)

## 10. Gaps and dependencies

- **Brief says missing, code exists for task mode** Affects: Planning. Evidence: slack-tasks.ts:93-119,167-192. Work needed: Update brief to partial: web is partial (task-mode channel runs only; answer-mode and DM runs keep no conversation), desktop is not separately built because it shows the hosted app; update the frontmatter, the status table ('not built') and the hands-on test plan line 'none: not built on any app'
- **Answer-mode and DM runs have no persistent session** Affects: Slack users in answer-only channels and DMs. Evidence: slack-assistant.ts:401. Work needed: Decide if S106.23 requires sessions there
- **Continuity is per person, not per thread** Affects: Teams of people in one thread. Evidence: slack-tasks.ts:109. Work needed: Product decision
- **Follow-ups require a mention** Affects: Slack users. Evidence: slack-events.ts:67-68. Work needed: Subscribe to thread message events if wanted
- **No continuity for Teams or email** Affects: Those users. Evidence: No code. Work needed: Build channels first

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- plan:max
- table:slack_assistant_runs
- table:cloud_agent_runs
- table:web_conversations
- api:POST /api/webhooks/slack
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-memory-projects-and-context
- F106-07
- F106-11

## Unknown

- Whether Slack delivers non-mention thread replies to the app (event subscriptions are owner configured)
- How the model is chosen for a follow-up relative to the stored conversation model
- Rate limit values

## Second reader's check

A second reader checked 11 statements of this page against the code: 10 correct, 1 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Wrong (section Frontmatter vs 6):** "Frontmatter: implementation web/desktop 'missing', available_on [], Status table 'not built'; section 9 'Hands-on test plans: none: not built on any app'" The code shows: Web code fully implements thread reuse for task mode (findSlackThreadConversation, routed observer) and has a test file; section 3 itself says so. (apps/web/lib/slack/slack-tasks.ts:93-119,167-192). **Corrected:** Web: partial (task-mode channel runs only; answer-mode and DM runs keep no conversation). Desktop is not separately built, it shows the hosted app. Status table and 'not built on any app' should be updated.

**Facts the page missed**

- Free and other non-Pro plans are refused for every Slack run (slack_app uses PRO_TIERS), so no thread continuity or even answers exist for them: packages/contracts/types/src/billing-catalog.ts:341,360; apps/web/lib/slack/slack-assistant-turn.ts:415-421.
- The conversation is created in the run's organization with model from the first routed turn, and an agent run is created only when the model route is chosen (observer.routed); a run refused before routing (plan, compute access) leaves no agent_run_id, so later follow-ups cannot join to it: apps/web/lib/slack/slack-tasks.ts:167-190; slack-assistant-turn.ts:415-437.
- Task runs also read Slack context (buildSlackTurnContext runs before slackTask), so Slack API reads occur for task runs too, not only answer/DM runs: apps/web/lib/slack/slack-assistant.ts:~385-400.
