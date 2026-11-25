---
id: "F004-05"
type: "feature"
title: "AGI Work tasks, approvals and details"
aliases: ["AGI Work", "Work", "Work history", "Tasks", "/tasks", "Cloud tasks", "Work-task home", "Active-task dashboard", "Approvals inbox", "Task details", "S4.13", "S4.14", "S4.15", "S4.16", "agiwork", "cloud_agent_runs"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.13", "S4.14", "S4.15", "S4.16"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-sync-and-continuity", "table:cloud_agent_runs", "table:cloud_agent_events", "api:GET /api/llm/v1/chat/completions/runs", "api:POST /api/llm/v1/chat/completions/runs/{runId}/resume", "api:POST /api/llm/v1/chat/completions/runs/{runId}/archive"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-05 AGI Work tasks, approvals and details

AGI Work runs a goal in many steps on our servers. People start it from the chat composer in Work mode, then watch runs on the Work history page (/tasks), open a run to read its activity, and approve or deny a step that waits for them. Mobile shows the same runs in cloud mode; VS Code shows a task tree with approvals.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.13](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s413), [S4.14](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s414), [S4.15](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s415), [S4.16](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s416).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Starts long, multi-step work that the assistant carries out with tools, lists every run with its state, shows a run's journal and outputs, and asks the person to approve sensitive tool calls.

**Why it exists.** Long tasks need supervision: a place to follow progress and a safe stop for risky actions (apps/web/app/agi-work/page.tsx approval copy).

**Who uses it.** People on a plan with the agi_work capability (pro and above in code) on Web, Desktop, Mobile, VS Code; Chrome shows a list.

**Problems it solves**

- Losing track of long jobs.
- Risky tool calls running without consent.
- Approvals missed when away from the computer.

**Use cases**

- Give a goal 'Compare these three vendors' and watch it work.
- Open the Needs you filter and approve a waiting tool call.
- Pause a run and resume with guidance.
- Re-run an old goal in a new Work chat.

## 2. User experience

**Where to find it**

- Web: composer mode control 'Work' next to Chat on /chat; /agi-work opens it for signed-in people (ChatComposerNew.tsx:314-341; proxy.ts:209).
- Web: /tasks page titled 'Work history' with subtitle 'Your Cloud work sessions' (apps/web/app/tasks/page.tsx:7; TasksPage.tsx:549-551).
- Web: filters 'Active', 'Needs you', 'All', 'Archived' (TasksPage.tsx:70-75); layout 'List' or 'Board' (TasksPage.tsx:79-82).
- Mobile: drawer row 'AGI Work' (folded under More) opens the runs list; filters 'All', 'Needs you', 'Running', 'Finished' (runPresentation.ts:15-37); detail opens in a sheet (CloudRunDetailSheet.tsx).
- VS Code: 'Code: Show Cloud Tasks' tree with groups Needs you, Working, Ready for review, Done, Stopped (cloudTasksTree.ts:45-50); approve and reject commands.
- Chrome: a 'Tasks' sheet listing runs with Stop and a link 'All tasks on the web' (tasksSheet.ts; _locales spTasksTitle).
- CLI: not available.

**Before you start**

- Signed in.
- Plan with agi_work: pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:341,354).
- Mobile: Cloud mode, cloud unlocked, plan capability and the granted capability 'canUseAgiWork' (DrawerContent.tsx:342-345; CloudTasksScreen.tsx:423).

**Screens and controls**

- Run rows: title, state label, buttons 'Pause', 'Resume', 'Stop', 'Archive', 'Restore'.
- Approval card 'Waiting for your approval' with tool name, arguments preview, 'Approve', 'Deny', an optional guidance box 'Add guidance to steer this run (optional)'.
- Detail panel with the journal, steer box, share, re-run and 'save as routine'.

**Journey**

1. 1. Switch the composer to Work (or open /agi-work) and send a goal.
2. 2. The run starts on our servers; it appears under Work history > Active.
3. 3. Open the run to read the journal; the page refreshes every 4 seconds while the run is live.
4. 4. If the run needs approval it moves to 'Needs you'; click 'Approve' or 'Deny', optionally with guidance.
5. 5. Use Pause, Resume or Stop as needed; when done the state shows Completed or another end state.
6. 6. Archive finished runs, or re-run the goal.

**What the person sees and gets**

- State labels such as Queued, Running, Waiting for input, Waiting for approval, Paused, Ready for review, Completed, Failed, Cancelled, Archived (agi-work page ledger lines).
- Messages: 'Another device already answered this approval.', 'This approval expired and the task can no longer continue from it.', 'Could not send your decision. Check the task activity before retrying.' (TasksPage.tsx:177-185).
- Empty text 'Nothing needs you right now' and 'No <filter> work sessions yet' (TasksPage.tsx:596-602).
- Error 'Could not load your tasks. Retry in a moment.' with Retry.

