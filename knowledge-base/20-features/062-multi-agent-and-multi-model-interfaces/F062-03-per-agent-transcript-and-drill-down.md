---
id: "F062-03"
type: "feature"
title: "Per-agent transcript and drill-down"
aliases: ["Per-agent transcript", "Full-transcript drill-down", "/tasks transcript", "Transcript button", "Task details", "Open source chat", "S62.06", "S62.12"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "partial", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S62.06", "S62.12"]
depends_on: ["surface:cli", "surface:vscode", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "table:cloud_agent_events", "store:managed-session-file", "api:GET /api/llm/v1/chat/completions/runs/{runId}", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "F062-01", "F062-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-03 Per-agent transcript and drill-down

Lets a person open what one agent or task did. CLI: /tasks transcript <id> prints a finished child's steps. VS Code: a Transcript button on each subagent row. Web and desktop: a Task details panel with progress, outputs and an Open source chat link. Mobile: the run detail sheet with streamed output.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.06](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6206), [S62.12](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6212).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Drill-down from a list of agents or tasks into one agent's own record. CLI prints one line per message or tool step (long lines clipped to 400 characters). VS Code opens it as a read-only document. Cloud run detail shows plan, progress, outputs and cost, and links to the source chat for the full conversation.

**Why it exists.** The final answer alone does not show how a child got there or why it failed. A transcript lets a person audit tool use and errors (doc: docs/product/experience-contract.md rule 6).

**Who uses it.** Developers auditing child agents (CLI, VS Code); people reviewing Cloud work runs (web, desktop, mobile).

**Problems it solves**

- See what a child did step by step.
- Find why a run failed ('Why this task failed' section).
- Reopen a past run's output without re-running it.

**Use cases**

- Type /tasks transcript subagent_2 after it finished.
- Press Transcript on a VS Code subagent row.
- Open a failed Cloud run on web and read the failure reason.
- Open a run on mobile and read its output text.

## 2. User experience

**Where to find it**

- CLI: /tasks transcript <id> (apps/cli/src/repl/registry.rs:535-546); /tasks show prints 'Its whole conversation (N steps): /tasks transcript <id>' (apps/cli/src/subagent.rs:166-172).
- VS Code: 'Transcript' button on a Subagents row, aria-label 'View transcript for <title>' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3537-3545).
- Web and Electron desktop: Work history page at /tasks, select a run, panel 'Task details' (apps/web/app/tasks/page.tsx; TaskDetailPanel.tsx:428-537).
- Desktop Tauri: DesktopTasks wraps the same shared panel (apps/desktop/src/features/tasks/DesktopTasks.tsx:58).
- Mobile: tap a run on the AGI Work screen to open the run detail sheet; close with 'Close task' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:300).
- Chrome: side-panel More menu 'Tasks' sheet lists runs with Open (to the web chat) and Stop; no in-panel detail (apps/extension/src/features/side-panel/tasksSheet.ts).
- Web Code page subagent group: no transcript control found (LocalSessionPanel.tsx:174-203).

**Before you start**

- CLI: the child must have finished with a result; failed and cancelled children have no result so the command says it has not finished (registry.rs:536-541).
- VS Code: the row must report transcriptAvailable.
- Cloud run detail: signed-in Cloud account.

**Screens and controls**

- CLI /tasks transcript <id>.
- VS Code Transcript button; opens a read-only document using the agi-subagent-transcript scheme (apps/extension-vscode/src/features/sidebar-webview/developerOutput.ts:10, :119).
- Web Task details panel sections: Task goal, Task plan, Latest output or Result, Why this task failed, Cost and usage, Progress, Outputs, Context, buttons 'Refresh task details', 'Close task details', 'Open source chat', 'Share task' (TaskDetailPanel.tsx).
- Mobile sheet: status, metadata rows, approval card, plan steps, output text, Open the conversation, Stop this task.

**Journey**

1. 1. Open the list (see F062-01 or F062-04).
2. 2. Pick one child or run.
3. 3. Read the transcript, output or detail.
4. 4. For the full chat, use Open source chat (web) or Open the conversation (mobile).

**What the person sees and gets**

