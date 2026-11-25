---
id: "F060-11"
type: "feature"
title: "Task list, history, sharing and handoff"
aliases: ["Task list, history, sharing and handoff", "Work history", "Tasks", "Cloud tasks", "Task title (S60.02)", "Task history (S60.32)", "Task sharing (S60.33)", "Cross-device task continuation (S60.34)", "Share task"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S60.02", "S60.32", "S60.33", "S60.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/llm/v1/chat/completions/runs", "api:GET /api/llm/v1/chat/completions/runs/{runId}", "api:POST /api/share", "table:cloud_agent_runs", "table:cloud_agent_events", "table:web_conversations", "store:agi-tasks-layout", "store:agi-task-views", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F060-07", "F060-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-11 Task list, history, sharing and handoff

A list of the account's Work tasks with title, state and time, kept on our servers so any signed-in app can open the same task. Web and the desktop build offer filters, a board view and unread marks; mobile has filters and search; VS Code and Chrome show the active tasks. Sharing opens the chat's share flow on web and mobile.

Area: [60. Agentic work product](README.md). Requirement items: [S60.02](../../10-requirements/capabilities/060-agentic-work-product.md#s6002), [S60.32](../../10-requirements/capabilities/060-agentic-work-product.md#s6032), [S60.33](../../10-requirements/capabilities/060-agentic-work-product.md#s6033), [S60.34](../../10-requirements/capabilities/060-agentic-work-product.md#s6034).

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

**What it does.** Lists the person's Work runs from the server, 25 at a time, newest update first, named by the conversation title. Selecting one opens its detail with a live journal. 'Share task' shares the task's chat as a link. Because runs live on the server, a task started on one device can be followed, answered and stopped from another.

**Why it exists.** Work tasks outlive the app. The person needs one place to find what is running, what needs them and what finished, from any device (doc: docs/product/definition.md:139).

**Who uses it.** Everyone who runs Work tasks, on any app.

**Problems it solves**

- Losing track of long tasks.
- Not knowing a task is waiting for approval.
- Moving between laptop and phone mid-task.
- Showing a result to someone else.

**Use cases**

- Open Work history and press the 'Needs you' filter to answer an approval.
- Start a task on the laptop, follow it on the phone.
- Search tasks on mobile by title or first prompt.
- Share a finished task's chat as a link.

## 2. User experience

**Where to find it**

- Web: /tasks, titled 'Work history' with the line 'Your Cloud work sessions' (apps/web/app/tasks/page.tsx; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:546-548).
- Desktop (public Electron app): the hosted web app (doc: AGENTS.md section 5). Tauri build: Tasks panel (apps/desktop/src/features/v3/DesktopShellV3.tsx:790).
- Mobile: Tasks screen with filter chips All, Needs you, Running, Finished and search (apps/mobile/src/features/tasks/runPresentation.ts:18-41; CloudTasksScreen.tsx:423).
- VS Code: 'Cloud Tasks' tree with groups Needs you, Working, Ready for review, Done, Stopped; command 'Code: Show Cloud Tasks' (apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:45-51; package.json command agi-workforce.showCloudTasks).
- Chrome: side panel More menu, 'Tasks' sheet (apps/extension/src/features/side-panel/tasksSheet.ts:34-61).
- CLI: '/history' lists saved local sessions; '/continue-elsewhere' prints the web link of an account conversation (apps/cli/src/repl/registry.rs:306-330; apps/cli/src/cloud/mod.rs:241-254).

**Before you start**

- Signed-in account (web redirects an expired session and requires adult eligibility, apps/web/app/tasks/layout.tsx:16-19).
- Desktop Tauri: signed in and privacy mode not local (DesktopTasks.tsx:44-56).
- Mobile: cloud mode, cloud unlocked, FEATURES.cloudTasks on (CloudTasksScreen.tsx:423,655-660).

**Screens and controls**

- Web filters 'Active', 'Needs you', 'All', 'Archived'; layout 'List' or 'Board'; 'Show more'; 'Retry' on error; 'Start Work' on empty (TasksPage.tsx:70-75,575-610).
- Row: title button 'View details for <title>, <state>', state badge ('Pausing' while pausing), work mode, model label, relative time, cost, buttons 'Open chat', Pause, Resume, Stop, Archive, Restore (TasksPage.tsx:~700-840).
- Detail 'Context': 'Open source chat' and 'Share task' (TaskDetailPanel.tsx:781-806).
- Mobile detail: 'Open conversation', 'Share task', 'Following live' (CloudRunDetailSheet.tsx:360,579,618).
- VS Code detail: 'Rename task', 'Open on web' (cloudRunDetail.ts:182-193).
- Chrome rows: title, 'state · time', 'Open', 'Stop', 'All tasks on the web' (tasksSheet.ts:60-90).

**Journey**

1. 1. Open Tasks (web: /tasks).
2. 2. Pick a filter or search (mobile).
3. 3. Read title, state and time on each row; rows needing you sit first on web.
4. 4. Select a row; the detail panel opens and refreshes every 4 seconds while the run is live.
5. 5. Optionally 'Open chat', 'Share task' (finished tasks, list layout) or answer an approval.
6. 6. On another device open the same list; the same run and journal are there.

**What the person sees and gets**

- Empty states: 'No <filter> work sessions yet' and 'Nothing needs you right now' with an explanation; mobile 'No tasks match "<query>"'; Chrome 'No tasks yet.'; VS Code 'No cloud tasks yet' (TasksPage.tsx:592-607; CloudTasksScreen.tsx:327; apps/extension/_locales/en/messages.json spTasksEmpty; cloudTasksTree.ts:151).
- Error: 'Could not load your tasks. Retry in a moment.' with a Retry button (TasksPage.tsx:259).
- Share opens the chat share dialog (web) or a confirmation then link (mobile).

**Settings**

- List or Board layout, browser storage agi-tasks-layout (TasksPage.tsx:82-99).
- Per-device 'last looked' stamps for unread marks, browser storage agi-task-views (task-display.ts:149-234).
- VS Code auto-refresh every 15 seconds while the view is visible (cloudTasksTree.ts:10,114-122).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- List API GET /api/llm/v1/chat/completions/runs: default states queued, running, paused, awaiting_input, ready_for_review; limit 25 (max 100); cursor on (updated_at, id); only agiwork runs unless a request id is given; optional text search, project filter and conversation lookup (apps/web/app/api/llm/v1/chat/completions/runs/route.ts:34-40,84-85,129-157).
- The query joins the conversation title and a first-prompt preview, excludes temporary conversations and orders by updated_at then id, newest first (apps/web/lib/services/cloud-agent-run-service.ts:1297-1324).
- Title is the conversation title, else the work-mode label ('Work', 'Research', 'Chat'), else a host lookup (TasksPage.tsx:500-512; task-display.ts:27-37).
- Shared page filters map to states: Active uses the server default, Needs you uses awaiting_input, awaiting_approval, paused, All and Archived list all or archived states (TasksPage.tsx:36-68,191-200 region and 240-262).
- Detail reads the journal by pages of 500 up to 8 pages and polls every 4 s only while the run is live (TasksPage.tsx:115-156,521-534).
- Sharing on web: 'Share task' routes to /chat/{conversationId}?share=true which opens the chat share flow; shown only when the host supplies shareConversation, the task is not live and the layout is List (apps/web/features/tasks/components/TasksPage.tsx:40; TaskDetailPanel.tsx:796-806; TasksPage.tsx:972; apps/web/features/chat/pages/WebChatPage.tsx:1145,1686-1694).
- Sharing on mobile: 'Share task' asks for confirmation and creates a link to the chat from its messages (apps/mobile/src/features/tasks/taskActions.ts:49-65).
- Cross-device: any client reads GET .../runs/{runId}?after&limit; web polls it; mobile follows it; approval answered elsewhere gives 'Another device already answered this approval.' (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:45-67; TasksPage.tsx:175-184).
- VS Code lists runs in stage groups, offers Rename task (updates the conversation title), Open on web and approve or reject from the tree (cloudTasksTree.ts:128-173; cloudRunDetail.ts:287-312; commandSetup.ts:2711-2716).
- Chrome lists up to 20 runs, shows state and time, opens the chat on the web and stops live runs (tasksSheet.ts:14,70-122).
- Mobile starts a task with the title set to the goal cut to 60 characters (apps/mobile/src/features/tasks/startWork.ts:33-36); mobile list has filters All, Needs you, Running, Finished and server-side search (runPresentation.ts:18-41; service.ts:45-55).
- Archive and restore on web (setRunArchived) hide finished tasks from Active (apps/web/features/tasks/services/cloud-tasks-client.ts:22-49; TasksPage.tsx:433-468).

**Incomplete**

- Share task is missing in the Board layout, on Tauri desktop, VS Code, Chrome and CLI (TasksPage.tsx:~650-675 passes no onShare; DesktopTasks.tsx:16-41).
- VS Code and Chrome call listRuns without states, so only the server's active states return; finished tasks beyond ready_for_review do not appear (cloudTasksTree.ts:146; apps/extension/src/features/cloud-bridge/managedRunControl.ts:528; runs/route.ts:34-40) [inferred from the default].
- Renaming exists only in VS Code; no rename control was found in the shared Tasks page or on mobile (cloudRunDetail.ts:182-188).
- Share shares the conversation, not a structured plan, steps and results view [inferred from the conversationId parameter].

**Present but disconnected or switched off**

- Tauri desktop transport passes no archive, share, routine or send-as-new handlers, so those controls are hidden there (DesktopTasks.tsx:16-41).
- The Board component TasksBoard.tsx and unread marks (TasksBoard.unread test) were not opened.

**Not available**

- Task list on Chrome beyond the active states (inferred).
- History of finished cloud tasks in the CLI TUI; '/history' lists local sessions only (registry.rs:306-330). The CLI app-server can list runs for another client (apps/cli/src/app_server/cloud_turns.rs:668-735) but no person-facing screen was found.
- The brief says the title is the goal cut to 60 characters on all apps; that holds for mobile start only.

## 4. Required behaviour

**Established requirements**

- Each work task shows a readable title in the task list, and the user can set or change it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.02)
- The user can browse past tasks with their state and open any of them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.32)
- The user can share a task (its plan, steps and results) with someone else. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.33)
- A task started on one device can be followed and acted on from another device. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.34)
- Cloud work can be steered from another surface. (source: doc: docs/product/definition.md:139)
- Chrome keeps browser-task history where allowed. (source: doc: docs/product/experience-contract.md:291,566)

