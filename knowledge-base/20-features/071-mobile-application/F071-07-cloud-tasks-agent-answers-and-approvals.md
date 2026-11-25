---
id: "F071-07"
type: "feature"
title: "Cloud tasks, agent answers and approvals"
aliases: ["AGI Work screen", "Cloud tasks", "Tasks screen", "New task sheet", "Needs you filter", "Approve or Deny a task", "Send answer form", "Cloud run detail sheet", "Remote coding review (companion, switched off)"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.14", "S71.15", "S71.16", "S71.17"]
depends_on: ["surface:mobile", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "file:apps/mobile/lib/v1FeatureFlags.ts", "api:GET /api/llm/v1/chat/completions/runs", "api:POST /api/llm/v1/chat/completions/approve", "api:POST /api/llm/v1/chat/completions/resume-input", "api:GET /api/mobile/agent-status"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-07 Cloud tasks, agent answers and approvals

On the phone, a signed-in Cloud user opens the AGI Work screen, starts a cloud agent task with a goal, follows its runs in a list, answers the agent's question and approves or denies a pending action. Following a coding session on a paired desktop exists in code but is switched off.

Area: [71. Mobile application](README.md). Requirement items: [S71.14](../../10-requirements/capabilities/071-mobile-application.md#s7114), [S71.15](../../10-requirements/capabilities/071-mobile-application.md#s7115), [S71.16](../../10-requirements/capabilities/071-mobile-application.md#s7116), [S71.17](../../10-requirements/capabilities/071-mobile-application.md#s7117).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person on the AGI Mobile app start an agent task that runs in AGI Cloud, watch its status and output, answer a question the agent asks, and approve or deny an action the agent wants to take. The run resumes or stops after the decision. A second, separate path for reviewing a coding session running on a paired computer is built but switched off (apps/mobile/lib/v1FeatureFlags.ts:16; apps/mobile/app/(app)/companion/code/[threadId].tsx:81).

**Why it exists.** Agent runs can take long and pause for the person. The brief says the user must be able to start a cloud task, answer questions and approve actions from the phone (doc: knowledge-base/data/area-briefs/071-mobile-application.md S71.14, S71.15, S71.17). The in-app list is the place where blocked runs are found.

**Who uses it.** Signed-in users of AGI Cloud on the Mobile app whose account has the AGI Work capability. Local-mode users do not see it (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:423, 655-667).

**Problems it solves**

- A paused agent run no longer waits until the person is at a computer.
- The person can see which runs need them, using the Needs you filter (apps/mobile/src/features/tasks/runPresentation.ts:19-24).
- A second device answering first is explained instead of failing silently (apps/mobile/src/features/tasks/service.ts:23).

**Use cases**

- Start 'Research competitors and write a one-page summary' from the phone and check back later.
- A push alert says an action is waiting; open the task and tap Approve.
- The agent asks which date range to use; fill the form and tap Send answer.
- Open a finished task and run it again, share it or turn it into a routine (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:603-625).

## 2. User experience

**Where to find it**

- Mobile only. Side drawer item 'AGI Work' (route /(app)/tasks), shown only in Cloud mode when the plan grants the agi_work capability and the account holds canUseAgiWork (apps/mobile/src/features/drawer/components/DrawerContent.tsx:140, 339-346, 567).
- Screen title 'AGI Work', subtitle 'AGI Cloud' (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:67-68).
- Tapping a push notification with a run id opens /(app)/tasks with that run (apps/mobile/services/notifications.ts:457-464, 530-533).
- Web, Desktop, CLI, VS Code and Chrome have their own task surfaces; they are not part of this feature (doc: docs/product/surface-feature-matrix.md Work section).

**Before you start**

- FEATURES.cloudTasks true (it is) (apps/mobile/lib/v1FeatureFlags.ts:10).
- Cloud mode chosen and Cloud unlocked, or the screen shows 'Tasks run in AGI Cloud' with 'Switch to AGI Cloud' or 'Sign in to AGI Cloud' (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:140-199, 535-541, 655-665).
- To start a task: the capability canUseAgiWork must be granted; otherwise the New task button is not drawn (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:667, 815-822).

**Screens and controls**

- Filter chips All, Needs you, Running, Finished (apps/mobile/src/features/tasks/runPresentation.ts:19-45).
- Search button and field, 'Load more', pull to refresh (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:780-800).
- Floating 'New task' button opens the 'New task' sheet with 'What should it accomplish?', 'Constraints (optional)', a deliverable field, optional 'Project (optional)', and 'Start task' (apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:108-266).
- Run detail sheet: title, 'Close task', 'Waiting for your approval' box with Approve and Deny, the question form with 'Send answer' (or 'Continue'), 'Decline', 'Cancel', Stop, Pause, Resume, share, make routine, run again (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:417-460; apps/mobile/src/features/tasks/components/CloudRunInputForm.tsx:50-53, 575-590).

**Journey**

1. Open AGI Work from the drawer.
2. Tap 'New task', write the goal, optionally constraints, deliverable and project, then tap 'Start task'.
3. The app creates a chat and sends the goal with work mode agiwork; the new run opens in the detail sheet (apps/mobile/src/features/tasks/startWork.ts:38-70; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:570-585).
4. Follow status and output in the sheet; the list refreshes every 15 seconds while a run can still change and the app is in front (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:64, 463-468).
5. If the run shows 'Waiting for your approval', tap Approve or Deny; the sheet then reopens the run to show how it went on (apps/mobile/src/features/tasks/store.ts:311-355).
6. If the run shows a question form, fill it and tap 'Send answer' (apps/mobile/src/features/tasks/store.ts:356-390).

**What the person sees and gets**

- 'Loading Cloud tasks…', 'Tasks could not be loaded' with 'Try again' (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:371-379, 713-718).
- 'Describe what this task should accomplish' for an empty goal; 'This task could not be started' otherwise (apps/mobile/src/features/tasks/startWork.ts:13-14).
- 'Your decision could not be sent', 'Another device already answered this one', 'This approval expired, so the task cannot continue from it', 'This task is no longer available' (apps/mobile/src/features/tasks/service.ts:19-26).
- 'Your answer could not be sent' (apps/mobile/src/features/tasks/store.ts:46).
- Banner 'Approval alerts are off. Paused tasks wait silently while the app is closed.' when background alerts are off (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:72-73, 724-726).

**Settings**

- Settings, Notifications: approval alerts and background check (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:547-549).
- Cloud mode switch (side panel) (doc: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-02).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Start a task: goal required, built into a goal object with optional constraints and deliverable, sent in a new chat with work mode agiwork (apps/mobile/src/features/tasks/startWork.ts:38-70; apps/mobile/src/features/tasks/agiWorkGoal.ts:6-20).
- The chat model is the selected model if it is a cloud model, otherwise the default cloud model for the plan (apps/mobile/src/features/tasks/startWork.ts:38-42).
- List, filter, search, paging and refresh of runs through the managed cloud run client (apps/mobile/src/features/tasks/service.ts:40-55; apps/mobile/src/features/tasks/store.ts).
- Follow one run with live snapshots (apps/mobile/src/features/tasks/store.ts:249-300; apps/mobile/src/features/tasks/service.ts:57-62).
- Approve and Deny both call resolveCloudRunApproval with 'approved' or 'rejected' for every pending tool call id (apps/mobile/src/features/tasks/store.ts:311-340; apps/mobile/src/features/tasks/service.ts:64-74; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:424-437).
- Questions: the detail sheet shows CloudRunInputForm for a pending input and submits answers with answerRunInput (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:444-460; apps/mobile/src/features/tasks/store.ts:356-390).
- The run list re-reads when an approval notification arrives (apps/mobile/src/features/tasks/useApprovalSignal.ts:1-27).
- Background check: a background task polls GET /api/mobile/agent-status and schedules an 'agent_approval_needed' notification with a Review button (apps/mobile/services/backgroundFetch.ts:84-120, 153; apps/mobile/services/notificationCategories.ts:6-17).
- Tapping an approval or task notification that carries a run id opens that run in AGI Work (apps/mobile/services/notifications.ts:457-464, 530-533).

**Incomplete**

- The brief asks for an answer from the notification itself; the only notification action is 'Review', which opens the app, so the answer is typed in the app (apps/mobile/services/notificationCategories.ts:11-17; doc: area brief S71.14).
- When more than one approval is pending, the notification carries no runId (apps/mobile/services/backgroundFetch.ts:107-111). Where that tap lands is not established, see unknowns.

**Present but disconnected or switched off**

- Remote coding review and remote approval for paired desktops: code exists (CodeSessionView, remote-code service, companion screens) but FEATURES.companion and FEATURES.dispatch are both false, the code screen returns 'FeatureUnavailable' and the companion effects return early (apps/mobile/lib/v1FeatureFlags.ts:12, 16; apps/mobile/app/(app)/companion/code/[threadId].tsx:81; apps/mobile/app/(app)/companion/index.tsx:108-121).
- The 'Open Remote' link in the AGI Work scope note shows only when companion is on (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:208-228).

**Not available**

- Web, Desktop, CLI, VS Code and Chrome: not part of this feature (brief status n/a).
- Answering inside the notification (no text-input notification action found in apps/mobile/services/notificationCategories.ts).
- Local mode: the screen is a gate that asks to switch to AGI Cloud (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:655-665).

## 4. Required behaviour

**Established requirements**

- The user can answer an agent's question from the phone, by notification reply or a quick answer field. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.14)
- The user can approve or deny a pending agent action from the phone and the run resumes accordingly. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.15)
- The user can follow a coding session running elsewhere, review changed files and diffs, then steer or approve. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.16)
- The user can start a cloud agent task from the phone and follow it in the task list. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.17)
- Mobile has a Work surface at apps/mobile/app/(app)/tasks.tsx. (source: doc: docs/product/surface-feature-matrix.md (Work))