- CLI: 'Transcript of task <id>' then one line per step: 'user: ...', 'assistant: ...', 'tool <name>: ...', 'tool result: ...', 'tool error: ...' (subagent.rs:314-352).
- CLI no transcript: 'Task <id> kept no transcript.' Unfinished or unknown: 'Task <id> has not finished, or is not in this session. /tasks lists them.' (registry.rs:535-541).
- VS Code: error 'This subagent has no saved transcript' or 'This chat has no matching subagent' when missing (apps/cli/src/app_server/developer_host.rs:4962-4973).
- Web: 'Showing the first 4,000 events. Open the source chat for the rest.' when truncated (TaskDetailPanel.tsx:812-815); 'This record does not copy input filenames or folder paths. See the source chat for them.' (TaskDetailPanel.tsx:748).
- Mobile sheet output text is the streamed text with provider citation tokens stripped (CloudRunDetailSheet.tsx:272).

**Settings**

- Web Work history layout toggle List or Board is remembered in browser storage under agi-tasks-layout (TasksPage.tsx:83-103). Not a transcript setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI transcript for a completed child (registry.rs:535-546; subagent.rs:314).
- Child transcripts are saved bounded into the managed session and served to clients through childTask/transcript (apps/cli/src/platform/runtime/session.rs:1005-1015; apps/cli/src/app_server/developer_host.rs:4952-4976; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2025-2031).
- VS Code opens the stored transcript (ChatStateManager.ts:6333-6350).
- Web, desktop and mobile show Cloud run detail with live refresh every 4 s while a run is live (TasksPage.tsx:100, :492-501) and mobile follows live ('Following live', CloudRunDetailSheet.tsx:357).

**Incomplete**

- CLI /tasks transcript refuses failed and cancelled children even though their lines are kept (get_transcript at subagent.rs:860 is used only when settling, agent/chat.rs:3114; registry.rs:536 uses get_result).
- Web and desktop detail is a journal summary, not a message-by-message transcript; full conversation is in the source chat.
- Mobile shows output text trimmed to a maximum length (apps/mobile/src/features/tasks/store.ts:107-125), not a full history.
- Journal read is capped at 8 pages of 500 events (TasksPage.tsx:128-129).

**Present but disconnected or switched off**

- Stored transcripts exist for the web Code page children, but the web group shows no button to open them (LocalSessionPanel.tsx:187-200).

**Not available**

- Chrome: no per-run detail (tasksSheet.ts).
- Mobile compare panels show only final text and have no separate transcript (brief draft; compare/index.tsx:603-720).
- The brief lists CLI transcript as missing, but /tasks transcript exists.

## 4. Required behaviour

**Established requirements**

- The user can read each participating agent's own transcript. (source: brief S62.06)
- From an overview the user can drill into the full transcript of a task. (source: brief S62.12)
- If a task has not finished or is not in the session, the CLI says so and points to /tasks list. (source: apps/cli/src/repl/registry.rs:538)
- If a task finished with no transcript, the CLI says it kept none. (source: apps/cli/src/repl/registry.rs:544)
- Every async flow has complete states: loading, empty, error, retry. (source: docs/product/experience-contract.md rule 8)

**Acceptance criteria**