**Settings**

- Layout choice (List or Board) is remembered in browser storage under agi-tasks-layout (TasksPage.tsx:84,95-110).
- Composer Work scope fields constraints and deliverable (agi-work page text).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Run list comes from GET /api/llm/v1/chat/completions/runs with state filters, cursor paging and a default active-state set (runs/route.ts:34-40,160).
- Shared TasksPage lists runs 25 per page, puts runs that need input first and filters by state (TasksPage.tsx:56-62,150-165).
- Approve and Deny send the decision for every pending tool call, with optional guidance, then reload (TasksPage.tsx:470-500).
- Pause, resume, stop and steer call the run client; failures show specific messages (TasksPage.tsx:336-431).
- Archive only appears when the host passes setRunArchived; web passes it and uses POST/DELETE on /runs/<id>/archive (TasksPage.tsx:200-206; cloud-tasks-client.ts:26-48).
- Journal is read in pages of 500 up to 8 pages and polled every 4 seconds only while the run is live (TasksPage.tsx:117-160).
- Work mode in the composer is shown only with the agi_work capability (ChatComposerNew.tsx:1066).
- Mobile screen loads runs only in Cloud mode with cloud unlocked, shows a detail sheet with approval handling (CloudTasksScreen.tsx:423; CloudRunDetailSheet.tsx:138-215).
- VS Code has a tree with approve and reject commands and detail view (commandSetup.ts:2549-2560; cloudRunApproval.ts:41-124).
- Chrome lists tasks and can stop a live run, then opens the web for the rest (tasksSheet.ts:30-60).

**Incomplete**

- Brief says 'Start work on /tasks'; the button 'Start Work' only appears when the list is empty and the filter is not Archived or Needs you (TasksPage.tsx:605-609).
- Brief says Approve or Reject; the web buttons are 'Approve' and 'Deny' (tool-approval-policy.ts:30-31); VS Code says Reject (cloudRunApproval.ts:92).
- Approval card renders only when run.state is 'awaiting_input' and pendingApproval exists (TasksPage.tsx:887); how 'awaiting_approval' state is treated in the same list is unclear.
- Mobile approvals: Approve and Deny labels in the sheet were not opened (TOOL_APPROVAL_ACTION_LABELS imported, CloudRunDetailSheet.tsx:14).
- Chrome: no approval controls found in the tasks sheet.

**Present but disconnected or switched off**

- Mobile hides AGI Work unless Cloud mode, plan and capability all allow it (DrawerContent.tsx:342-345,567).
- Mobile FEATURES.cloudTasks is true so it is on (v1FeatureFlags.ts:10).

**Not available**

- CLI: no AGI Work runs list.
- Local mode: Work runs on Cloud only; the page says 'Work runs on Cloud' (agi-work page close section).
- Desktop: same as web.

## 4. Required behaviour

**Established requirements**

- A home for agentic work where the user states a goal for a multi-step AGI Work run and can reach recent work. (source: S4.13 Should)
- A dashboard lists active or running tasks with live status, filterable from finished ones. (source: S4.14 Should)
- Opening a task shows status, step-by-step activity or transcript, outputs and any pending decision. (source: S4.15 Should)
- An approvals inbox gathers every pending approval across tasks and lets the user approve or reject each. (source: S4.16 Should)
- Mobile gates AGI Work on the cloudTasks flag. (source: Brief apps note; apps/mobile/lib/v1FeatureFlags.ts:10)
- Every subscription capability connects to one AGI Subscription system. (source: Task product context)

**Acceptance criteria**

