---
id: "F061-08"
type: "feature"
title: "Escalation to the user"
aliases: ["Escalation to the user", "Human escalation (S61.18)", "Approval needed alert", "Agent run notification", "agent_approval_needed", "input_required", "/team <name> answer"]
area: "61 Persistent agents and agent rosters"
available_on: ["web", "mobile", "cli"]
implementation: {web: "partial", desktop: "missing", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.18"]
depends_on: ["surface:cli", "surface:mobile", "surface:web", "mode:cloud", "mode:local", "file:apps/web/lib/services/agent-notification-service.ts", "table:cloud_agent_runs", "F061-14", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-08 Escalation to the user

When an agent needs a decision, it stops and asks. In the CLI the approval prompt appears in the chat, prefixed with a teammate's name. For Cloud runs the server writes a feed notification and sends a push, and Mobile opens the Tasks screen on tap. Desktop, VS Code and Chrome have none.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.18](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6118).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets an agent hand a decision to the person and wait. CLI teammates ask through a send_message to 'user' or a named approval prompt. Cloud agent runs record a feed notification and push 'Approval needed' or 'Your agent has a question'. (apps/cli/src/teams.rs:644-648,669-678; apps/web/lib/services/agent-notification-service.ts)

**Why it exists.** Agents must not take risky actions alone, and a person away from the screen must still find out. (brief S61.18)

**Who uses it.** CLI team users, and Mobile and Web users running Cloud agent runs.

**Problems it solves**

- A paused run waiting silently for approval.
- Not knowing which teammate is asking (name prefix, apps/cli/src/teams.rs:675-678).
- Duplicate 'finished' alerts when a step retries (dedupe key, agent-notification-service.ts).

**Use cases**

- A CLI teammate 'alice' wants to run a shell command; the prompt reads 'alice: ...'.
- A teammate asks 'ship it?'; the thread shows 'alice asks you' and 'Answer with /team alice <your answer>.'
- A Cloud run pauses on a tool; the phone buzzes 'Approval needed' and tapping opens Tasks on that run.
- A Cloud run fails; the phone shows 'Agent run failed'.

## 2. User experience

**Where to find it**

- CLI: the approval prompt in the chat; /team <name> <answer> to reply. (apps/cli/src/teams.rs:609-621,838)
- Mobile: push notification, the notification centre, and the Tasks screen (route /(app)/tasks, component CloudTasksScreen). (apps/mobile/app/(app)/tasks.tsx; apps/mobile/src/features/tasks/CloudTasksScreen.tsx)
- Web: in-app notification feed and browser web push, sent by the server; the web screen that resolves the approval was not examined: unknown.
- Desktop, VS Code, Chrome: not found; brief marks missing.

**Before you start**

- CLI: --team session with a teammate.
- Mobile: signed in, app in Cloud mode, Cloud unlocked for the user, and the cloudTasks feature allowed, for the run to open. (apps/mobile/app/(app)/tasks.tsx:11-18; apps/mobile/services/notifications.ts:345,462)
- Push: a registered device or browser. If none, nothing is sent (test: reports not pushed when no device).

**Screens and controls**

- CLI: approval prompt text and /team <name> <answer>.
- Mobile Tasks screen with approval controls (onResolveApproval) and a note 'Approval alerts are off. Paused tasks wait silently while the app is closed.' when alerts are off. (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:73,840)
- Preference key mobilePushAgentActivity, set from mobile notification settings (useAgentActivityPushSync); label text unknown.

**Journey**

1. Agent reaches a step needing approval or input.
2. CLI: prompt appears, with the teammate name first. Cloud: run state becomes awaiting_input and the server announces the event.
3. Server writes a feed row (category agent_run) and sends push to Expo (mobile) and web push.
4. Person taps the push; Mobile opens Tasks with runId and loads the run.
5. Person approves or answers; the agent continues.

**What the person sees and gets**

- Push titles: 'Approval needed', 'Your agent has a question', 'Agent run finished', 'Agent run failed' with body text naming the tool when known. (agent-notification-service.ts describeAgentRunEvent)
- CLI outside the TUI prints '[team] alice asks you: ...'. (apps/cli/src/teams.rs:630-636)

**Settings**

- mobilePushAgentActivity: only an explicit false silences mobile push; default on. Browser push is not governed by it.
- Mobile notification categories can still suppress display per type (notificationPrefsStore, category 'tasks').

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI teammate approvals are wrapped so the summary starts with the name. (apps/cli/src/teams.rs:669-678,711-714)
- CLI teammates ask the user with send_message to 'user'; the thread shows 'X asks you' and the answer comes back as the next message. (apps/cli/src/teams.rs:609-621,645-648,838)
- Server notifyAgentRunEvent records a feed notification, applies the mobile preference and calls sendPushToUser for expo and web, returns pushed false on failure and never throws. (apps/web/lib/services/agent-notification-service.ts)
- Terminal events (completed, failed) carry a dedupeKey agent-run:<runId>:<event>. (agent-notification-service.ts)
- Cloud run service calls it with approval_required when a checkpoint is saved and sets state awaiting_input. (apps/web/lib/services/cloud-agent-run-service.ts:1520-1540)
- Mobile Tasks route opens a run only in Cloud mode with Cloud unlocked. (apps/mobile/app/(app)/tasks.tsx:11-18)

**Incomplete**

- Feed taps on agent_approval_needed without a runId route go to /(app)/companion, not Tasks. (apps/mobile/app/(app)/notifications/index.tsx:296-298)
- CLI messages from teammates are labelled as requests, never approval, but nothing records an escalation outside the thread [inferred].

**Present but disconnected or switched off**

- Team escalation exists only when --team is on. (apps/cli/src/teams.rs:819)

**Not available**

- Escalation from saved persistent agents on Web, Desktop, VS Code, Chrome (brief marks missing).
- A Desktop or VS Code or Chrome alert: none found.

## 4. Required behaviour

**Established requirements**

- An agent can escalate a decision to the user and wait for the answer. (source: brief S61.18)
- Run finished and failed alerts are de-duplicated per run; failure to send logs a warning and returns pushed false. (source: apps/web/lib/services/agent-notification-service.ts)
- Mobile alerts default on and are turned off only by explicit false in mobilePushAgentActivity. (source: apps/web/lib/services/agent-notification-service.ts)

**Acceptance criteria**

1. A teammate approval prompt in the CLI starts with '<name>: '.
2. A teammate message to the user displays 'asks you' and /team <name> <answer> reaches that teammate.
3. A Cloud run needing approval produces one feed row titled 'Approval needed' and a push.
4. With mobilePushAgentActivity false the phone gets no push but the feed row still exists.
5. Sending a 'completed' event twice for one run records one feed row.
6. If push sending throws, the run is not interrupted.
7. Tapping the push on Mobile in Cloud mode opens Tasks with that run; outside Cloud mode it does not open the run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A message from another agent is never approval; only the person's message counts. [inferred from apps/cli/src/teams.rs:648]

**Proposed improvements** (suggestions, not requirements)

- Show escalations from persistent agents in one inbox on every app. [proposed]
- Make the feed tap route for agent_approval_needed go to Tasks when a run id exists, and say why when it cannot. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | notifyAgentRunEvent | `apps/web/lib/services/agent-notification-service.ts` | Feed row plus push for approval_required, input_required, completed, failed. |
| config | AGENT_PUSH_PREFERENCE_KEY (mobilePushAgentActivity) | `apps/web/lib/services/agent-notification-service.ts` | Opt-out preference read from user_settings. |
| service | announceAgentRunEvent | `apps/web/lib/services/cloud-agent-run-service.ts` | Isolates notification errors from the run (around line 150-170). |
| service | approval checkpoint save | `apps/web/lib/services/cloud-agent-run-service.ts` | Sets state awaiting_input and announces approval_required (lines 1520-1540). |
| service | recordNotification | `apps/web/lib/services/notification-service.ts` | Writes the in-app feed row (imported by the notification service). |
| service | sendPushToUser | `apps/web/lib/services/push-notification-service.ts` | Sends Expo and web push. |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-service.ts` | Run row whose state moves to awaiting_input. |
| table | user_settings / profiles | `apps/web/lib/services/agent-notification-service.ts` | Source of the notification preference. |
| screen | TasksRoute | `apps/mobile/app/(app)/tasks.tsx` | Opens the run from runId in Cloud mode. |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Shows runs and approval controls. |
| hook | useCloudRunApprovalSignal | `apps/mobile/src/features/tasks/useApprovalSignal.ts` | Reacts to an approval signal on the Tasks screen. |
| service | cloudRunNotificationRoute | `apps/mobile/services/notifications.ts` | Builds the Tasks route from data.runId (lines 460-463). |
| store | notificationPrefsStore | `apps/mobile/stores/notificationPrefsStore.ts` | Maps agent_approval_needed to the 'tasks' group (line 116). |
| hook | useAgentActivityPushSync | `apps/mobile/src/features/settings/notifications/useAgentActivityPushSync.ts` | Reads and writes mobilePushAgentActivity; disabled in Local mode. |
| screen | notification centre | `apps/mobile/app/(app)/notifications/index.tsx` | Routes a tapped feed item (lines 270-300). |
| service | named_approval | `apps/cli/src/teams.rs` | Prefixes teammate approval summaries with the name (line 669). |
| service | thread_entry and announce | `apps/cli/src/teams.rs` | Show 'asks you' messages in the TUI or as [team] lines (lines 605-640). |
| command | team_command | `apps/cli/src/teams.rs` | /team <name> <answer> sends the reply (line 838). |
| service | execute_send_message | `apps/cli/src/teams.rs` | The send_message tool, rejects spoofed senders (line 915). |
| other | approval sink on subagents | `apps/cli/src/subagent.rs` | Carries the approval callback into subagents (lines 486-547). |
| service | TeammateLaunch approval | `apps/cli/src/agent/chat.rs` | Passes the session's approval sink to a teammate (line 1927). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI teammate turn hits an approval or decides to ask; summary gets '<name>: ' prefix and goes to the lead session's approval sink, or it sends a message to 'user'. | device | apps/cli/src/teams.rs:669-678,644-648 |
| Cloud run: the server stores an approval checkpoint, sets state awaiting_input. | our servers | apps/web/lib/services/cloud-agent-run-service.ts:1520-1540 |
| Server writes the feed row, reads the preference, calls push for Expo and web. | our servers | apps/web/lib/services/agent-notification-service.ts |
| Push is delivered through the push provider to the phone or browser. | outside service | sendPushToUser, expo transport named in options { expo, web } (agent-notification-service.ts) |
| Phone shows the alert; a tap opens /(app)/tasks with runId; the store loads the run. | device | apps/mobile/services/notifications.ts:460-463; apps/mobile/app/(app)/tasks.tsx:14-17 |
| Person approves; the decision goes back to the server and the run continues. | device and our servers | resolveApproval in apps/mobile/src/features/tasks/CloudTasksScreen.tsx:411,840; server path not traced: unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Feed notification row (category agent_run, target kind work) | Server database via recordNotification | Shown in web feed and mobile | Retention unknown |
| Run state awaiting_input | cloud_agent_runs | Server is the source | Unknown |
| Teammate message to the user | Team message list in memory | No | Lost with the session [inferred] |
| Product analytics event work_run_finished for terminal events | Product analytics | n/a | unknown |

**Models and providers.** The escalation itself uses no model. Push uses Expo and a web push service. The agent's own turns use whichever model route the run or session has.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud alerts need a signed-in user id (userId in every call). CLI team needs none for the prompt. (agent-notification-service.ts) |
| Permissions | A message from another agent is never treated as the person's approval. (apps/cli/src/teams.rs:648) |
| Subscription | none found in the code in the notification service. Cloud mode access is gated on Mobile by waitlist cloudUnlocked. (apps/mobile/app/(app)/tasks.tsx:12-13) |
| Limits and metering | none found in the code for alert count. Push per-user limits unknown. |
| Feature flags | Mobile allows the tasks route only when feature flag cloudTasks is on. (apps/mobile/services/notifications.ts:345) |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode: the preference sync does nothing (owner.local returns early) and the Tasks route does not open a run. The CLI prompt works locally. (apps/mobile/src/features/settings/notifications/useAgentActivityPushSync.ts; tasks.tsx:12) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Push send fails | Caught; logs warning '[notifications] agent notify failed' and returns pushed false. | agent-notification-service.ts notifyAgentRunEvent catch |
| Preference lookup fails | Fails open: treated as on, logs warning. | agent-notification-service.ts loadAgentPushPreference |
| No registered device | pushed false, feed row still written. | test: reports not pushed when the account has no registered device (agent-notification-service.test.ts) |
| Feed write fails | Push still sent (test 'still pushes to the phone when the feed cannot be written' relates to the code-session notice). | agent-notification-service.test.ts:406 |
| Mobile not in Cloud mode or Cloud locked | Run is not opened; Tasks screen shows normally. | apps/mobile/app/(app)/tasks.tsx:14 |
| Route not allow-listed | Mobile drops it. | agent-notification-service.ts MOBILE_RUN_ROUTE comment; apps/mobile/services/notifications.ts:462 |
| Teammate stopped before answer | Message refused. | apps/cli/src/teams.rs:353-366 |
| Alerts off on phone | Screen shows 'Approval alerts are off. Paused tasks wait silently while the app is closed.' | apps/mobile/src/features/tasks/CloudTasksScreen.tsx:73 |
| Offline or timeout for the answer | not handled in the code that I found for the CLI; for Cloud, timeout handling not traced: unknown. | looked in apps/cli/src/teams.rs and cloud-agent-run-service.ts approval path; no timeout seen |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/agent-notification-service.test.ts`: Dedupe, preference opt-out, no device, route allow-list, tool name copy, failure swallowing, per-approval notices.
- `apps/web/lib/services/cloud-agent-run-notifications.test.ts`: Run service notification calls.
- `apps/web/lib/workflows/cloud-agent-terminal-notifications.test.ts`: Terminal notifications from workflows.
- `apps/mobile/__tests__/notification-auth-gate.test.ts`: agent_approval_needed notifications behind the auth gate.
- `apps/mobile/__tests__/notification-prefs-hydration.test.ts`: shouldNotify for agent_approval_needed.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetApproval.test.tsx`: Approval sheet in the Tasks screen.
- `apps/cli/src/teams.rs (tests)`: thread_entry shows 'asks you'; spoofed sender rejected.

**Test scenarios**

- **Teammate asks the user**
  1. agi --team
  2. Spawn teammate that must ask a question
  3. Read thread, reply with /team <name> <answer>
  - Expected: Thread shows '<name> asks you'; teammate continues with 'The person says: ...'.
- **Cloud approval push**
  1. Start a Cloud run on Mobile that needs a tool approval
  2. Background the app
  - Expected: Push 'Approval needed'; feed row exists; tap opens Tasks on that run.
- **Opt-out**
  1. Set mobilePushAgentActivity false
  2. Trigger an approval
  - Expected: No phone push; feed row still written; browser push still sent if registered.
- **Dedupe**
  1. Trigger the finished event twice for one run
  - Expected: One feed row.
- **Local mode**
  1. Open Mobile in Local mode and tap an old run push
  - Expected: Run does not open.

**Where to look when it fails**

- Log '[notifications] agent notify failed' and '[notifications] could not read agent push preference'.
- Log 'Cloud agent run notification failed'.
- Tables: cloud_agent_runs state; the notifications feed table (name unknown).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md)
- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)
- No hands-on plan yet for Web: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No escalation for persistent agents on Web, Desktop, VS Code, Chrome** Affects: Users of those apps. Evidence: brief S61.18 statuses. Work needed: Wire approval surfaces and alerts per app.
- **Brief says Web missing but server alert code exists** Affects: Web users; documentation accuracy. Evidence: apps/web/lib/services/agent-notification-service.ts. Work needed: Check the web approval UI and correct the brief or add it.
- **Feed tap on an approval item may open the companion screen, not Tasks** Affects: Mobile users. Evidence: apps/mobile/app/(app)/notifications/index.tsx:296-298. Work needed: Verify on a device which path real alerts take.
- **Cloud escalation is for cloud runs, not tied to a named persistent agent** Affects: Everyone. Evidence: notifier takes runId, not an agent name (agent-notification-service.ts AgentRunNotice). Work needed: Add agent identity to the notice.
- Not built on: Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:mobile
- surface:web
- mode:cloud
- mode:local
- file:apps/web/lib/services/agent-notification-service.ts
- table:cloud_agent_runs
- F061-14
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity

## Unknown

- Name of the notification feed table.
- How the Web UI presents and resolves a pending approval.
- Server-side timeout or expiry of an unanswered approval.
- Exact visible label of the mobile setting that writes mobilePushAgentActivity.
- Whether Desktop shows anything for these push events.
- Push rate limits.