1. /tasks transcript with no id returns 'Name the task: /tasks transcript <id>.'
2. /tasks transcript on an unknown id returns the 'has not finished, or is not in this session' text.
3. /tasks transcript on a completed child prints lines starting with 'Transcript of task <id>'.
4. A VS Code row with transcriptAvailable shows a Transcript button; a row without it shows none.
5. Web Task details for a failed run shows 'Why this task failed'.
6. A live web run refreshes its journal about every 4 seconds and stops polling once terminal.
7. Mobile run sheet closes with 'Close task'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A failed or cancelled child's transcript should be readable, since it is stored and most useful for debugging.
- [inferred] 'Full transcript' on web and mobile is satisfied only through the source chat.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make /tasks transcript read get_transcript for non-finished children.
- [proposed] Add the Transcript button to the web Code subagent group.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /tasks transcript | `apps/cli/src/repl/registry.rs` | Prints a finished child's lines (535-546). |
| service | transcript_lines | `apps/cli/src/subagent.rs` | Turns messages into clipped lines (314-352). |
| service | get_transcript / get_result | `apps/cli/src/subagent.rs` | Read finished or unfinished transcript (851-873). |
| service | record_child_transcript | `apps/cli/src/platform/runtime/session.rs` | Stores bounded transcript in the managed session (1005). |
| endpoint | childTask/transcript, childTask/stop | `apps/cli/src/app_server/developer_host.rs` | App-server methods read_child_task_transcript and stop_child_task (4952, 4982). |
| schema | ChildTaskTranscriptResponse | `crates/agiworkforce-protocol/bindings/ChildTaskTranscriptResponse.ts` | title, lines, truncated. |
| service | readChildTaskTranscript | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code client call (2025). |
| service | showSubagentTranscript | `apps/extension-vscode/src/features/sidebar-webview/developerOutput.ts` | Opens read-only document (119). |
| service | _openChildTaskTranscript | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Handles the openChildTaskTranscript message (6333). |
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Shared Cloud run detail for web and desktop. |
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Loads run journal, polls while live (readTaskJournal 117, poll 100). |
| endpoint | GET /api/llm/v1/chat/completions/runs/{runId} | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Journal page read (GET at 111). |
| component | web TasksPage wrapper | `apps/web/features/tasks/components/TasksPage.tsx` | Supplies the transport; Open chat goes to /chat/{id} (36-40). |
| component | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Tauri wrapper with sign-in gate. |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile run detail with output. |
| store | cloud task store | `apps/mobile/src/features/tasks/store.ts` | Follows a run, builds and trims transcript text (107-145). |
| component | tasks sheet | `apps/extension/src/features/side-panel/tasksSheet.ts` | Chrome task list with Open and Stop. |
| table | cloud_agent_events | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Durable run journal rows read by the detail panel. |
| test | CLI transcript test | `apps/cli/src/subagent.rs` | a_subagent_transcript_shows_its_messages_and_tool_steps (1313). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: command reads the finished child's result and prints its stored lines. | device | apps/cli/src/repl/registry.rs:535-546 |
| VS Code: sidebar asks the local runtime for the child transcript; runtime reads the saved session file. | device | ChatStateManager.ts:6346; developer_host.rs:4952-4976 |
| Web and desktop: the page reads the run journal in pages from our servers and re-reads while live. | our servers | TasksPage.tsx:117-148, :492-501; runs/[runId]/route.ts:111 |
| Mobile: follows the run stream and builds output text, trimmed to a maximum. | our servers | apps/mobile/src/features/tasks/service.ts:48-54; store.ts:129-145 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Child transcript lines (bounded, clipped to 400 chars a line) | Managed session file on the device | No sync found | Bounded count per session (session.rs:1005-1015). |
| Cloud run journal events | table cloud_agent_events on our servers | Yes, read by every Cloud surface | Deleted with the run (on delete cascade, 0061_cloud_agent_runs.sql:35-47); other retention unknown. |

