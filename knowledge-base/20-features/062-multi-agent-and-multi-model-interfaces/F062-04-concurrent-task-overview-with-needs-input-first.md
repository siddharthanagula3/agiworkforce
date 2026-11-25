---
id: "F062-04"
type: "feature"
title: "Concurrent task overview with needs-input first"
aliases: ["Work history", "Tasks page", "Needs you", "Cloud tasks", "AGI Work screen", "Cloud tasks tree", "Concurrent task view", "Inline unblock", "S62.09", "S62.10", "S62.11"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S62.09", "S62.10", "S62.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "mode:cloud", "table:cloud_agent_runs", "table:cloud_agent_events", "table:cloud_agent_approval_checkpoints", "api:GET /api/llm/v1/chat/completions/runs", "api:POST /api/llm/v1/chat/completions/runs/{runId}/resume", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-sync-and-continuity", "F062-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-04 Concurrent task overview with needs-input first

One overview of many Cloud agent runs. Runs that wait for the person (needs input, approval, paused) come first or have their own filter, and can be answered in place. Web and desktop: Work history page. Mobile: AGI Work screen. VS Code: Cloud tasks tree. Chrome: a Tasks sheet with Open and Stop only.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.09](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6209), [S62.10](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6210), [S62.11](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6211).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the person's Cloud AGI Work runs from every app, shows state, model, age and cost, and lets the person approve, deny, steer, pause, resume, stop or archive without leaving the list. Waiting runs are surfaced first.

**Why it exists.** Long agent runs stall when they need a decision. A single overview with a Needs you view and in-place answers keeps many runs moving (doc: docs/product/experience-contract.md rule 6; docs/product/suite.md Cloud Work).

**Who uses it.** Anyone running AGI Work or research in Cloud on web, desktop, mobile or VS Code.

**Problems it solves**

- Several runs at once are visible in one place.
- A waiting approval is not buried among finished runs.
- Another device may already have answered; the page says so ('Another device already answered this approval.').

**Use cases**

- Open Work history on web, press 'Needs you', approve a pending tool call.
- On mobile, open AGI Work, filter 'Needs you', open a run and tap Approve.
- In VS Code, see a run under 'Needs you' and approve it from the tree.
- Switch web to Board layout to see runs by stage.

## 2. User experience

**Where to find it**

- Web: /tasks, heading 'Work history', subtitle 'Your Cloud work sessions' (apps/web/app/tasks/page.tsx; apps/web/features/chat/lib/agi-work.ts:5-7; TasksPage.tsx:548-552).
- Desktop Tauri: DesktopTasks shows the same shared page after sign-in; signed-out text 'Sign in to see your tasks' (apps/desktop/src/features/tasks/DesktopTasks.tsx:34-46). Electron desktop: hosted web page, [inferred].
- Mobile: AGI Work screen (title 'AGI Work', subtitle 'AGI Cloud') at route /(app)/tasks, drawer item 'tasks' when AGI Work is on (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:67-68; apps/mobile/src/features/drawer/components/DrawerContent.tsx:567).
- VS Code: Cloud tasks tree, command agi-workforce.showCloudTasks (apps/extension-vscode/package.json:533; cloudTasksTree.ts).
- Chrome: side panel More menu entry 'Tasks' opens a sheet titled 'Tasks' (apps/extension/src/side_panel.ts:12066-12072; _locales/en/messages.json spTasksTitle).
- CLI: no needs-you overview; approvals use an overlay (apps/cli/src/tui/widgets/approval_overlay.rs) and the '⧉ N subagents working at once' line.

**Before you start**

- Signed-in Cloud account on every app.
- Mobile: Cloud mode and Cloud unlocked, else a gate screen (CloudTasksScreen.tsx:657-664).
- Runs come only from AGI Work mode; ordinary chat turns are not listed (apps/web/app/api/llm/v1/chat/completions/runs/route.ts:150-158).

**Screens and controls**