**Acceptance criteria**

1. With the capability granted, 'New task' is visible and an empty goal keeps 'Start task' disabled.
2. Starting a task with a goal creates a run that appears in the list and opens in the detail sheet.
3. A run waiting for approval shows Approve and Deny; Approve resumes it, Deny stops that action, and a failure shows 'Your decision could not be sent'.
4. A run asking a question shows the form; 'Send answer' submits and the run continues.
5. If another device answers first, the phone says 'Another device already answered this one'.
6. Without Cloud mode or sign-in, the screen offers the switch or sign-in and shows no runs.
7. With companion and dispatch off, no remote-coding control is reachable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same decision rules should hold for push-opened runs and list-opened runs, because both use openRun [inferred from apps/mobile/app/(app)/tasks.tsx:11-18].
- Answer-in-notification is required by the brief but not built [inferred from the brief wording against apps/mobile/services/notificationCategories.ts].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a text-reply notification action for simple questions, or change the brief to 'open the app to answer'.
- [proposed] When several approvals are pending, send the person to the list filtered by Needs you.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Tasks route | `apps/mobile/app/(app)/tasks.tsx` | Route; opens a run from the runId parameter and renders the screen. |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | List, filters, search, gate, New task button, wiring of sheets. |
| component | StartWorkSheet | `apps/mobile/src/features/tasks/components/StartWorkSheet.tsx` | New task form. |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Run detail: output, approval box, question form, stop, pause, share. |
| component | CloudRunInputForm | `apps/mobile/src/features/tasks/components/CloudRunInputForm.tsx` | Renders the agent's question fields and Send answer, Decline, Cancel. |
| component | CloudRunCard | `apps/mobile/src/features/tasks/components/CloudRunCard.tsx` | One row in the list. |
| store | useCloudTaskStore | `apps/mobile/src/features/tasks/store.ts` | Load, openRun, resolveApproval, answerInput, stopRun, pause, resume. |
| service | Tasks service | `apps/mobile/src/features/tasks/service.ts` | Wraps the managed cloud run client; error wording. |
| service | startCloudWorkRun | `apps/mobile/src/features/tasks/startWork.ts` | Creates the chat and sends the goal in agiwork mode. |
| hook | useCloudRunApprovalSignal | `apps/mobile/src/features/tasks/useApprovalSignal.ts` | Refreshes the list when an approval notification arrives. |
| service | Cloud run client factory | `apps/mobile/services/streaming.ts` | createMobileCloudAgentRunClient with account checks and headers (line 405). |
| service | Managed cloud agent run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | HTTP client: list, follow, approve, resume-input, cancel, pause, steer. |
| endpoint | Run list and control | `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | GET runs list; sub-routes for each run (base path set in packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:5). |
| endpoint | Approve | `apps/web/app/api/llm/v1/chat/completions/approve` | Receives approval decisions (path constant at managed-cloud-agent-runs-client.ts:35). |
| endpoint | Resume input | `apps/web/app/api/llm/v1/chat/completions/resume-input` | Receives the answers to a question (constant at managed-cloud-agent-runs-client.ts:36). |
| endpoint | Agent status | `apps/web/app/api/mobile/agent-status/route.ts` | Pending approvals for the background check. |
| job | Background approval check | `apps/mobile/services/backgroundFetch.ts` | Polls agent-status and schedules the approval notification. |
| config | Notification category | `apps/mobile/services/notificationCategories.ts` | Single 'Review' action that opens the app. |
| service | Notification routing | `apps/mobile/services/notifications.ts` | Maps a run notification to the tasks route (lines 450-464, 530). |
| config | Feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | cloudTasks on; dispatch and companion off. |
| screen | Companion code route | `apps/mobile/app/(app)/companion/code/[threadId].tsx` | Remote coding view; shows FeatureUnavailable while companion is off. |
| component | CodeSessionView | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Remote coding review UI (switched off). |
| service | Remote code service | `apps/mobile/src/features/companion/remote-code/service.ts` | Control messages: list, attach, steer, interrupt, approval, question answers over the paired link. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the New task sheet and taps Start task; the goal is trimmed and checked. | device | apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:64-67; apps/mobile/src/features/tasks/agiWorkGoal.ts:6-20 |
| The app ends any conversation model, creates a chat, and sends the goal with work mode agiwork and the chosen cloud model. | device and our servers | apps/mobile/src/features/tasks/startWork.ts:54-70 |
| The agent run executes in AGI Cloud and publishes state, plan, output and files. | our servers | apps/web/app/api/llm/v1/chat/completions/runs/route.ts; apps/mobile/src/features/tasks/store.ts:249-300 |
| The phone follows the run and applies snapshots to the detail sheet. | device and our servers | apps/mobile/src/features/tasks/store.ts:272-282; apps/mobile/src/features/tasks/service.ts:57-62 |
| A pending approval or question appears in the sheet; Approve, Deny or Send answer posts to the approve or resume-input endpoint, then the run is reopened. | device and our servers | packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:35-36, 416, 448; apps/mobile/src/features/tasks/store.ts:311-390 |
| While the app is in the background, a periodic task asks the server for pending approvals and raises a local notification. | device and our servers | apps/mobile/services/backgroundFetch.ts:84-120 |
| Tool calls and model calls of the run may reach outside providers or connectors chosen by the server. | outside service | unknown: server run code not opened for this page |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run records, plan, transcript and files of a cloud run | AGI Cloud server (run store) | Read by the phone on demand; not kept as a phone copy beyond the open sheet and list state in memory | unknown |
| The new chat and its goal message | Cloud chat store on the server and the encrypted cloud message store on the phone (apps/mobile/stores/chat/chatCloudMessageStore.ts:313) | Yes, cloud chat history syncs | Follows chat deletion rules (not examined) |
| Approval decision and answers | Sent to the server; not stored on the phone | Sent once | unknown |
| Notification centre entries | Phone notification store (apps/mobile/services/notifications.ts) | No | unknown |

**Models and providers.** The task chat uses the selected model if it is a cloud model, else the default cloud model for the plan, resolved through the model picker service, not a literal id (apps/mobile/src/features/tasks/startWork.ts:38-42). Provider choice and routing happen on the server (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI Cloud account and Cloud mode (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:423, 655-665). |
| Permissions | Notification permission is needed for approval alerts; without background alerts the screen shows a warning (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:72-73). Review button requires device authentication and opens the app (apps/mobile/services/notificationCategories.ts:12-15). |
| Subscription | New task and the drawer item need the plan capability agi_work and the granted capability canUseAgiWork; the server still decides (apps/mobile/src/features/drawer/components/DrawerContent.tsx:339-346; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:667). The server drops canUseAgiWork when no catalog model is agentic (apps/web/lib/services/capability-handshake-service.ts:101). Plan names and limits: see SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Page size 25 runs (apps/mobile/src/features/tasks/service.ts:17). Usage metering of the task run is on the server: not opened, unknown. |
| Feature flags | FEATURES.cloudTasks true, FEATURES.companion false, FEATURES.dispatch false (apps/mobile/lib/v1FeatureFlags.ts:10, 12, 16). A server kill switch exists for the work capability (apps/web/lib/feature-flags/kill-switches.ts:31). |
| Model compatibility | Only cloud models can run a task; a non-cloud selection is replaced by the plan default (apps/mobile/src/features/tasks/startWork.ts:38-42). |
| Provider restrictions | none found in the code on the phone side; the server picks the provider. |
| Local mode | Not available. Local mode shows a gate asking to switch to AGI Cloud (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:655-665); on-device chats stay local (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:187). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading list | Spinner with 'Loading Cloud tasks…'. | apps/mobile/src/features/tasks/CloudTasksScreen.tsx:707-712 |
| List load error with no runs | 'Tasks could not be loaded' and a 'Try again' button. | apps/mobile/src/features/tasks/CloudTasksScreen.tsx:371-379, 713-714 |
| Empty list | Empty state with New task if allowed or a connect-sources prompt. | apps/mobile/src/features/tasks/CloudTasksScreen.tsx:773-780 |
| App in background | Foreground polling stops; the list loads only while active. | apps/mobile/src/features/tasks/CloudTasksScreen.tsx:462-468 |
| Another device answered first | Shows 'Another device already answered this one'. | apps/mobile/src/features/tasks/service.ts:23, 89-90 |
| Approval expired | Shows that the task cannot continue from it. | apps/mobile/src/features/tasks/service.ts:26, 91 |
| Run missing or no access (403, 404, 410) | 'This task is no longer available'. | apps/mobile/src/features/tasks/service.ts:24-25, 92-97 |
| Account switch during a request | The result is dropped when the account epoch has changed. | apps/mobile/src/features/tasks/store.ts:311-355 |
| Stop | Confirmation 'Stop this task?' explaining the run cannot be resumed. | apps/mobile/src/features/tasks/CloudTasksScreen.tsx:623-632 |
| Offline | not handled in the code on this screen beyond the generic error messages above. | apps/mobile/src/features/tasks/CloudTasksScreen.tsx (no network check found) |
| Accessibility | Buttons carry labels such as 'Approve this task', 'Deny this task', 'Close task', 'Filter Cloud tasks: <name>'; the live region announces input send errors. | apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:424-437; apps/mobile/src/features/tasks/components/CloudRunInputForm.tsx:565-570 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/tasks/__tests__/CloudTasksScreen.test.tsx`: List screen behaviour and starting a task (by name; not opened line by line)
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetApproval.test.tsx`: Approve and Deny in the detail sheet (by name)
- `apps/mobile/src/features/tasks/__tests__/CloudRunInputForm.test.tsx`: Question form fields and submit (by name)
- `apps/mobile/src/features/tasks/__tests__/store.test.ts`: Store actions including approval and answers (answerRunInput is referenced)
- `apps/mobile/src/features/tasks/components/__tests__/StartWorkSheet.test.tsx`: New task sheet
- `apps/mobile/__tests__/start-cloud-work-run.test.ts`: startCloudWorkRun
- `apps/mobile/src/features/tasks/__tests__/taskActions.test.ts`: Rerun and share helpers
- `apps/mobile/src/features/companion/components/__tests__/CodeSessionView.test.tsx`: Remote coding view (switched off in the build)
- `apps/mobile/src/features/companion/remote-code/__tests__/service.test.ts`: Remote code control messages
- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-agent-runs-client.test.ts`: Run client