**Models and providers.** No model is called to show a transcript. The transcript records whichever provider the child used (Local, own key, Cloud).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI and VS Code local transcripts need no account. Cloud run detail needs a signed-in Cloud account and, on web, an adult-eligibility check (apps/web/app/tasks/layout.tsx:14-19). |
| Permissions | Run reads are per user (getUserScopedDb in runs routes). Transcript lines are sanitised for terminal escapes in the CLI (registry.rs:540-545). |
| Subscription | No plan check on reading a transcript was found. |
| Limits and metering | Reading is rate limited as 'agent-run-follow' (runs/[runId]/route.ts:46). Web journal is capped (8 pages x 500 events). |
| Feature flags | Mobile: FEATURES.cloudTasks (apps/mobile/lib/v1FeatureFlags.ts:10). |
| Model compatibility | not model specific. |
| Provider restrictions | none found in the code. |
| Local mode | CLI and VS Code transcripts work offline from the saved file. Mobile Cloud task detail is unavailable in Local mode: the screen shows a gate to continue in Cloud (CloudTasksScreen.tsx:657-664). Desktop Tauri lists Cloud runs only; local sessions are not listed there (DesktopTasks.tsx:41-46). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web: 'Loading task journal…'; mobile loading indicator. | TaskDetailPanel.tsx:700; CloudTasksScreen.tsx:704-709 |
| Empty | Web: 'No durable progress entries were recorded.'; CLI: 'kept no transcript'. | TaskDetailPanel.tsx:703; registry.rs:544 |
| Error | Web: 'Could not load this task journal. Retry or open the source chat.' with Refresh; background failure says live updates stopped. | TasksPage.tsx:312-317 |
| Failed task | Web shows 'Why this task failed' with code and 'Temporary, safe to run again' when retryable. | TaskDetailPanel.tsx:692-734 |
| Truncated | Web notes the first 4,000 events are shown. | TaskDetailPanel.tsx:812 |
| Timeout / abandoned child | A CLI child over 600 s is cancelled; its transcript is kept unfinished and not shown by /tasks transcript. | subagent.rs:439; registry.rs:536 |
| Offline | Web and mobile show the load error; VS Code and CLI read local files so work offline. | TasksPage.tsx:312; developer_host.rs:4957 |
| Accessibility | Panel is a labelled 'Task details' region; on narrow screens it takes over as a dialog. | TaskDetailPanel.tsx:428, :479-490 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/subagent.rs`: Transcript lines for messages and tool steps (1313). No test of the /tasks transcript command found.
- `apps/extension-vscode/src/__tests__/subagents.webview.test.ts`: Transcript button appears only when transcriptAvailable and posts openChildTaskTranscript.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.details.test.tsx`: Run detail panel behaviour.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.live.test.tsx`: Live polling of the journal.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TaskDetailPanel.dialog.test.tsx`: Narrow-screen dialog takeover.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetOutput.test.tsx`: Mobile output text.
- `apps/mobile/src/features/tasks/__tests__/store.test.ts`: Task store including transcript building (detail not read).
- `apps/extension/__tests__/tasks-sheet.test.ts`: Chrome tasks sheet.

**Test scenarios**

- **CLI finished child**
  1. Spawn a child, wait for completion.
  2. /tasks transcript <id>.
  - Expected: 'Transcript of task <id>' and ordered step lines.
- **CLI failed child**
  1. Make a child fail.
  2. /tasks transcript <id>.
  - Expected: Current code says it has not finished (see gap); record the result.
- **CLI unknown id**
  1. /tasks transcript nope.
  - Expected: 'has not finished, or is not in this session' warning.
- **VS Code transcript**
  1. Resume a session whose child has a stored transcript.
  2. Press Transcript.
  - Expected: A read-only document with the child's lines opens.
- **Web failed run**
  1. Open a failed run in Work history.
  - Expected: 'Why this task failed' shows the recorded reason or 'The engine recorded no reason'.
- **Mobile run output**
  1. Open a running run on mobile.
  - Expected: 'Following live' and output text grow; closing returns to list.

**Where to look when it fails**

- developer_host errors 'This subagent has no saved transcript' / 'This chat has no matching subagent'.
- Web console '[Tasks] Failed to load task journal:'.
- Table cloud_agent_events by run_id and sequence.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md)
- Desktop: [70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md)
- Mobile: [70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md)
- CLI: [70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md)
- VS Code: [70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **/tasks transcript cannot show failed or cancelled children, though their lines are saved.** Affects: CLI. Evidence: registry.rs:536 uses get_result; unfinished lines live in get_transcript (subagent.rs:860). Work needed: Use get_transcript when no result exists.
- **Web Code page subagent group has no transcript control.** Affects: Web. Evidence: LocalSessionPanel.tsx:187-200. Work needed: Add a button wired to childTask/transcript.
- **Cloud run detail is a journal, not a full per-agent transcript.** Affects: Web, desktop, mobile. Evidence: TaskDetailPanel.tsx:748. Work needed: Decide whether the source chat link satisfies S62.12.
- **No drill-down in Chrome.** Affects: Chrome. Evidence: tasksSheet.ts. Work needed: Add a detail view or link to /tasks?run=<id>.
- **No command-level CLI test for /tasks transcript.** Affects: CLI. Evidence: no test found. Work needed: Add one.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- table:cloud_agent_events
- store:managed-session-file
- api:GET /api/llm/v1/chat/completions/runs/{runId}
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- F062-01
- F062-04

## Unknown

- Retention period of cloud_agent_events rows.
- Value of MANAGED_SESSION_MAX_CHILD_TRANSCRIPTS and the per-transcript bound.
- Whether the desktop Electron reaches the same /tasks page (not run).
- How mobile treats transcripts longer than the trim limit in the UI.
- Chrome extension: whether any detail beyond the tasks sheet exists elsewhere.
