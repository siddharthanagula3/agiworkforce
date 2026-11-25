---
id: "F060-07"
type: "feature"
title: "Steer, pause, resume and stop"
aliases: ["Steer, pause, resume and stop", "Task steering (S60.20)", "Pause (S60.21)", "Resume (S60.22)", "Cancel / Stop this task (S60.23)", "Message the agent", "Keep working (withdraw a pending pause)", "Send as new message"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S60.20", "S60.21", "S60.22", "S60.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "api:POST /api/llm/v1/chat/completions/runs/{runId}/steer", "api:DELETE /api/llm/v1/chat/completions/runs/{runId}/steer/{steerId}", "api:POST /api/llm/v1/chat/completions/runs/{runId}/pause", "api:POST /api/llm/v1/chat/completions/runs/{runId}/resume", "api:POST /api/llm/v1/chat/completions/runs/{runId}", "table:cloud_agent_runs", "table:cloud_agent_events", "table:cloud_agent_approval_checkpoints", "file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-execution-boundaries", "SYS-api-and-contracts", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-07 Steer, pause, resume and stop

Lets a person change course on a running Work task in the cloud. They can queue a message the agent reads at its next step, pause at a step boundary, resume with optional guidance, or stop the run for good. Web, mobile, VS Code and Chrome reach it through the shared run API; the CLI and Chrome have only parts.

Area: [60. Agentic work product](README.md). Requirement items: [S60.20](../../10-requirements/capabilities/060-agentic-work-product.md#s6020), [S60.21](../../10-requirements/capabilities/060-agentic-work-product.md#s6021), [S60.22](../../10-requirements/capabilities/060-agentic-work-product.md#s6022), [S60.23](../../10-requirements/capabilities/060-agentic-work-product.md#s6023).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the person four controls over a cloud Work run (an AGI Work task that runs on our servers): send a message into the run (steer), ask it to pause, resume a paused run (optionally with guidance), and stop it. Each control is a call to the managed run API. The agent honours steer and pause at its next step, and a stop at its next step or at once if the run is waiting on a person.

**Why it exists.** Work tasks run for minutes with the app closed. Without these controls the only choices are wait or lose the work. The product direction asks that Cloud work can be steered from another surface (doc: docs/product/definition.md:139).

**Who uses it.** Signed-in people with a Work task in flight, on web, the Tauri desktop build, mobile, VS Code and Chrome. The CLI has its own local-turn controls.

**Problems it solves**

- A task heads the wrong way and the person would otherwise have to cancel and restart.
- The person needs to stop spending on a run without destroying its progress (pause keeps a checkpoint).
- A run is parked waiting on an approval or answer and must be ended from any device.

**Use cases**

- Type 'use the 2024 figures only' into the steer box while a research-style Work task is running.
- Pause a long task, type new guidance in the box under the paused row, press Resume.
- Press Stop on a task that is heading the wrong way.
- On a phone, pause a task from the detail sheet, then resume it later.

## 2. User experience

**Where to find it**

- Web: /tasks page titled 'Work history'; row buttons 'Pause', 'Keep working', 'Resume', 'Stop'; detail panel section 'Message the agent' (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:546,788,792,809,826; TaskSteerSection.tsx:66).
- Desktop (public Electron app): shows the hosted web app, so the same page (doc: AGENTS.md section 5; apps/desktop/electron/main.ts:1328 loads an entry URL).
- Desktop (Tauri build): Tasks panel, only when the privacy mode is not local and the user is signed in; same shared page (apps/desktop/src/features/v3/DesktopShellV3.tsx:790; apps/desktop/src/features/tasks/DesktopTasks.tsx:44).
- Mobile: Tasks screen, task detail sheet: 'Message the agent' section with 'Send to the agent', buttons 'Pause this task', 'Resume this task', 'Stop this task' (apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:75,133; CloudRunDetailSheet.tsx:588-645).
- VS Code: Cloud tasks tree, open a task, QuickPick actions 'Message the agent' (steer) and 'Stop this task' (apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:168-181).
- Chrome: side panel More menu, 'Tasks' sheet, 'Stop' button per live task (apps/extension/src/features/side-panel/tasksSheet.ts:90).
- CLI terminal UI: type while the agent works to queue a prompt; Esc or Ctrl-C cancels the turn (apps/cli/src/tui/tui_app.rs:2074).

**Before you start**

- A signed-in AGI account (web layout redirects an expired session; apps/web/app/tasks/layout.tsx:16).
- A cloud Work run that exists. Starting one needs the canUseAgiWork capability, which the plan catalog gives to pro, max, max_15x, team, team_premium and enterprise (packages/contracts/types/src/billing-catalog.ts:341,354).
- Mobile: cloud tasks flag on, app in cloud mode and cloud unlocked (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:423,655-660).

**Screens and controls**

- Steer box: label 'Message the agent' (hidden for screen readers), placeholder 'Message the agent to add instructions or change course', Enter sends, Shift+Enter adds a line, button 'Send'; 4,000 character limit (TaskSteerSection.tsx:106-141; packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:80).
- Queued list 'Queued messages': 'Queued. The agent reads it at its next step.' while the run is live; 'Not read before the task finished' plus button 'Send as new message' once it ended (TaskSteerSection.tsx:70-103).
- Row badge shows 'Pausing' while pause is requested but not yet reached (TasksPage.tsx:~760).
- Paused row: text area 'Tell the agent what to change when it resumes (optional)' and button 'Resume' (TasksPage.tsx:809,881).
- Mobile pause button only appears when state is running; resume only when paused (CloudRunDetailSheet.tsx:588,597).
- Stop confirmation exists on mobile ('Stop this task?'), VS Code (modal 'Stop "<title>"?') and Chrome ('Stop this task? It ends now and cannot be resumed'); web Stop has none (CloudTasksScreen.tsx:626-635; cloudRunDetail.ts:314-325; apps/extension/_locales/en/messages.json spTasksStopConfirm; TasksPage.tsx:826).

**Journey**

1. 1. Start a Work task (see the start-of-task features). It appears on the list as Queued or Running.
2. 2. Open the task. While it works the detail panel refreshes itself every 4 seconds and shows 'Updating automatically'.
3. 3. To steer: type in 'Message the agent' and press Send. The message shows in the queue. At its next step the agent reads it and the journal shows a completed progress line.
4. 4. To pause: press Pause. The badge changes to 'Pausing'. At the next step boundary the run becomes Paused. To change your mind before it pauses, press 'Keep working'.
5. 5. To resume: optionally type guidance under the paused row, press Resume. The list is re-read and the run shows Resuming then Running.
6. 6. To stop: press Stop. A run waiting on you is cancelled at once; a working run stops at its next step and shows Cancelled.
7. 7. If the task finished before the agent read a queued message, press 'Send as new message' to move it into the chat.

**What the person sees and gets**

- Steer failure keeps the draft and shows an alert: 'Your message was not sent. The task keeps working without it.' or the server's text (TaskSteerSection.tsx:40-45).
- Pause failure toast: 'Could not pause the task. It is still working.'; resume failure: 'Could not resume the task. It is still paused.' or 'Another device already resumed this task.'; stop failure: 'Could not stop the task. Check its activity before retrying.' (TasksPage.tsx:336-430).
- Server refusals: pause 409 'Only a task that is still working can be paused. This one is waiting on you or has already stopped.'; steer 409 texts for a full queue, a Code task, or a non-working run (pause/route.ts:58-62; steer/route.ts:74-88).
- Cancelled run keeps partial output; the assistant turn is marked stopped (apps/web/app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts).

**Settings**

- Layout List or Board is remembered per device in browser storage key agi-tasks-layout (TasksPage.tsx:~88-99).
- Tool approval policy affects whether a run pauses for approval, not the user pause (inferred from apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts imports in resume/route.ts:63).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Steer: POST /api/llm/v1/chat/completions/runs/{runId}/steer validates 1 to 4,000 characters, blocks or redacts secrets, then appends to the run's pending_steer list (max 10) only while the state is queued, planning, running or resuming and no pause or cancel is pending (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts:50-90; apps/web/lib/services/cloud-agent-run-service.ts:2798-2853; packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:81).
- The agent reads queued steers at the top of every loop step and again before ending its answer on a Work turn, adds them as user messages and journals a 'steer:<id>' progress line (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6736-6738,7436-7453,5309-5324).
- Pause: POST .../pause sets pause_requested_at only for executor-held states (queued, planning, running, resuming) with no cancel pending, else 409 (cloud-agent-run-service.ts:2727-2744; pause/route.ts:41-62).
- At the next step boundary the tool loop emits task-state-changed paused and lifecycle paused, saves a 'pause' checkpoint (messages, event cursor, completed steps) and sets the run to paused (tool-loop.ts:6702-6735; cloud-agent-run-service.ts:2928-3028; apps/web/lib/workflows/start-cloud-agent-workflow.ts:435-466).
- Resume: POST .../resume first withdraws a pause not yet reached; otherwise runs the managed compute, organization policy and spend gates, blocks secrets in guidance, claims the pause checkpoint, re-checks workspace controls and the saved context policy, then continues the tool loop with the guidance as a user message (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:157-356; tool-loop.ts:6670-6681).
- Cancel: POST .../runs/{runId} records cancellation_requested_at; a run parked on a person is ended immediately and its pending checkpoint resolved; a working run is stopped at its next step; the provider call already in flight, committed tool side effects and committed connector writes cannot be undone (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:69-109; cloud-agent-run-service.ts:3107-3197; tool-loop.ts:6698-6701).
- Shared UI wires all four controls for web and the Tauri desktop build (TasksPage.tsx:336-430,788-826; TaskSteerSection.tsx).
- Mobile wires steer, pause, resume, stop (with confirmation) and send-as-new-message (apps/mobile/src/features/tasks/store.ts:390-483; CloudRunSteerSection.tsx; CloudTasksScreen.tsx:626-635,846-847).
- VS Code wires steer (input box) and stop (modal confirmation) (cloudRunDetail.ts:265-333).
- Chrome wires stop with an inline confirmation and confirms the run reached a terminal state (apps/extension/src/features/side-panel/tasksSheet.ts:90-122; apps/extension/src/features/cloud-bridge/managedRunControl.ts:429-449).
- CLI: while a turn runs, typed lines queue ('type to queue a message') and are sent after the turn; Esc or Ctrl-C cancels, saves the partial turn and returns queued lines to the composer (apps/cli/src/tui/tui_app.rs:2064-2074,7274-7275,8482,8756-8761; apps/cli/src/lib.rs:8618-8629).
- CLI app-server host exposes cloud/turn/stop and cloud/turn/resume for a paused run (crates/agiworkforce-protocol/src/developer_session.rs:166-167; apps/cli/src/app_server/cloud_turns.rs:512,590).

**Incomplete**

- Mobile pause shows only for state running, and mobile resume sends no guidance (CloudRunDetailSheet.tsx:588-606; apps/mobile/src/features/tasks/service.ts:89-91).
- A queued steer can be withdrawn only after the run has ended; while the run is open the server answers 'It stays queued until the task reads it' (cloud-agent-run-service.ts:2892-2900; steer/[steerId]/route.ts:61-65).
- Web Stop fires with no confirmation although a cancelled run cannot be resumed (TasksPage.tsx:826; cloud-agent-run-service.ts:3195).

**Present but disconnected or switched off**

- The inline (non-durable) completions path passes cancellation and steer readers to the tool loop but no pause reader or pause checkpoint saver, so a pause requested on a run executing there would not be honoured (apps/web/app/api/llm/v1/chat/completions/route.ts:1088-1095; tool-loop.ts:6702). Which runs take that path is unknown.
- The Board layout of the shared page passes steer and stop handlers but its row controls live in TasksBoard.tsx, which was not opened.

**Not available**

- Pause: not available on VS Code (detail client picks only getRun, resumeRun, cancelRun, steerRun; cloudRunDetail.ts:35-38), Chrome, or the CLI terminal UI (no pause for a turn; 'Pause' in lib.rs:1572,1676 pauses schedules and triggers).
- Resume of a paused cloud run: not available on VS Code or Chrome. CLI resume (/resume, /load) reloads a saved local session (apps/cli/src/repl/slash_commands.rs:177; registry.rs:200).
- Resume of a stopped (cancelled) run: not possible; CLOUD_AGENT_RUN_CANCELLATION states resumable false (cloud-agent-run-service.ts:3195).
- Steer from Chrome: not available. Steer into a Code task is refused with a pointer to its Code session (steer/route.ts:74-78).

## 4. Required behaviour

**Established requirements**

- The user can redirect a running task with new guidance without starting over, on all apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.20)
- The user can pause a running task at a step boundary and it keeps its work. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.21)
- The user can resume a paused or stopped task from where it left off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.22)
- The user can stop a running task and the run is cancelled on the server. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.23)
- Cloud work can be steered from another surface while the trusted host stays authoritative for local access. (source: doc: docs/product/definition.md:139)
- Chat lifecycle actions including stop must preserve message lineage after reload. (source: doc: docs/product/experience-contract.md:775)
- An action a user cannot undo asks first, and the question names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Steering a Running task shows the message as queued, and after the next step the journal has a 'steer:' progress line with the same text.
2. A message of 4,001 characters or an empty one is refused; a message containing an API key pattern is blocked with the secret message.
3. Pause on a Running task returns 202 and the row shows 'Pausing'; within one step the state is Paused and Resume continues from the saved step count.
4. Pause on a task waiting on approval returns 409 with the 'Only a task that is still working...' text.
5. Stop on a task waiting for approval makes it Cancelled at once and a later resume attempt fails.
6. Every Stop on every app asks first and names what is lost (cannot be resumed).
7. A second device resuming the same pause gets 'Another device already resumed this task.' and no second run starts.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pause, steer and stop are entitlement-free once a run exists, because no plan check was found in those routes [inferred from the route code].
- A Local session has no cloud run, so these controls do not apply to it [inferred from DesktopTasks.tsx:51-53].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Ask before Stop on web and Tauri, like mobile, VS Code and Chrome.
- [proposed] Add Pause and Resume (with guidance) to VS Code and Chrome, and guidance to mobile resume.
- [proposed] Allow withdrawing a queued steer while the run is live, or say plainly in the UI that it cannot be taken back.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TaskSteerSection | `packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx` | Steer box, queued list, send-as-new-message button (shared by web and Tauri desktop). |
| screen | TasksPage (shared) | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | List, filters, Pause/Resume/Stop handlers, 4 s journal polling. |
| service | task-display helpers | `packages/ui/unified-chat/src/components/tasks/task-display.ts` | isPausableState, isCancellableState, isLiveTaskState, state labels. |
| endpoint | POST steer | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts` | Validates, secret-gates and queues a steer message. |
| endpoint | DELETE steer/{steerId} | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts` | Withdraws an unread message once the run has ended. |
| endpoint | POST pause | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts` | Records the pause request; 409 when not pausable. |
| endpoint | POST resume | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts` | Withdraws or performs a resume from the pause checkpoint with gates. |
| endpoint | POST run (cancel) and GET run | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Cancel request, human-held immediate cancel, journal read. |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Queue, take, withdraw steers; pause request; pause checkpoint; cancellation; human-held state sets. |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Reads cancel, pause and steer at each step; writes pause checkpoint; emits state events. |
| job | start-cloud-agent-workflow | `apps/web/lib/workflows/start-cloud-agent-workflow.ts` | Wires isPauseRequested, takeSteerMessages and onPauseCheckpoint for durable and resumed runs. |
| service | stopped-run-turn | `apps/web/app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts` | Marks the assistant turn as stopped after a cancel. |
| service | managed run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Typed client: cancelRun, pauseRun, resumePausedRun, steerRun, withdrawSteer. |
| schema | cloud agent run contract | `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts` | Steer limits, run schema, isCloudAgentRunSteerable. |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-service.ts:2732` | Holds state, pause_requested_at, cancellation_requested_at, pending_steer. |
| table | cloud_agent_approval_checkpoints | `apps/web/lib/services/cloud-agent-run-service.ts:2995` | Stores the pause checkpoint (checkpoint_kind pause) with lease. |
| store | useCloudTaskStore | `apps/mobile/src/features/tasks/store.ts` | Mobile stopRun, pauseRun, resumeRun with account-epoch guards. |
| component | CloudRunSteerSection | `apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx` | Mobile steer form and send-as-new-message. |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile Pause, Resume and Stop buttons. |
| command | showCloudRunDetail | `apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts` | VS Code steer and stop actions. |
| component | tasksSheet | `apps/extension/src/features/side-panel/tasksSheet.ts` | Chrome Tasks sheet with Stop and confirmation. |
| service | managedRunControl | `apps/extension/src/features/cloud-bridge/managedRunControl.ts` | Chrome cancel with confirmation that the run reached a terminal state. |
| command | CLI turn queue and cancel | `apps/cli/src/tui/tui_app.rs` | Queued prompts, Esc/Ctrl-C cancel of a local turn. |
| integration | CLI cloud turns host | `apps/cli/src/app_server/cloud_turns.rs` | cloud/turn/stop and cloud/turn/resume for other clients through the app-server. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Send, Pause, Resume or Stop; the app calls the managed run client with the account token and, on web, a CSRF header. | device | managed-cloud-agent-runs-client.ts:389,469,483,503; apps/web/features/tasks/services/cloud-tasks-client.ts:10-15 |
| The route rate-limits (bucket llm-completion), checks CSRF, opens a user-scoped database connection and validates ids. | our servers | runs/[runId]/pause/route.ts:31-38; apps/web/lib/rate-limit.ts:359 |
| Steer: secret-handling gate, then an update appends the message to pending_steer if the run is in an executor-held state with no pause or cancel pending and fewer than 10 queued. | our servers | steer/route.ts:50-65; cloud-agent-run-service.ts:2798-2830 |
| Pause and cancel only set timestamps (pause_requested_at, cancellation_requested_at); an audit event agent_run_lifecycle_changed is written. | our servers | cloud-agent-run-service.ts:1174-1187,2727-2744; pause/route.ts:42-48; [runId]/route.ts:91-97 |
| The executor (tool loop, running in the durable workflow or inline) checks cancel, then pause, then takes steers at each step; on pause it saves a checkpoint and stops; on cancel it ends the turn as cancelled. | our servers | tool-loop.ts:6698-6738; start-cloud-agent-workflow.ts:430-466 |
| A run parked on a person (awaiting input, approval or paused) is cancelled directly by the route, its pending checkpoint failed and a cancelled event journaled. | our servers | cloud-agent-run-service.ts:3120-3171; [runId]/route.ts:81-85 |
| Resume claims the pause checkpoint, rebuilds the request from the checkpoint, runs the model through the tool loop again with the guidance as a user message, and streams events; the client discards the stream and re-reads the list and journal. | our servers | resume/route.ts:196-356; managed-cloud-agent-runs-client.ts:483-501; TasksPage.tsx:406-425 |
| The shared page polls the run journal every 4 seconds while the selected run is live and shows the new state. | device | TasksPage.tsx:127,521-534 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Queued steer messages | column pending_steer (json list) on table cloud_agent_runs | Server-side; every device reads them in the run snapshot as pendingSteers | Emptied when the executor takes them; removed when withdrawn after the run ends; retention rule unknown |
| Steer journal line (progress-update, progressId steer:<id>) | table cloud_agent_events | Yes, any client reading the journal sees it | Kept with the run journal; deletion rule unknown |
| Pause checkpoint (messages, event cursor, step count, request snapshot) | table cloud_agent_approval_checkpoints with checkpoint_kind pause | Server only | Marked resolved when resumed; marked failed when the paused run is cancelled |
| Pause and cancel request times | cloud_agent_runs.pause_requested_at and cancellation_requested_at | Returned to clients as pauseRequestedAt and cancellationRequestedAt | pause time cleared when the pause lands or is withdrawn |
| Audit event agent_run_lifecycle_changed | security audit log (store not opened) | Server only | unknown |
| Task layout choice | browser storage key agi-tasks-layout | No, per browser | Kept until the person clears site data |

**Models and providers.** These controls are model-agnostic: they act on the run row and the loop, not on a model. A steer or guidance becomes a user message to whatever model the run already uses. Resume continues under the model selection saved in the pause checkpoint (test: apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.test.ts:319). If the first model fails, the loop can fail over to another (tool-loop failover option, start-cloud-agent-workflow.ts:423-429). Provider and billing details are in SYS-inference-providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in AGI account is required on every app. Rows are scoped to the owner (user_id) and to the active workspace for steer and withdraw (cloud-agent-run-service.ts:2809,2893). |
| Permissions | Web requires a CSRF token for cookie sessions on steer, withdraw, pause and cancel (pause/route.test.ts:73; steer/route.test.ts:229). A cross-tenant run answers 404, not 403 (pause/route.test.ts:65). |
| Subscription | Starting a Work run needs the canUseAgiWork capability (agi_work, plans pro, max, max_15x, team, team_premium, enterprise; billing-catalog.ts:341,354). Steer, pause and cancel routes contain no plan check. Resume runs the managed compute gate, the organization policy gate and the spend-limit gate and settles a Free-plan reservation if the continuation cannot start (resume/route.ts:165-189; resume/route.test.ts:392-432). |
| Limits and metering | Steer: 4,000 characters, 10 queued per run. Pause, steer, withdraw and cancel share the llm-completion limit (30 per minute per user, fail closed); reading a run uses agent-run-follow (120 per minute) (apps/web/lib/rate-limit.ts:359,374). A resumed turn takes a managed turn slot and managed usage reservation (resume/route.ts:420-424,286-312). |
| Feature flags | Mobile: FEATURES.cloudTasks (apps/mobile/lib/v1FeatureFlags.ts:10). No other flag found for these controls. |
| Model compatibility | None found in the code for steer, pause or cancel. Resume re-renders under the saved model selection. |
| Provider restrictions | none found in the code for steer, pause, cancel. Whether an own-key (BYOK) turn creates a run record at all is unknown. |
| Local mode | Local mode has no cloud run: the Tauri Tasks panel is not shown in local privacy mode and says local sessions are not listed (DesktopShellV3.tsx:790; DesktopTasks.tsx:51-53). The CLI controls in this page act on a local turn and need no subscription or sign-in (tui_app.rs:2074). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Buttons show a spinner and are disabled while a pause, resume or stop call is in flight. | TasksPage.tsx:796-830 |
| Pause requested but not reached | Badge 'Pausing'; the button turns to 'Keep working', which calls resume and the server withdraws the pause request. | TasksPage.tsx:788; resume/route.ts:157-163; TasksPage.pause.test.tsx:63 |
| Run not pausable (waiting or finished) | Server answers 409; UI shows the error and 'It is still working'. | pause/route.ts:58-62; TasksPage.tsx:376-379 |
| Steer queue full | 409 'This task already has 10 messages waiting'. | steer/route.ts:79-83 |
| Steer into a Code task | 409 pointing to the Code session. | steer/route.ts:74-78 |
| Run ended before the steer was read | Message shows 'Not read before the task finished' and can be sent as a new chat message; this first withdraws it. | TaskSteerSection.tsx:81-99; TasksPage.tsx:393-404 |
| Another device resumed or answered first | 409 mapped to 'Another device already resumed this task.' / 'Another device already answered this approval.' | TasksPage.tsx:175-184,418-421 |
| Context policy changed while paused | Resume is refused with a restart-required code and the pause is returned. | resume/route.ts:219-228 |
| Workflow cannot start | 503 'Agent continuation is temporarily unavailable.'; reservation settled; pause lease released. | resume/route.ts:357-375 |
| Offline | Not handled in the code in the shared page beyond the generic error toast; polling stops with 'Live updates stopped' if a background re-read fails. | TasksPage.tsx:312-316 |
| Stop confirmed late | The provider call in flight is billed and settled; committed tool and connector writes remain. | cloud-agent-run-service.ts:3189-3193 |
| Accessibility | Steer textarea has a screen-reader label; error uses role alert; mobile buttons carry hints; mobile detail takeover traps focus and closes on Escape. | TaskSteerSection.tsx:107,144; CloudRunDetailSheet.tsx:601; TaskDetailPanel.tsx:95-150 |
| App differences | Chrome and VS Code confirm Stop; web and Tauri do not; mobile pause only for running. | tasksSheet.ts:90-122; cloudRunDetail.ts:314; TasksPage.tsx:826; CloudRunDetailSheet.tsx:597 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TaskSteerSection.test.tsx`: Queued versus unread messages, send-as-new-message, resend failure.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.pause.test.tsx`: Pause pending, withdraw via resume, guidance on resume, Resume replaces Pause, another-device conflict.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.test.ts`: 202 on pause, 409 when not pausable, hidden cross-tenant run, CSRF.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.test.ts`: Queueing, length refusal, secret block and redact, Code task, full queue, CSRF.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.test.ts`: Withdraw after end, refusal while readable, not-found cases, CSRF.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.test.ts`: Pause withdraw, not paused, double resume, checkpoint continuation, gates, reservation settlement.
- `apps/web/__tests__/api/cloud-agent-runs.test.ts`: Cancellation request, stopped turn record, immediate end of human-held runs, owner scope.
- `apps/mobile/src/features/tasks/__tests__/store.test.ts`: Mobile task store (exact cases not read).
- `apps/extension/__tests__/tasks-sheet.test.ts`: Chrome: stop only after confirmation, list and open, reset on account change.
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: VS Code: detail items, no stop for a finished run, approvals.

**Test scenarios**

- **Steer a running task**
  1. Sign in on a plan with Work, start a Work task, open it in /tasks.
  2. Type 'only use primary sources' and press Send.
  3. Wait one to two steps and refresh the detail.
  - Expected: The message is listed as queued, then disappears from the queue and a completed progress line with the same text appears in Progress.
- **Pause then resume with guidance**
  1. Press Pause on a Running row.
  2. Confirm the badge reads Pausing, then Paused.
  3. Type guidance under the row and press Resume.
  - Expected: State goes Resuming then Running; the guidance appears as 'Applied your guidance' in Progress; steps already done are not repeated.
- **Withdraw a pending pause**
  1. Press Pause.
  2. Before the next step lands, press 'Keep working'.
  - Expected: Badge returns to Running with no paused checkpoint created.
- **Stop a run waiting for approval**
  1. Start a task that needs a tool approval and leave it waiting.
  2. Press Stop.
  - Expected: Run shows Cancelled at once; no resume control is offered; the chat turn is marked stopped.
- **Cross-device stop**
  1. Start a task on web.
  2. Open the phone app, open the task, press Stop and confirm.
  3. Reload web.
  - Expected: Web shows Cancelled; the phone confirmation text said the task cannot be resumed.
- **Pause refused**
  1. Open a task that is waiting for approval and call the pause endpoint (or press Pause if shown).
  - Expected: HTTP 409 with 'Only a task that is still working can be paused'.

**Where to look when it fails**

- Client console lines '[Tasks] Failed to pause task:', '[Tasks] Failed to cancel task:', '[Tasks] Failed to resume task:' (TasksPage.tsx:344,375,426).
- Server error names CloudAgentRunNotPausableError, CloudAgentRunSteerQueueFullError, CloudAgentRunSteerStillReadableError, CloudAgentApprovalCheckpointConflictError.
- Response codes run_not_paused, run_already_resuming, agent_workflow_unavailable (resume/route.ts:201-207,367).
- Log text 'Paused cloud agent run lease could not be released' and 'Paused run continuation could not be started on either transport'.
- Tables cloud_agent_runs (pause_requested_at, cancellation_requested_at, pending_steer), cloud_agent_events, cloud_agent_approval_checkpoints.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- VS Code: [70-qa/test-plans/vscode/060-agentic-work-product.md](../../70-qa/test-plans/vscode/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Pause is missing on VS Code, Chrome and the CLI, and is limited on mobile (running only, no guidance on resume).** Affects: VS Code, Chrome, CLI users; mobile users. Evidence: cloudRunDetail.ts:35-38; CloudRunDetailSheet.tsx:588-606; service.ts:89-91. Work needed: Add pause and resume actions to VS Code and Chrome; accept guidance on mobile resume.
- **S60.22 says paused or stopped runs can resume, but a stopped run cannot be resumed by design.** Affects: All apps. Evidence: cloud-agent-run-service.ts:3195; mobile and Chrome confirmation texts say it cannot be resumed. Work needed: Decide the requirement; update the brief or build resume-after-stop.
- **Stop on web and the Tauri desktop build has no confirmation, though it is irreversible.** Affects: Web, desktop. Evidence: TasksPage.tsx:826; AGENTS.md section 9. Work needed: Use the shared confirmation surface before cancelRun.
- **The inline completions path has no pause reader, so a pause request there may never land.** Affects: Runs on that path (which ones is unknown). Evidence: route.ts:1088-1095 vs tool-loop.ts:6702. Work needed: Trace which runs use it; refuse pause there or pass the pause reader and checkpoint saver.
- **A queued steer cannot be taken back while the task is live, and the UI does not say so.** Affects: Web, mobile. Evidence: cloud-agent-run-service.ts:2899; TaskSteerSection.tsx:81-99. Work needed: Explain in the UI or allow withdrawal before the executor takes it.
- **Chrome has no steer; the CLI queue is a next prompt, not a mid-run steer; the brief marks CLI and VS Code resume as done but neither resumes a cloud run.** Affects: Chrome, CLI, VS Code. Evidence: tasksSheet.ts; tui_app.rs:7274-7275; cloudRunDetail.ts:35-38. Work needed: Correct the brief; build or consciously drop each control per app.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- api:POST /api/llm/v1/chat/completions/runs/{runId}/steer
- api:DELETE /api/llm/v1/chat/completions/runs/{runId}/steer/{steerId}
- api:POST /api/llm/v1/chat/completions/runs/{runId}/pause
- api:POST /api/llm/v1/chat/completions/runs/{runId}/resume
- api:POST /api/llm/v1/chat/completions/runs/{runId}
- table:cloud_agent_runs
- table:cloud_agent_events
- table:cloud_agent_approval_checkpoints
- file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-execution-boundaries
- SYS-api-and-contracts
- SYS-authentication-and-identity

## Unknown

- Which runs execute on the inline completions path versus the durable workflow, and so whether pause can be ignored.
- Whether a resumed run keeps going if the client drops the response stream on the inline fallback.
- Whether an own-key (BYOK) turn creates a run row that can be steered or paused.
- How the Board layout (TasksBoard.tsx, not opened) confirms or does not confirm Stop.
- Whether any test exercises the tool loop pause boundary end to end (not searched).
- Retention period of cloud_agent_events and of audit events.
- Whether the CLI TUI exposes the app-server cloud/turn/stop and resume methods to a person.