**Test scenarios**

- **Start a task**
  1. Sign in, switch to Cloud, open AGI Work.
  2. Tap New task, enter a goal, tap Start task.
  - Expected: The sheet closes, the run opens in the detail sheet and appears in the list.
- **Empty goal**
  1. Open New task.
  2. Leave the goal blank.
  - Expected: Start task is disabled; nothing is sent.
- **Approve an action**
  1. Run a task that needs approval.
  2. Open it when it shows 'Waiting for your approval'.
  3. Tap Approve.
  - Expected: The run resumes and the approval box goes away.
- **Second device answers first**
  1. Open the same pending approval on two devices.
  2. Approve on device A, then Deny on device B.
  - Expected: Device B shows 'Another device already answered this one'.
- **Answer a question**
  1. Run a task that asks a question.
  2. Fill the form and tap Send answer.
  - Expected: The form closes and the run continues; a failed send shows 'Your answer could not be sent'.
- **Notification tap**
  1. Background the app with a pending approval and notifications on.
  2. Wait for the alert, tap it.
  - Expected: The app opens on AGI Work with that run's detail open.

**Where to look when it fails**

- Log tag '[backgroundFetch] Agent status check failed after retries' (apps/mobile/services/backgroundFetch.ts).
- Error classes ManagedCloudAgentRunAlreadyResumingError, ManagedCloudAgentRunApprovalExpiredError, ManagedCloudAgentRunHttpError (apps/mobile/src/features/tasks/service.ts:2-5).
- Notification warning 'Ignored unknown notification action' (apps/mobile/services/notifications.ts).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **No answer from the notification; the brief allows 'notification reply or quick answer field' and only the in-app field exists.** Affects: Mobile users, both OS. Evidence: apps/mobile/services/notificationCategories.ts:11-17. Work needed: Decide whether the in-app field alone meets the requirement, and amend the brief or add a reply action.
- **Remote coding review and remote approval are off; the brief status says 'mobile done'.** Affects: Mobile users with a paired desktop. Evidence: apps/mobile/lib/v1FeatureFlags.ts:12, 16; apps/mobile/app/(app)/companion/code/[threadId].tsx:81. Work needed: Owner decision to switch on, then live validation with a paired desktop.
- **The drawer entry and New task depend on a capability list; a user without it sees an empty screen or no entry with no explanation.** Affects: Cloud users on plans without AGI Work. Evidence: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:667, 815-822. Work needed: Check the product intent for the no-capability state.
- **Where a notification with several pending approvals leads is not established.** Affects: Mobile users. Evidence: apps/mobile/services/backgroundFetch.ts:107-111. Work needed: Trace handleNotificationResponse for runId-less approvals (companion off).

**Depends on**

- surface:mobile
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- file:apps/mobile/lib/v1FeatureFlags.ts
- api:GET /api/llm/v1/chat/completions/runs
- api:POST /api/llm/v1/chat/completions/approve
- api:POST /api/llm/v1/chat/completions/resume-input
- api:GET /api/mobile/agent-status

## Unknown

- Server-side limits, metering and retention of cloud runs (server run code not opened).
- Where a notification for several pending approvals leads when companion is off.
- Whether the brief's 'notification reply' is still required.
- Provider and tool calls the server makes during a run.
- Test contents were not read line by line; coverage is stated by file name.