1. With a plan lacking agi_work, the Work control never renders in the composer.
2. A new Work run appears in Work history > Active within one refresh and shows live updates every ~4 seconds.
3. 'Needs you' shows runs in awaiting_input, awaiting_approval and paused states and lists them first in 'All'.
4. Clicking Approve on a pending approval resumes the run; if another device answered first the message 'Another device already answered this approval.' appears.
5. An expired approval shows 'This approval expired and the task can no longer continue from it.'
6. Archive and Restore buttons appear on web and not on a host that cannot reach the archive route.
7. The List/Board choice survives a reload.
8. Mobile in Local mode shows no AGI Work row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The approvals inbox is the Needs you filter; a single cross-task approvals page is not present [inferred from TasksPage structure].
- Approving must be idempotent across devices (AlreadyResuming error).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the Start Work button visible at all times on /tasks.
- [proposed] Use one word (Deny or Reject) on every surface.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Work history route | `apps/web/app/tasks/page.tsx` | Page shell with metadata 'Work history' |
| component | Web TasksPage | `apps/web/features/tasks/components/TasksPage.tsx` | Builds the transport: open chat, start work, archive, rerun, save as routine |
| component | Shared TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Filters, list, approvals, pause, resume, stop, archive, journal polling |
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Run detail and journal |
| component | TasksBoard | `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx` | Board layout with approve and deny |
| component | TaskSteerSection | `packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx` | Steer a running task |
| service | cloud-tasks-client | `apps/web/features/tasks/services/cloud-tasks-client.ts` | Run client and archive call |
| service | managed cloud agent run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | listRuns, getRun, resumeRun, pauseRun, cancelRun and typed errors |
| endpoint | Runs list | `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | GET runs with state filters and cursor |
| endpoint | Run archive | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/archive/route.ts` | Archive and restore a run |
| endpoint | Run pause and resume | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts` | Resume with approval decisions; pause route beside it |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | List and read runs (tables cloud_agent_runs, cloud_agent_events) |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-service.ts` | One row per run |
| table | cloud_agent_events | `apps/web/lib/services/cloud-agent-run-service.ts` | Run journal events |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Chat and Work mode control, capability check |
| config | Plan capability map | `packages/contracts/types/src/billing-catalog.ts` | agi_work tiers |
| config | Approval labels | `packages/contracts/types/src/tool-approval-policy.ts` | Approve and Deny labels |
| screen | Mobile runs screen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Runs list, filters, start work |
| component | Mobile run detail | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Detail, approval, pause, resume, stop |
| service | Mobile tasks service | `apps/mobile/src/features/tasks/service.ts` | List, follow, decide, cancel, pause, resume with messages |
| service | Mobile run presentation | `apps/mobile/src/features/tasks/runPresentation.ts` | Filters and labels |
| component | VS Code tasks tree | `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | Grouped tree of runs |
| service | VS Code approval | `apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts` | Approve and reject flows |
| component | Chrome tasks sheet | `apps/extension/src/features/side-panel/tasksSheet.ts` | List and stop runs |
| config | Proxy Work rewrite | `apps/web/proxy.ts` | /agi-work to /chat |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends a goal in Work mode; the chat pipeline creates a run in cloud_agent_runs and works through tools. | our servers | ChatComposerNew.tsx:1066; cloud-agent-run-service.ts:1012-1120 |
| Work history requests the list of runs with the chosen state filter. | device and our servers | TasksPage.tsx:240-262; runs/route.ts:160 |
| Opening a run reads its journal pages; polls every 4 seconds while live. | device and our servers | TasksPage.tsx:117-160,430-450 |
| Approve or Deny posts decisions per tool call to the resume route. | our servers | TasksPage.tsx:470-486; runs/[runId]/resume/route.ts |
| Run tools execute in our managed environment; sensitive calls stop for approval. | our servers | agi-work page copy; sandbox code in apps/web/lib/e2b (bulk route imports) [inferred] |
| A reaper cron closes stale runs. | our servers | apps/web/app/api/cron/reap-agent-runs (directory listing) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run records and journal events | table:cloud_agent_runs and table:cloud_agent_events | Yes, every surface reads the same API | Archive hides a run; deletion policy unknown |
| List or Board layout | browser localStorage key agi-tasks-layout | No | Per browser; failure to read is ignored (TasksPage.tsx:88-110) |
| Guidance text typed for approval | component memory | No | Cleared after a successful decision (TasksPage.tsx:480-485) |

**Models and providers.** Every run turns into model calls made by the Cloud pipeline; the model and provider come from routing and the person's selection (SYS-chat-turn-pipeline, SYS-model-catalog-and-routing, SYS-agents-tools-and-automation). The Work page copy says it asks the model for a plan first and continues without one if the plan is unreadable. No model identifiers are named here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Runs are the user's own (RLS scoped DB in the runs route); tool calls that are not cleared need approval. |
| Subscription | agi_work capability: pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:341,354). On a plan without it the control never renders (agi-work page text). Mobile also needs grantedCapabilities to include canUseAgiWork (DrawerContent.tsx:344). |
| Limits and metering | Run cost and credits are shown (a TasksPage.cost test name exists); per-run metering rules are in SYS-subscriptions-entitlements-and-usage and not read here. List page size 25. |
| Feature flags | Mobile FEATURES.cloudTasks true (v1FeatureFlags.ts:10). |
| Model compatibility | Not read; a run needs a model able to use tools [inferred]. |
| Provider restrictions | None found in this feature's files; routing decides. |
| Local mode | Not available. Work runs on Cloud only; mobile hides AGI Work in Local mode (DrawerContent.tsx:342-343) and CloudTasksScreen loads only in cloud mode (CloudTasksScreen.tsx:423). Web and Desktop have no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading your work history…' | TasksPage.tsx:573-579 |
| List error | Alert with Retry | TasksPage.tsx:581-590 |
| Empty | Per-filter text and Start Work button when allowed | TasksPage.tsx:592-610 |
| Journal read fails | 'Could not load this task journal. Retry or open the source chat.'; live: 'Live updates stopped...' | TasksPage.tsx:216-226 |
| Another device answered | Message and reload | TasksPage.tsx:177-180,423 |
| Approval expired | Message that task cannot continue | TasksPage.tsx:180-182 |
| Stop fails | 'Could not stop the task. Check its activity before retrying.' | TasksPage.tsx:345 |
| Pause fails | 'Could not pause the task. It is still working.' | TasksPage.tsx:376-379 |
| Archive unsupported by host | Button not painted | TasksPage.tsx:200-206,848 |
| Mobile run unavailable | 403, 404 or 410 give 'This task is no longer available' | apps/mobile/src/features/tasks/service.ts:22-26 |
| Mobile app in background | isForeground tracked to pause loading | CloudTasksScreen.tsx:420-422 |
| Accessibility | Row buttons carry labels such as 'View details for <title>, <state>'; filters have aria-label | TasksPage.tsx:555,564,722 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: Approval flows
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.pause.test.tsx`: Pause and resume
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.archive.test.tsx`: Archive and restore
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.live.test.tsx`: Live polling
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.details.test.tsx`: Run details
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.deepLink.test.tsx`: Opening a run by link
- `packages/ui/unified-chat/src/components/tasks/__tests__/task-display.vocabulary.test.ts`: State vocabulary
- `apps/web/features/tasks/components/TasksPage.test.tsx`: Web transport wrapper
- `apps/web/features/tasks/__tests__/cross-surface-task-state.test.ts`: State agreement across surfaces
- `apps/web/app/api/llm/v1/chat/completions/runs/route.test.ts`: Runs list route
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetApproval.test.tsx`: Mobile approval
- `apps/mobile/src/features/tasks/__tests__/CloudTasksScreen.test.tsx`: Mobile runs screen

**Test scenarios**

- **Start and watch**
  1. On an eligible plan switch the composer to Work
  2. Send a goal
  3. Open /tasks
  - Expected: Run in Active; journal updates about every 4 seconds
- **Approve from another device**
  1. Open the same waiting run on web and mobile
  2. Approve on mobile
  3. Approve on web
  - Expected: Web shows 'Another device already answered this approval.'
- **Plan without Work**
  1. Sign in on a plan lacking agi_work
  2. Open /chat
  - Expected: No Work control in the composer
- **Layout memory**
  1. Choose Board
  2. Reload
  - Expected: Board still selected
- **Mobile Local**
  1. Switch the phone to Local mode
  2. Open the drawer
  - Expected: No 'AGI Work' row
- **List failure**
  1. Block the runs route
  2. Open /tasks
  - Expected: Error with Retry, then list after unblocking

**Where to look when it fails**

- Console '[Tasks] Failed to load tasks:' and '[Tasks] Failed to resolve task approval:'
- Error names ManagedCloudAgentRunAlreadyResumingError and ManagedCloudAgentRunApprovalExpiredError
- Tables cloud_agent_runs and cloud_agent_events
- Cron reap-agent-runs

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)
- Chrome: [70-qa/test-plans/chrome/004-signed-in-application-destinations.md](../../70-qa/test-plans/chrome/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **No CLI view of Work runs.** Affects: CLI. Evidence: Brief S4.13-16 cli missing; no runs command found. Work needed: Decide scope
- **Chrome has no approval controls in its tasks sheet.** Affects: Chrome. Evidence: tasksSheet.ts:30-60 shows Stop only. Work needed: Add or document
- **Wording differs: Deny on web, Reject on VS Code, brief says Reject.** Affects: Web, VS Code. Evidence: tool-approval-policy.ts:30; cloudRunApproval.ts:92. Work needed: One term
- **Start Work button is not always visible on /tasks.** Affects: Web, Desktop. Evidence: TasksPage.tsx:605-609. Work needed: Decide design
- **Treatment of the awaiting_approval state versus the card condition.** Affects: Web. Evidence: TasksPage.tsx:60-64 vs 887. Work needed: Verify by running
- Not built on: CLI (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-sync-and-continuity
- table:cloud_agent_runs
- table:cloud_agent_events
- api:GET /api/llm/v1/chat/completions/runs
- api:POST /api/llm/v1/chat/completions/runs/{runId}/resume
- api:POST /api/llm/v1/chat/completions/runs/{runId}/archive

## Unknown

- Per-run metering and credit rules.
- Which models can run Work.
- Mobile approval button labels.
- Whether awaiting_approval runs render the approval card.
- Retention of finished runs.
- What Chrome can do beyond list and stop.
- Whether desktop adds anything beyond the web app.
