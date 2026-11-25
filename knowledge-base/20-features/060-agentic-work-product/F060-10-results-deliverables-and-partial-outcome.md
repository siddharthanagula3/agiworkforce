---
id: "F060-10"
type: "feature"
title: "Results, deliverables and partial outcome"
aliases: ["Results, deliverables and partial outcome", "Results summary (S60.29)", "Generated deliverables (S60.30)", "Partial-outcome summary (S60.31)", "Result", "Outputs", "Files", "Outcome"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S60.29", "S60.30", "S60.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "mode:cloud", "api:GET /api/files/{id}", "api:GET /api/llm/v1/chat/completions/runs/{runId}", "table:cloud_agent_events", "table:cloud_agent_runs", "file:packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx", "file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "F060-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-10 Results, deliverables and partial outcome

When a Work task ends, the person sees its result text, the files it produced with a download link, its cost, and, if it stopped short, how many plan steps were done and which remain. Web, the desktop build, mobile and VS Code show this; Chrome and the CLI show far less.

Area: [60. Agentic work product](README.md). Requirement items: [S60.29](../../10-requirements/capabilities/060-agentic-work-product.md#s6029), [S60.30](../../10-requirements/capabilities/060-agentic-work-product.md#s6030), [S60.31](../../10-requirements/capabilities/060-agentic-work-product.md#s6031).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads the task's event journal and shows a final answer ('Result'), the produced files ('Outputs' on web, 'Files' on mobile, 'Outputs' in VS Code), the failure reason when it failed, cost and tokens, and for a task stopped by step limit, timeout, cancel or failure a count of steps done and a list of steps remaining.

**Why it exists.** A person returns to a long task and needs to know what it produced and what is missing without reading the whole transcript.

**Who uses it.** Anyone who started a Work task, from any app, including a different app than the one that started it.

**Problems it solves**

- Finding the answer among many progress lines.
- Getting the files the agent made.
- Knowing whether the task finished or stopped short, and what is left.

**Use cases**

- Open a finished report task and download the generated document.
- See that a task stopped at its step limit after 4 of 6 steps and read the remaining steps.
- Copy the result text from a task in VS Code.

## 2. User experience

**Where to find it**

- Web /tasks (Work history): select a task; the panel shows Goal, Plan, Result, Why this task failed, Cost and usage, Progress, Outputs, Context (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:550-808).
- Desktop: Electron shows the web page; the Tauri build uses the same shared panel (apps/desktop/src/features/tasks/DesktopTasks.tsx:58).
- Mobile: Tasks screen, task detail sheet with state, 'Plan', 'Latest output', 'Files', 'Activity' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:503-575).
- VS Code: Cloud tasks tree, open a task, QuickPick sections Progress, Outcome, Result, Error, Outputs (apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:84-152).
- CLI: the answer prints in the terminal and a 'Files changed this turn' line lists edits (apps/cli/src/tui/tui_app.rs:8655-8660).
- Chrome: Tasks sheet shows title, state and time, with Open to the web chat (apps/extension/src/features/side-panel/tasksSheet.ts:70-87).

**Before you start**

- Signed-in account; the task exists in the account.
- Files: opening a file needs the file route to accept the person (owner scope, download allowance) (apps/web/app/api/files/[id]/route.ts:198-246).

**Screens and controls**

- Web 'Result' (or 'Latest output' while live), at most 4,000 characters then an ellipsis (task-display.ts:131-147).
- Web 'Outputs · N': file name, type line, size, link 'Download and open'; historic outputs with an unsafe link say 'Download unavailable for this historical output.' (TaskDetailPanel.tsx:228-230,307-334).
- Web plan summary for a stopped task: 'Done X of N steps before it stopped.' and 'Remaining: 3. ...; 4. ...' (TaskDetailPanel.tsx:633-645).
- Web 'Why this task failed' lists engine error messages and code, or says no reason was recorded (TaskDetailPanel.tsx:691-726).
- Mobile 'Files · N' rows 'Open or share <name>' (CloudRunFilesSection.tsx:50,60).
- VS Code 'Outcome' line 'N of M steps done, K not finished' and 'Result' item 'Select to copy the full result' (cloudRunPresentation.ts:191-202; cloudRunDetail.ts:111-127).

**Journey**

1. 1. Open the task list and select a finished task.
2. 2. Read the state badge: Completed, Ready for review, Partially completed, Timed out, Failed or Cancelled.
3. 3. Read the Result text at the top.
4. 4. If it stopped short, read the plan summary and the Remaining list.
5. 5. Press 'Download and open' (web), tap the file row (mobile) or pick the output (VS Code).
6. 6. Optionally open the source chat for the full transcript.

**What the person sees and gets**

- Banner 'Showing the first 4,000 events. Open the source chat for the rest.' when the journal is longer (TaskDetailPanel.tsx:812).
- Cost line in credits, or 'metered against your free trial allowance rather than charged'; tokens and model call count (TaskDetailPanel.tsx:336-385).
- Mobile alert 'Could not open this file' with the reason (CloudRunFilesSection.tsx:30-33).
- VS Code message 'copied the task result' (cloudRunDetail.ts:261).

**Settings**

- None found specific to results. Unread marks use browser storage key agi-task-views (task-display.ts:149-234).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The server journals each produced file as an artifact-produced event (name, type, uri, size) and a generated-files event, both at turn end and before a pause (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4933-4983,5214,6705).
- Web result text is the last answer segment after the last tool start in the journal (task-display.ts:133-147; TaskDetailPanel.tsx:676-689).
- Web outputs list only files whose uri matches /api/files/<id>; others are shown as unavailable (TaskDetailPanel.tsx:228-230,309,317-330).
- GET /api/files/{id} is rate limited (files-serve), owner and workspace scoped, applies the download allowance, and serves inline up to a size limit, redirecting large sealed attachments (apps/web/app/api/files/[id]/route.ts:45,194-246).
- Partial outcome: when the loop reaches its step limit it emits an error 'Agent stopped after reaching the N-step execution limit.' (code max_agent_steps_reached) and ends as state partial; a time-out ends as timed_out; the plan items are advanced to stopped (tool-loop.ts:7963-7975,5209-5242). A grep also finds a partial state written in apps/web/lib/workflows/steps/settle-workflow-invocation.ts:184 (not opened).
- Web shows the done count and remaining steps for partial, timed out, cancelled and failed runs when the plan overview exists (TaskDetailPanel.tsx:169,485,633-645).
- Mobile shows the plan with step statuses and 'Done X of N steps before it stopped.' for the same states, markdown latest output, and a Files section (CloudRunDetailSheet.tsx:215,503-556; CloudRunFilesSection.tsx:20-37).
- VS Code shows Outcome, Result (copy), Error and Outputs from the conversation's artifacts, opened read-only (cloudRunDetail.ts:62-68,111-152; apps/extension-vscode/src/core/commandSetup.ts:2717-2722).

**Incomplete**

- Mobile and VS Code show a count of steps done but do not list the remaining steps (CloudRunDetailSheet.tsx:536; cloudRunPresentation.ts:199-201).
- VS Code Outputs are the artifacts of the whole conversation, not only this run (cloudRunDetail.ts:57-68).
- Chrome lists task title, state and time only; no result, files or partial summary (tasksSheet.ts:70-87).
- CLI shows the answer and changed files but no plan outcome summary for a step-limit stop was found (tui_app.rs:8655-8660).

**Present but disconnected or switched off**

- Result text is cut at 4,000 characters on web with no way to expand in the panel (task-display.ts:131,146).

**Not available**

- Partial-outcome summary: not found on CLI and Chrome.
- Download for old outputs whose uri is not an /api/files path (web).
- The brief cites tool-loop.ts:3997 for partial outcome; that line is tool schema code. The real code is at tool-loop.ts:5209-5242 and 7963-7975.

## 4. Required behaviour

**Established requirements**

- When a task ends the user sees a summary of the result. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.29)
- Files the task produced are listed and can be opened or downloaded. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.30)
- When a task stops short, the user sees what was done and what remains. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.31)
- Artifacts and files are first-class, editable outputs. (source: doc: docs/product/definition.md:136-138)