- Web: filter buttons Active, Needs you, All, Archived (aria-label 'Filter work sessions'); layout buttons List and Board; run cards with Open chat, Pause, Resume, Stop, Archive, Restore; 'Show more' (TasksPage.tsx:61-72, :555-566).
- Web approval card 'Waiting for your approval' with approve and deny buttons and optional guidance box 'Add guidance to steer this run (optional)'; paused runs have box 'Tell the agent what to change when it resumes (optional)' (TasksPage.tsx:896-935, :866-880).
- Web detail panel: 'Message the agent to add instructions or change course' with Send (TaskSteerSection.tsx:124-142).
- Mobile filters All, Needs you, Running, Finished; sections Today, Yesterday, This Week, Older; 'Load more'; search; 'New task' button (runPresentation.ts:21-42; CloudTasksScreen.tsx).
- VS Code tree groups Needs you, Working, Ready for review, Done, Stopped; commands Approve and Reject on runs with a pending approval (cloudTasksTree.ts:36-42; package.json:552-557).
- Chrome sheet rows: title, state and time, Open, Stop with confirmation, 'All tasks on the web'.

**Journey**

1. 1. Open the overview (/tasks, AGI Work, Cloud tasks, Tasks sheet).
2. 2. Pick 'Needs you' or read the top of the list.
3. 3. On web, press approve or deny on the card, optionally typing guidance; on mobile open the run and press Approve or Deny; on VS Code press Approve or Reject.
4. 4. The card or row updates; the list reloads.
5. 5. To change course, send a message to the agent from the detail panel (web, desktop, mobile) or the VS Code run detail 'steer' action.

**What the person sees and gets**

- Empty states: 'Nothing needs you right now' with 'Sessions waiting for your approval, an answer or a resume show up here.'; 'No <filter> work sessions yet'; 'Archived tasks stay here until you restore them.' (TasksPage.tsx:597-612).
- Errors: 'Could not load your tasks. Retry in a moment.' with Retry; 'Could not send your decision. Check the task activity before retrying.' (TasksPage.tsx:142-150).
- Toasts: 'Another device already answered this approval.', 'This approval expired and the task can no longer continue from it.' (TasksPage.tsx:142-147).
- VS Code empty: 'No cloud tasks yet'; signed out: 'Sign in to see your cloud tasks'; failure: 'Cloud tasks could not be loaded' (cloudTasksTree.ts:146-176).
- Mobile stop confirmation: 'Stop this task?' ... 'Keep it running' / 'Stop task' (CloudTasksScreen.tsx:622-629).

**Settings**

- Web layout choice stored in browser under agi-tasks-layout (TasksPage.tsx:83).
- Mobile: background alerts note links to notification settings (CloudTasksScreen.tsx:746).
- VS Code auto-refresh every 15 s when enabled (cloudTasksTree.ts:11, :105-112).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop shared page: filters, list and board, paging 25 at a time, needs-input runs sorted first in the list, inline approve or deny with guidance, steer messages, pause, resume, stop, archive (web only) (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:57, :218-221, :262-488).
- Needs-you states are awaiting_input, awaiting_approval and paused (TasksPage.tsx:61-65).
- Server lists runs paged (limit 1-100, default 25) with a cursor, restricted to AGI Work mode, with optional search and project filter (runs/route.ts:78-190).
- Resume of an approval runs through managed compute, organisation policy and spend-limit gates (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:166-186).
- Mobile: filters, recency sections, 15 s poll while steerable runs exist, approval resolve, stop, pause, resume, rerun, routine, share (CloudTasksScreen.tsx:64, :455-462; service.ts).
- VS Code: tree grouped by stage with needs-you first; runs with a pending approval are forced into Needs you (cloudTasksTree.ts:144-146); approve, reject, steer, cancel and rename from the detail pick list (cloudRunDetail.ts:50-60).
- Chrome: lists 20 runs and can stop a live run (tasksSheet.ts:13, :95-130).

**Incomplete**

- Mobile has no needs-first ordering in the 'All' filter; needs-input runs are reachable through the 'Needs you' filter and sort by recency like the rest (runPresentation.ts:160-190). The earlier draft's 'own stage on mobile' is not what the code does.
- Board layout orders by stage columns; 'Needs approval' is the third column, not first (packages/contracts/types/src/cross-device.ts:398-411).
- VS Code lists only the first 25 runs and calls the list without a state filter, so it gets the server's default active states; the Done and Stopped groups are then [inferred] mostly empty (cloudTasksTree.ts:137, runs/route.ts:36-42).
- Archive exists only where the host supplies setRunArchived: web yes, desktop Tauri no (DesktopTasks.tsx vs web TasksPage.tsx:54).
- Chrome has no needs-you ordering and no inline reply; it can only Open and Stop (tasksSheet.ts).
- CLI has no needs-you priority; approvals come as an overlay for the current session only.