**Acceptance criteria**

1. A signed-in account sees its Work runs newest-updated first, 25 per page, with a working 'Show more'.
2. Each row shows a title (conversation title or 'Work' fallback), a state label and a relative time.
3. Filter 'Needs you' shows only awaiting input, approval and paused tasks, and they sort first in the Active list.
4. A task started on web appears on mobile and in VS Code after refresh; an approval answered on one device is refused on the other with the 'Another device' message.
5. 'Share task' on a finished task opens a share flow for its chat; it is absent for live tasks.
6. Another account's run id returns 404.
7. The user can rename a task on at least the apps the requirement names, or the requirement is changed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The list is for the signed-in account only; Local sessions are not Work runs [inferred from DesktopTasks.tsx:51-53].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show finished tasks in VS Code and Chrome by passing all states.
- [proposed] Add a rename control to the Tasks detail on web, desktop and mobile.
- [proposed] Offer Share in Board layout and on desktop Tauri, and a share view that includes plan and steps if that is the requirement.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | TasksPage (shared) | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | List, filters, layouts, paging, polling, selection. |
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Detail, Share task, Open source chat. |
| component | TasksBoard | `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx` | Board layout (not opened). |
| service | task-display | `packages/ui/unified-chat/src/components/tasks/task-display.ts` | Labels, live-state rules, unread stamps. |
| screen | web /tasks route | `apps/web/app/tasks/page.tsx` | Page shell and metadata 'Work history'. |
| config | tasks layout guard | `apps/web/app/tasks/layout.tsx` | Session and adult-eligibility checks. |
| hook | web tasks transport | `apps/web/features/tasks/components/TasksPage.tsx` | Open chat, share, archive, rerun, routine, start work. |
| service | web cloud tasks client | `apps/web/features/tasks/services/cloud-tasks-client.ts` | Managed run client and archive call. |
| endpoint | GET runs | `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | Paged list with filters and search. |
| endpoint | GET run | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Run snapshot and event page for follow and cross-device. |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | listCloudAgentRuns and getCloudAgentRun. |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-service.ts:1297` | Run rows joined to web_conversations for titles. |
| table | web_conversations | `apps/web/lib/services/cloud-agent-run-service.ts:1302` | Title, project and temporary flag. |
| endpoint | POST /api/share | `apps/web/app/api/share/route.ts` | Creates a conversation share (with external sharing gate). |
| service | managed run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | listRuns, getRun, followRun used by every app. |
| store | useCloudTaskStore | `apps/mobile/src/features/tasks/store.ts` | Mobile list, search, detail follow. |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Mobile list, gating, share handler. |
| service | mobile task actions | `apps/mobile/src/features/tasks/taskActions.ts` | shareCloudRun. |
| component | CloudTasksTreeProvider | `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | VS Code tree with stage groups and 15 s refresh. |
| command | openCloudTask | `apps/extension-vscode/src/core/commandSetup.ts` | Opens detail with rename and artifacts hooks (line 2701). |
| component | Chrome tasksSheet | `apps/extension/src/features/side-panel/tasksSheet.ts` | Tasks sheet list. |
| component | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Tauri host of the shared page; sign-in gate. |
| command | CLI history and sessions | `apps/cli/src/repl/registry.rs` | handle_history lists local managed sessions. |
| test | cross-surface task state test | `apps/web/features/tasks/__tests__/cross-surface-task-state.test.ts` | Guards that web tasks use the shared page and client. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page asks the managed run client for a page of runs with the chosen states and a limit of 25. | device | TasksPage.tsx:240-262; managed-cloud-agent-runs-client.ts:347-373 |
| The route rate-limits (agent-run-follow), validates states, limit, cursor and search text, opens a user-scoped database, and queries runs joined to conversations. | our servers | runs/route.ts:69-147; cloud-agent-run-service.ts:1258-1349 |
| The server returns runs and an opaque next cursor; the page appends on 'Show more'. | our servers | runs/route.ts:148-157; TasksPage.tsx:249-252 |
| Selecting a run reads its journal pages; while live, the page re-reads after the last sequence every 4 s. | device and our servers | TasksPage.tsx:129-156,521-534; [runId]/route.ts:45-67 |
| 'Share task' navigates to the chat with share=true; the chat page opens its share flow and POSTs /api/share, which applies the external sharing gate and outbound content inspection. | device and our servers | apps/web/features/tasks/components/TasksPage.tsx:40; WebChatPage.tsx:1686-1694; apps/web/app/api/share/route.ts:22,24,839 |
| On another device the same list call returns the same rows because the run lives in the database, not on the starting device. | our servers | cloud-agent-run-service.ts:1297-1324 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run rows and journal | tables cloud_agent_runs, cloud_agent_events | Yes, every app reads the server | unknown |
| Title | table web_conversations (title) | Yes | A deleted conversation is joined as null; temporary and withdrawn ones are excluded from the list (cloud-agent-run-service.ts:1302-1322) |
| List layout choice and unread stamps | browser storage keys agi-tasks-layout and agi-task-views (cap 500 entries) | No, per browser | Until site data is cleared |
| Shared link | share records (table not opened) | Yes | Revocable through DELETE /api/share (route.ts:842) |

**Models and providers.** Listing and following are independent of model and provider; each row shows the run's model through a display-label lookup (TasksPage.tsx:~735). Sharing sends chat content outward and is checked by organization policy and an outbound content inspection (share/route.ts:22-25). See SYS-sync-and-continuity.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on every app; web also requires adult eligibility (apps/web/app/tasks/layout.tsx:19). Rows are scoped to user_id. |
| Permissions | List and read routes use a user-scoped database; a cross-tenant id answers not found. Sharing is blocked by organization external-sharing policy when set (share/route.ts:22). |
| Subscription | No plan check on listing, reading or sharing was found. Starting Work needs canUseAgiWork (billing-catalog.ts:354). |
| Limits and metering | List page 25 default, 100 max; agent-run-follow rate limit 120 per minute, fail open; journal 4,000 events (runs/route.ts:84-85; rate-limit.ts:374; TasksPage.tsx:115-116). |
| Feature flags | Mobile FEATURES.cloudTasks; VS Code auto refresh only while the view is visible. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code; whether own-key turns create run rows is unknown. |
| Local mode | Local sessions are not listed: the Tauri panel says so and is hidden in local privacy mode (DesktopTasks.tsx:51-53; DesktopShellV3.tsx:790); mobile needs cloud mode. CLI '/history' lists local sessions with no sign-in or payment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading your work history…'; 'Show more' shows a spinner. | TasksPage.tsx:~565-571 |
| Empty | Filter-specific text and a 'Start Work' button on Active and All. | TasksPage.tsx:592-610 |
| Error | Alert with message and 'Retry'; load also logs '[Tasks] Failed to load tasks:'. | TasksPage.tsx:254-262,575-588 |
| Signed out | Tauri: 'Sign in to see your tasks'; VS Code: sign-in notice; Chrome: 'Sign in to see your tasks.'; web: redirect. | DesktopTasks.tsx:44-56; cloudTasksTree.ts:134-143; managedRunControl.ts:521-523; layout.tsx:16 |
| Deep link | ?run=<id> opens that run's detail directly. | apps/web/features/tasks/components/TasksPage.tsx:13-18; TasksPage.deepLink.test.tsx |
| Polling failure | 'Live updates stopped: this task journal could not be re-read. Refresh to retry.' | TasksPage.tsx:312-316 |
| Run deleted or not allowed (mobile) | 'This task is no longer available' for 403, 404, 410. | apps/mobile/src/features/tasks/service.ts:24-25,93-103 |
| Account switch (mobile) | Store resets and ignores late replies from the old account. | store.ts account-epoch guards; CloudTasksScreen.tsx:458 |
| Offline | Not handled specially; load errors show Retry. | TasksPage.tsx:254-262 |
| Narrow screen | Detail opens as a full-screen dialog with focus trap and Escape to close. | TaskDetailPanel.tsx:60-150,487-493 |
| Stale executor | Server reports staleForMs; VS Code shows 'quiet <time>'. | cloud-agent-runs.ts staleForMs; cloudRunPresentation.ts:99-103 |
| Accessibility | Rows have aria-labels with title and state; badges and filters labelled. | TasksPage.tsx:~700-720; cloudTasksTree.ts:61-64 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/runs/route.test.ts`: List scope: AGI Work only, request-id lookup, conversation lookup, search, cursor.
- `apps/web/__tests__/api/cloud-agent-runs.test.ts`: Owner-scoped snapshot and cursor, reconnect read from Desktop and Mobile, cross-tenant 404.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.identity.test.tsx`: Row names from conversation title with fallbacks.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.details.test.tsx`: Opening details, pagination of journal, overlay on narrow screens.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.deepLink.test.tsx`: Deep link to a run (exact cases not read).
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.archive.test.tsx`: Archive and restore (exact cases not read).
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksBoard.unread.test.tsx`: Unread marks on the board (exact cases not read).
- `apps/web/features/tasks/components/TasksPage.test.tsx`: Deep link, empty state, save as routine.
- `apps/web/features/tasks/__tests__/cross-surface-task-state.test.ts`: Web uses the shared page and client.
- `apps/mobile/src/features/tasks/__tests__/CloudTasksScreen.test.tsx`: Mobile screen (exact cases not read).
- `apps/mobile/src/features/tasks/__tests__/taskActions.test.ts`: Share task through a confirmed chat link.
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: Tree items, sign-in, failed listing, empty list, polling only while visible, detail items.
- `apps/extension/__tests__/tasks-sheet.test.ts`: Chrome list from every app, open on web, reset on account change.
- `apps/desktop/src/features/tasks/__tests__`: Tauri sign-in prompt, desktop client, conversation open, error surfacing.

**Test scenarios**

- **List order and paging**
  1. Create 30 Work tasks across states.
  2. Open /tasks, filter All, press 'Show more'.
  - Expected: First page has 25 rows newest-updated first; the next page continues without repeats.
- **Cross-device follow**
  1. Start a Work task on web that asks for approval.
  2. Open the phone Tasks screen, filter 'Needs you', open it and approve.
  3. Watch web.
  - Expected: Web updates within a few seconds; answering again on web gives 'Another device already answered this approval.'
- **Share a finished task**
  1. Open a finished task in List layout.
  2. Press 'Share task'.
  - Expected: Chat opens with the share dialog; a link can be created; the button is absent while the task is live and in Board layout.
- **Title fallback**
  1. Open a task whose conversation has no title.
  - Expected: Row title reads 'Work' (work-mode label).
- **VS Code history gap**
  1. Complete and fail several tasks.
  2. Open the VS Code Cloud Tasks tree.
  - Expected: Observe whether Done and Stopped groups fill; the code suggests only active states return.
- **Local privacy mode**
  1. Switch the Tauri desktop to local privacy mode and look for Tasks.
  - Expected: No Tasks panel; local sessions are not listed.

**Where to look when it fails**

- Console '[Tasks] Failed to load tasks:', '[Tasks] Failed to load task journal:'.
- Validation error 'Invalid Cloud task list parameters' or 'Invalid Cloud task cursor' from the list route.
- Rate-limit refusals on agent-run-follow.
- Tables cloud_agent_runs, cloud_agent_events, web_conversations.
- Response header for search support (MANAGED_CLOUD_AGENT_RUNS_SEARCH_HEADER).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- VS Code: [70-qa/test-plans/vscode/060-agentic-work-product.md](../../70-qa/test-plans/vscode/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Sharing exists on web and mobile but not on Board layout, Tauri desktop, VS Code, Chrome or CLI, and it shares the chat rather than a plan, steps and results view.** Affects: All apps except web list layout and mobile. Evidence: TasksPage.tsx:650-675; DesktopTasks.tsx:16-41; WebChatPage.tsx:1686-1694. Work needed: Decide the requirement; add share to the missing apps or the Board.
- **Brief says mobile sharing is missing; code has 'Share task' on mobile.** Affects: Documentation. Evidence: CloudRunDetailSheet.tsx:618; taskActions.ts:49-65. Work needed: Update S60.33.
- **The user cannot rename a task on web, desktop or mobile Tasks pages; VS Code can.** Affects: Web, desktop, mobile. Evidence: cloudRunDetail.ts:182-188; no rename in TasksPage.tsx. Work needed: Add rename to the shared page and mobile detail.
- **VS Code and Chrome list only active states, so history of finished tasks is missing there.** Affects: VS Code, Chrome. Evidence: cloudTasksTree.ts:146; managedRunControl.ts:528; runs/route.ts:34-40. Work needed: Pass all or finished states and add filters.
- **CLI has no cloud task list in its terminal UI; '/history' is local-only. The brief's CLI citations (tui_app.rs:3545, lib.rs:829, 3372) point at other code.** Affects: CLI. Evidence: registry.rs:306-330; tui_app.rs:3545-3600 is footer drawing. Work needed: Expose cloud/run/list in a CLI command or mark not applicable.
- **Desktop Tauri lacks archive, share and routine; behaviour differs from the Electron app that shows the web page.** Affects: Desktop (Tauri build). Evidence: DesktopTasks.tsx:16-41. Work needed: Wire the missing transport methods or retire the build's panel.
- **Chrome is marked unverified in the brief for list and handoff; the sheet exists but title, history and cross-device are partly covered.** Affects: Chrome. Evidence: tasksSheet.ts; tasks-sheet.test.ts. Work needed: Verify against the brief and update rows.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/llm/v1/chat/completions/runs
- api:GET /api/llm/v1/chat/completions/runs/{runId}
- api:POST /api/share
- table:cloud_agent_runs
- table:cloud_agent_events
- table:web_conversations
- store:agi-tasks-layout
- store:agi-task-views
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F060-07
- F060-10

## Unknown

- How a web Work task's conversation title is first generated (the mobile start sets it from the goal).
- Whether any app other than VS Code can rename a task.
- Share record tables and the shared link retention.
- TasksBoard.tsx behaviour (not opened), including unread marks and controls.
- Whether finished tasks appear in VS Code and Chrome lists (inferred not).
- Whether the desktop Electron build differs from the web page in any way for Tasks.
- Whether the CLI app-server list/attach methods are reachable from a person-facing command.