**Acceptance criteria**

1. A completed task shows a Result section with the final answer text and no progress noise.
2. A task that produced files lists each with name, type and size and a download link that returns the file for the owner only.
3. A task that hit its step limit shows state 'Partially completed' and a line 'Done X of N steps before it stopped.' with the remaining steps named.
4. A failed task shows 'Why this task failed' with the engine message, or says none was recorded.
5. Another account cannot open a file by its id (404).
6. On mobile and VS Code the done count matches the plan, and Files or Outputs are listed.
7. A run with a journal over 4,000 events shows the truncation notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chrome should at least link to the web task for results; the Open button does that (tasksSheet.ts:82-85).

**Proposed improvements** (suggestions, not requirements)

- [proposed] List the remaining steps on mobile and VS Code.
- [proposed] Show a partial or failure summary and file list on Chrome and CLI, or explain where to find them.
- [proposed] Let the person expand a long result.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Result, plan summary, outputs, failure, cost sections. |
| service | task-display | `packages/ui/unified-chat/src/components/tasks/task-display.ts` | taskResultText, labels, tone, cost formatting. |
| endpoint | GET /api/files/{id} | `apps/web/app/api/files/[id]/route.ts` | Serves produced files with owner scope and download allowance. |
| service | tool loop terminal and harvest | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | harvestGeneratedFilesEvents, flushTerminal with partial and timed_out, step limit error. |
| job | settle workflow invocation | `apps/web/lib/workflows/steps/settle-workflow-invocation.ts` | Also writes a partial state (line 184; not opened). |
| event | artifact-produced / task-state-changed / error | packages/contracts/types/src/protocol (not found) (not found) | Journal event types the panel reads. |
| service | agent task state labels | `packages/contracts/types/src/cross-device.ts` | AGENT_TASK_STATE_LABELS including Partially completed and Timed out (line 374-389). |
| table | cloud_agent_events | `apps/web/lib/services/cloud-agent-run-service.ts:1237` | Journal rows read for the detail. |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile plan, output, files, activity. |
| component | CloudRunFilesSection | `apps/mobile/src/features/tasks/components/CloudRunFilesSection.tsx` | Download and share produced files. |
| service | mobile runPresentation | `apps/mobile/src/features/tasks/runPresentation.ts` | Builds plan, files, activity from events. |
| command | VS Code cloudRunDetail | `apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts` | Outcome, Result, Error, Outputs items. |
| service | VS Code cloudRunPresentation | `apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts` | cloudRunOutcomeSummary and result text. |
| component | Chrome tasksSheet | `apps/extension/src/features/side-panel/tasksSheet.ts` | List only; Open on web. |
| screen | CLI turn view | `apps/cli/src/tui/tui_app.rs` | Prints the answer and files changed. |
| test | TasksPage.live test | `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.live.test.tsx` | Failure reason rendering. |
| test | mobile CloudRunDetailSheetOutput test | `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetOutput.test.tsx` | Mobile output section (exact cases not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The executor produces files in a sandbox or via a provider; at the end of the turn it saves them as library assets and journals artifact-produced events. | our servers | tool-loop.ts:4939-4983 |
| At the end the loop advances the plan to done, stopped or failed and emits the final task state (ready_for_review, partial, timed_out, failed or cancelled). | our servers | tool-loop.ts:5217-5253 |
| The client reads the run journal in pages of 500 up to 8 pages and rebuilds the activity, plan, outputs and result from the events. | device | TasksPage.tsx:115-156; TaskDetailPanel.tsx:221-226,449-485 |
| Pressing a file link requests /api/files/{id}; the server checks owner and allowance and returns or redirects to the bytes. | our servers | apps/web/app/api/files/[id]/route.ts:194-246 |
| Mobile downloads the file to the device and opens the share sheet. | device and our servers | CloudRunFilesSection.tsx:24-28 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Produced files | Workspace media assets (object storage plus asset rows; tables not opened) | Yes, any app can fetch by id | Until deleted from the library; download counts against an allowance unless exempt |
| Journal events (result text, progress, errors) | table cloud_agent_events | Yes | unknown |
| Settled usage (tokens, cost cents) | cloud_agent_runs (usage) | Returned as run.usage | With the run |

**Models and providers.** The final answer and plan outcome come from whichever model the run used; the panel shows its display label in the list row (TasksPage.tsx:~735). Cost is shown in credits from the run's settled cents (task-display.ts:39-41). Provider-generated files and sandbox outputs are both journaled (tool-loop.ts:4939-4968). Details: SYS-inference-providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. File route and run routes are owner scoped; web layout also requires adult eligibility (apps/web/app/tasks/layout.tsx:19). |
| Permissions | Files are returned only for the owner in the active workspace; others get 404 (route.ts:201-208). |
| Subscription | No plan check found for reading results. Downloading may spend a download allowance (assertDownloadAllowance, route.ts:172-174,274,328). |
| Limits and metering | files-serve rate limit; inline serve limit 30 MB for files, larger video limit; PDF preview limit; journal view 4,000 events (route.ts:45-51,195; TasksPage.tsx:115-116). |
| Feature flags | Mobile FEATURES.cloudTasks. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | A Local session has no run journal here; its results are the local chat. The Tauri Tasks panel is hidden in local mode. In the CLI results come from the local turn and need no payment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading task journal…', 'Loading outputs…', 'Loading the failure reason…'. | TaskDetailPanel.tsx:743,760,721 |
| Empty outputs | 'No generated files are recorded for this task.' | TaskDetailPanel.tsx:760 |
| No progress | 'No durable progress entries were recorded.' | TaskDetailPanel.tsx:743 |
| Journal error | Alert with the error; background poll failure says live updates stopped. | TaskDetailPanel.tsx:544-548; TasksPage.tsx:312-316 |
| Long journal | Truncation notice after 4,000 events. | TaskDetailPanel.tsx:810-814 |
| Run failed with no error event | Says the engine recorded no reason and points to the source chat. | TaskDetailPanel.tsx:719-723 |
| Step limit | State partial plus a non-retryable error line. | tool-loop.ts:7967-7975 |
| File fails to persist | A notice that some files could not be saved is emitted in the stream (count of failed files). | tool-loop.ts:4985-4990 |
| File download fails (mobile) | Alert 'Could not open this file'. | CloudRunFilesSection.tsx:30-33 |
| Large PDF | 413 'This PDF is too large to preview. Download it to open it.' | route.ts:51,118-123 |
| Accessibility | Plan items carry screen-reader status text; sections have aria-labels; mobile file rows have labels with busy state. | TaskDetailPanel.tsx:628,604; CloudRunFilesSection.tsx:60-61 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.details.test.tsx`: Detail opening, paginated journal reads, source chat action, mobile overlay.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.live.test.tsx`: Live re-reads, failure reason, no failure section for a healthy run.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.cost.test.tsx`: Cost and usage section.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx`: Goal and committed plan sections.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TaskDetailPanel.dialog.test.tsx`: Mobile takeover dialog behaviour.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetOutput.test.tsx`: Mobile output rendering (exact cases not read).
- `apps/mobile/src/features/tasks/__tests__/runPresentation.test.ts`: Mobile presentation of runs (exact cases not read).
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: Detail items and plan step reading.
- `apps/web/lib/services/__tests__/cloud-agent-run-work-states.test.ts`: Server work states (exact cases not read).

**Test scenarios**

- **Result and files**
  1. Run a Work task asking for a short report as a file.
  2. Open it in /tasks when finished.
  3. Press 'Download and open'.
  - Expected: Result shows the answer; Outputs lists the file with type and size; the link downloads the same file.
- **Partial outcome**
  1. Run a task with a plan of several steps and a low step limit (or one that exceeds it).
  2. Open it after it stops.
  - Expected: State 'Partially completed'; 'Done X of N steps before it stopped.' and a Remaining list; error code max_agent_steps_reached in the journal.
- **Cross-account file access**
  1. Copy a file link from account A.
  2. Open it signed in as account B.
  - Expected: 404 'File not found'.
- **Failure reason**
  1. Open a Failed task.
  - Expected: 'Why this task failed' lists the recorded message or says none was recorded.
- **Mobile files**
  1. Open a task with files on the phone and tap one.
  - Expected: File downloads and the share sheet opens; on failure an alert shows the reason.
- **Chrome and CLI gap check**
  1. Open the same stopped task in Chrome Tasks and in the CLI.
  - Expected: Chrome shows only title, state, time; confirms no partial summary.

**Where to look when it fails**

- Server log '[tool-loop] max steps reached without terminal stop' and '[tool-loop] provider generated-file persist failed'.
- Event error code max_agent_steps_reached.
- Tables cloud_agent_events (artifact-produced) and cloud_agent_runs.
- Client console '[Tasks] Failed to load task journal:'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- VS Code: [70-qa/test-plans/vscode/060-agentic-work-product.md](../../70-qa/test-plans/vscode/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Remaining steps are not listed on mobile and VS Code.** Affects: Mobile, VS Code. Evidence: CloudRunDetailSheet.tsx:536; cloudRunPresentation.ts:199-201. Work needed: List the unfinished steps like web.
- **No result, files or partial summary on Chrome; CLI has no partial-outcome summary.** Affects: Chrome, CLI. Evidence: tasksSheet.ts:70-87; tui_app.rs:8655-8660. Work needed: Add or deliberately route to the web task.
- **VS Code outputs are per conversation, not per run.** Affects: VS Code. Evidence: cloudRunDetail.ts:57-68. Work needed: Filter by artifacts produced in this run.
- **Result is truncated at 4,000 characters on web.** Affects: Web, Tauri desktop. Evidence: task-display.ts:131,146. Work needed: Offer full text or link to the source chat in the section.
- **Brief citations for partial outcome and files are stale.** Affects: Documentation. Evidence: tool-loop.ts:3997 is schema code; files route line 71 is range parsing. Work needed: Update S60.30 and S60.31 rows.
- **Old outputs with non-/api/files uris cannot be downloaded.** Affects: Web. Evidence: TaskDetailPanel.tsx:228-230,327-330. Work needed: Backfill or map historic uris.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- mode:cloud
- api:GET /api/files/{id}
- api:GET /api/llm/v1/chat/completions/runs/{runId}
- table:cloud_agent_events
- table:cloud_agent_runs
- file:packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx
- file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- F060-11

## Unknown

- How the workflow settle step writes the partial state (settle-workflow-invocation.ts:184, not opened).
- Where timed_out is emitted from.
- Storage tables and retention for produced files.
- Whether the CLI shows a step-limit stop distinctly (not found).
- Exact cases in the mobile output and presentation tests.
- Whether Chrome should show results (no requirement text beyond the brief).