**Present but disconnected or switched off**

- Mobile screen is gated by FEATURES.cloudTasks (true) and Cloud mode (apps/mobile/lib/v1FeatureFlags.ts:10; CloudTasksScreen.tsx:655-664).
- Archive control hidden when the host cannot archive (TasksPage.tsx comment lines 213-218).

**Not available**

- CLI: no overview of Cloud runs.
- VS Code: no needs-input free-text answer; approvals only approve or reject (cloudRunApproval.ts).

## 4. Required behaviour

**Established requirements**

- The user can watch several running tasks or agents at once in one view. (source: brief S62.09)
- Tasks or agents that need the user's input are surfaced first. (source: brief S62.10)
- The user can unblock a waiting task inline without leaving the overview. (source: brief S62.11)
- An Archive control is painted only where archive is wired: a button that does nothing is worse than none. (source: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:213-218)
- Capability honesty: a hidden or disabled control is better than an enabled no-op. (source: docs/product/experience-contract.md rule 4)
- Cloud tasks surface is general availability on web, desktop, mobile and VS Code; Chrome is listed Unverified in the matrix. (source: docs/product/surface-feature-matrix.md:93, :472-478)

**Acceptance criteria**

1. Web: pressing 'Needs you' lists only runs in awaiting input, awaiting approval or paused.
2. Web list view: a run waiting on approval appears above running runs in 'Active'.
3. Web: pressing the approve button on a pending approval card resolves it and reloads the list.
4. Web: a run listing is 25 at a time with 'Show more' when more exist.
5. Mobile: filter 'Needs you' shows only blocked runs; opening one shows approval Approve and Deny.
6. VS Code: a run with a pending approval appears under 'Needs you' and Approve works from its context menu.
7. An approval already answered elsewhere shows 'Another device already answered this approval.'
8. Chrome: Stop asks 'Stop this task?' before ending the run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Chrome should get needs-you ordering and an approval reply to meet S62.10 and S62.11.
- [inferred] Mobile 'All' view should place needs-input runs first to meet S62.10 without a filter.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a count badge for Needs you on every surface.
- [proposed] Page the VS Code tree beyond 25 runs.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TasksPage (shared) | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Overview, filters, ordering, inline approval, steer, pause, archive. |
| component | TasksBoard | `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx` | Board layout by stage with unread marker. |
| component | TaskDetailPanel and TaskSteerSection | `packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx` | Reply and steer box (isCloudAgentRunSteerable). |
| service | task-display helpers | `packages/ui/unified-chat/src/components/tasks/task-display.ts` | State tones, live states, cost formatting. |
| config | AGENT_TASK_BOARD_STAGES | `packages/contracts/types/src/cross-device.ts` | Stage names and the state-to-stage map (398-440). |
| component | web TasksPage wrapper | `apps/web/features/tasks/components/TasksPage.tsx` | Transport: open chat, archive, rerun, routine. |
| service | cloud-tasks-client | `apps/web/features/tasks/services/cloud-tasks-client.ts` | Managed run client and archive call. |
| screen | tasks route and layout | `apps/web/app/tasks/page.tsx` | Route; layout checks session and adult eligibility. |
| endpoint | GET /api/llm/v1/chat/completions/runs | `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | Paged list restricted to AGI Work. |
| endpoint | POST .../runs/{runId}/resume | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts` | Approve or reject, resume paused run, with gates. |
| endpoint | POST .../runs/{runId}/steer | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts` | Queue a message for the agent. |
| endpoint | POST .../runs/{runId}/pause, POST/DELETE .../archive | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts` | Pause and archive actions (archive/route.ts). |
| table | cloud_agent_runs | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Run state, model, origin surface, work mode. |
| component | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Tauri host of the shared page. |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Mobile overview. |
| service | runPresentation and service | `apps/mobile/src/features/tasks/runPresentation.ts` | Filters, labels, grouping; service.ts calls the run client. |
| store | useCloudTaskStore | `apps/mobile/src/features/tasks/store.ts` | Mobile list and detail state. |
| component | CloudTasksTreeProvider | `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | VS Code tree with stages. |
| service | cloudRunApproval and cloudRunDetail | `apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts` | Approve and reject with confirmation; detail actions. |
| component | tasksSheet | `apps/extension/src/features/side-panel/tasksSheet.ts` | Chrome Tasks sheet. |
| service | managedRunControl | `apps/extension/src/features/cloud-bridge/managedRunControl.ts` | Chrome list and cancel calls. |
| config | FEATURES.cloudTasks | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile flag (line 10). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client calls the run list with the chosen states and a 25-run limit. | our servers | TasksPage.tsx:216-224; runs/route.ts:78-190 |
| Server reads the person's runs under row-level security and returns a page and cursor. | our servers | runs/route.ts:112; table cloud_agent_runs |
| Client sorts needs-input runs first (web list) or filters by state (mobile, web Needs you). | device | TasksPage.tsx:218-221; runPresentation.ts:21-42 |
| On approve or deny the client posts the decision; the server applies gates, claims the pause checkpoint and continues the run in the managed service. | our servers | resume/route.ts:150-215 |
| The continued run calls a model provider on our managed route. | outside service | resume/route.ts imports processRequest and runCloudAgentTurn (lines 24-48) |
| Client reloads the list and re-reads the open run's journal. | device and our servers | TasksPage.tsx:435-440 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run state, model, origin surface, usage | table cloud_agent_runs | Server is the source for all surfaces | Archive hides a run; deletion policy unknown. |
| Run events journal | table cloud_agent_events | Read by every Cloud surface | Cascade delete with the run. |
| Approval checkpoints | table cloud_agent_approval_checkpoints | Server side | Lease of 86,400 s on claim (resume/route.ts:176). |
| Layout choice | store:browser localStorage (agi-tasks-layout) | No | Browser-local. |

**Models and providers.** A run records its provider and model; the page shows a managed model label (getManagedModelPresentationLabel, TasksPage.tsx:735). Resume continues on the managed route; Local and own-key runs are not listed here (DesktopTasks.tsx:41-46).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account on every app (web layout redirects when no session, tasks/layout.tsx:14-19; mobile gate; VS Code and Chrome sign-in prompts). |
| Permissions | Per-user rows; an adult-eligibility check on web (tasks/layout.tsx:19). Approvals expire; another device may win the answer. |
| Subscription | Starting AGI Work needs the 'canUseAgiWork' capability on mobile (CloudTasksScreen.tsx:669). Resume is checked by managed compute, organisation policy and spend gates, and free-tier trial handling (resume/route.ts:166-186). Run cost shows credits or 'free trial allowance'. |
| Limits and metering | 25 runs per page; list rate limit 'agent-run-follow'; steer and pause rate limit 'llm-completion' (steer/route.ts:41, pause/route.ts:31). Mobile poll 15 s; web journal poll 4 s; VS Code refresh 15 s. |
| Feature flags | Mobile FEATURES.cloudTasks (v1FeatureFlags.ts:10). Others none found. |
| Model compatibility | not model specific; the run keeps whichever managed model started it. |
| Provider restrictions | Only managed Cloud runs appear; Local and own-key developer sessions are separate lists. |
| Local mode | Overview unavailable in Local mode: mobile shows a gate; Tauri desktop says local sessions are not listed. Nothing is sent from the device in Local mode by this feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading your work history…' (web); 'Loading Cloud tasks…' (mobile). | TasksPage.tsx:567-573; CloudTasksScreen.tsx:704-709 |
| Empty | Filter-specific messages and a Start button. | TasksPage.tsx:597-625 |
| Error | Alert with Retry; mobile ErrorState with retry. | TasksPage.tsx:574-587 |
| Retry | Retry button; failed approval reloads the list. | TasksPage.tsx:440-445 |
| Cancel | Stop button; confirmation on mobile and Chrome. | CloudTasksScreen.tsx:622; tasksSheet.ts:103-125 |
| Offline / stale | Background journal failure says live updates stopped; mobile polls only when foreground. | TasksPage.tsx:312-317; CloudTasksScreen.tsx:447-452 |
| Pause requested | Badge reads 'Pausing' and the button becomes 'Keep working'. | TasksPage.tsx:737-743 |
| Race with another device | Already-answered and expired messages. | TasksPage.tsx:142-147; service.ts:23-26 |
| Accessibility | Cards have buttons labelled 'View details for <title>, <state>'; board manages focus after a move; tree items have accessibility labels. | TasksPage.tsx:688-692; TasksBoard.tsx:80-95; cloudTasksTree.ts:60-64 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: Inline approvals on the shared page.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.pause.test.tsx`: Pause and resume.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.archive.test.tsx`: Archive and restore.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.cost.test.tsx`: Cost on cards.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TaskSteerSection.test.tsx`: Steer box.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksBoard.unread.test.tsx`: Board unread marker.
- `apps/web/features/tasks/components/TasksPage.test.tsx`: Web wrapper.
- `apps/web/features/tasks/__tests__/cross-surface-task-state.test.ts`: Same state across surfaces.
- `apps/web/app/api/llm/v1/chat/completions/runs/route.test.ts`: List route.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.test.ts`: Resume route.
- `apps/web/e2e/chats-and-tasks-page.spec.ts`: Browser flow for chats and tasks page (detail not read).
- `apps/desktop/src/features/tasks/__tests__/DesktopTasks.test.tsx`: Tauri wrapper.
- `apps/mobile/src/features/tasks/__tests__/CloudTasksScreen.test.tsx`: Mobile screen.
- `apps/mobile/src/features/tasks/__tests__/runPresentation.test.ts`: Filters and grouping.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetApproval.test.tsx`: Approval in the sheet.
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: VS Code tree and approval commands.
- `apps/extension/__tests__/tasks-sheet.test.ts`: Chrome sheet.

**Test scenarios**

- **Needs you filter**
  1. Create an AGI Work run that reaches a tool approval.
  2. Open Work history, press Needs you.
  - Expected: Only waiting runs listed; the pending approval card shows.
- **Inline approve**
  1. On the card press approve with guidance text.
  - Expected: Run continues, card leaves Needs you, list reloads.
- **Answered elsewhere**
  1. Approve the same run on mobile first, then on web.
  - Expected: Web shows 'Another device already answered this approval.'
- **Paging**
  1. Have more than 25 runs; press Show more.
  - Expected: Next 25 append.
- **VS Code needs-you**
  1. Open Cloud tasks with a waiting run.
  - Expected: 'Needs you' group is first and expanded.
- **Chrome stop**
  1. Open More > Tasks, press Stop on a live run, confirm.
  - Expected: 'Task stopped.' and the list refreshes.

**Where to look when it fails**

- Web console '[Tasks] Failed to load tasks:' and '[Tasks] Failed to resolve task approval:'.
- Server errors from runs routes and rate limit 'agent-run-follow'.
- Tables cloud_agent_runs, cloud_agent_events, cloud_agent_approval_checkpoints.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md)
- Desktop: [70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md)
- Mobile: [70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md)
- CLI: [70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md)
- VS Code: [70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md)
- Chrome: [70-qa/test-plans/chrome/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/chrome/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **Chrome has no needs-you ordering or inline reply.** Affects: Chrome. Evidence: tasksSheet.ts actions are Open and Stop. Work needed: Add the Needs you view and approve or deny.
- **Mobile 'All' view does not put needs-input runs first.** Affects: Mobile. Evidence: runPresentation.ts:160-190 sorts by recency. Work needed: Sort blocked runs first or add a header.
- **CLI has no Cloud run overview.** Affects: CLI. Evidence: No code found. Work needed: Product decision.
- **VS Code lists only 25 runs and likely hides finished groups.** Affects: VS Code. Evidence: cloudTasksTree.ts:137, runs/route.ts:36-42. Work needed: Pass states and a cursor.
- **Desktop Tauri cannot archive.** Affects: Desktop Tauri. Evidence: DesktopTasks.tsx has no setRunArchived. Work needed: Wire archive or keep Electron as the public desktop.
- **Overview covers AGI Work runs only; chat and Local sessions are not shown.** Affects: All. Evidence: runs/route.ts:150-158. Work needed: Product decision on a combined view.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- mode:cloud
- table:cloud_agent_runs
- table:cloud_agent_events
- table:cloud_agent_approval_checkpoints
- api:GET /api/llm/v1/chat/completions/runs
- api:POST /api/llm/v1/chat/completions/runs/{runId}/resume
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-sync-and-continuity
- F062-03

## Unknown

- Whether the server's state filter matches the finer workState such as awaiting approval; only client code was read.
- Whether the Electron desktop exposes /tasks.
- Retention and deletion policy for runs and events.
- What the CLI approval overlay does for children's approvals beyond showing a label (apps/cli/src/subagent.rs:680 uses a named approval sink).
- Content of the e2e flow in chats-and-tasks-page.spec.ts.
- Chrome managedRunControl details beyond list and cancel.
