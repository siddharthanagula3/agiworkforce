---
id: "F062-01"
type: "feature"
title: "Parent task and child agent list"
aliases: ["Subagent tasks", "Child tasks", "/tasks list", "/task list", "Subagents group", "S62.01 Parent task", "S62.02 Child-agent list", "S62.03 Role labels"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["web", "cli", "vscode"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.01", "S62.02", "S62.03"]
depends_on: ["surface:cli", "surface:vscode", "surface:web", "surface:desktop", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/subagent.rs", "store:managed-session-file", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-01 Parent task and child agent list

Shows the child agents (subagents) that a coding session started. The command-line app lists them with id, role, status and description. The VS Code side panel and the web Code page show a Subagents group with title and state. Nothing draws a tree. Children are started by the model, not by clicks.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.01](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6201), [S62.02](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6202), [S62.03](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6203).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person see which child agents a parent coding session spawned and what state each one is in. The command-line app prints a list (id, role, status, description). The VS Code sidebar and the web Code page (local developer sessions) show a 'Subagents (n)' group with each child's title and state. The parent-child link is only a flat list inside one session (apps/cli/src/subagent.rs:101; apps/web/features/code/components/LocalSessionPanel.tsx:174).

**Why it exists.** When the model fans work out to several children, the person needs to know they exist, which are still running and which failed, otherwise work happens invisibly. The product contract says progress, including subagents, must be visible typed data (doc: docs/product/experience-contract.md, rule 6).

**Who uses it.** Developers using AGI Workforce CLI, the VS Code extension, or the local developer session view on web. Testers checking multi-agent behaviour.

**Problems it solves**

- Children run on their own threads and would otherwise be invisible (apps/cli/src/subagent.rs:700-722).
- The person can see a failed or still-running child without reading the whole chat.
- Runaway fan-out is bounded and the person is told why a spawn was refused (apps/cli/src/subagent.rs:609-660).

**Use cases**

- In the CLI, ask for a review split across three files, then type /tasks to see three children running.
- In VS Code, open a resumed conversation and read 'Subagents (3) · 1 running · 1 done · 1 failed'.
- Check that a child that hit the spend cap or depth limit was refused with a clear message.

## 2. User experience

**Where to find it**

- CLI (TUI and plain REPL): slash commands /tasks and /task, alias subcommands list and ls (apps/cli/src/repl/slash_commands.rs:267-271; apps/cli/src/repl/registry.rs:484-530).
- VS Code: the 'Subagents' collapsible group above the composer in the AGI Code sidebar (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3176).
- Web: 'Subagents (n)' group inside the local developer session panel on the Code page (apps/web/features/code/components/LocalSessionPanel.tsx:174-203, mounted at :1606).
- Desktop: no desktop-specific list found. The Electron desktop starts the local runtime (apps/desktop/electron/runtime/developerSessionService.ts) and, per AGENTS.md section 5, shows the hosted web app, so the web group is [inferred] reachable there; not verified.
- Mobile and Chrome: not available. No child-agent view found.

**Before you start**

- CLI: the session must be persisted, otherwise the task tool is not offered to the model (apps/cli/src/agent/mod.rs:1064; can_own_child_tasks at :2508).
- The model must decide to call the task tool; the person cannot start a child by clicking (apps/cli/src/agent/chat.rs:2975-3070).
- VS Code and web: a local developer session that ran subagents (apps/extension-vscode/src/__tests__/subagents.webview.test.ts, 'stays hidden until a session ran subagents').

**Screens and controls**

- CLI /tasks [list | show <id> | transcript <id> | stop <id>] (apps/cli/src/repl/registry.rs:567).
- CLI TUI line '⧉ N subagents working at once' shown while more than one task or agent cell runs (apps/cli/src/tui/tui_app.rs:2977-2996).
- VS Code summary text 'Subagents (3) · 1 running · 1 done · 1 failed'; per row title and state label; Stop and Transcript buttons (apps/extension-vscode/src/__tests__/subagents.webview.test.ts; webviewContent.ts:3510-3545).
- Web summary 'Subagents (n) · ...' and rows 'title · State'; a paused child shows 'Interrupted work is kept for review and will not restart on its own.' (LocalSessionPanel.tsx:181-196).

**Journey**

1. 1. The person sends a coding request in a persisted CLI, VS Code or web local session.
2. 2. The model calls the task (or agent) tool. The CLI starts a child on its own thread and prints '[task] Spawning subagent ...' outside the TUI (apps/cli/src/subagent.rs:709-716).
3. 3. The person types /tasks (CLI) or opens the Subagents group (VS Code, web) to see each child.
4. 4. The row shows running until the child finishes, then completed, failed or cancelled.
5. 5. For details the person types /tasks show <id> (see F062-02) or opens the transcript (F062-03).

**What the person sees and gets**

- Empty CLI list: 'No subagent tasks in this session yet. Tasks appear here after the model calls the `task` tool to spawn a subagent.' (apps/cli/src/subagent.rs:102-106).
- CLI list row: id, role, [status], description; a blank description reads '(no description)' (subagent.rs:107-115).
- Failed child: status text 'failed: <error>' (subagent.rs:86-93).
- VS Code and web state words: Queued, Running, Waiting for input, Interrupted, Done, Stopped, Failed (packages/contracts/local-runtime/src/developer-session.ts:161-169).
- VS Code and web hide the group when no child exists; the VS Code group folds when all are finished (subagents.webview.test.ts).

**Settings**

- CLI subagent limits are constants, not settings: 7 at once, depth 3, 15 turns per child (apps/cli/src/subagent.rs:429-453).
- A session spend cap, when set, limits spawning (apps/cli/src/agent/chat.rs:3005-3008).
- Named agent definitions can set the child's role label and options (apps/cli/src/subagent.rs:1130; apps/cli/src/agents.rs). Their file format was not read in full.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI: /tasks list prints id, role, status, description for each child, sorted by id (apps/cli/src/subagent.rs:885-899; registry.rs:515-523).
- CLI: role label is the named agent's name, else 'general-purpose' (subagent.rs:99, :693-697).
- CLI: at most 7 children run at once; the 8th spawn is refused with 'Maximum concurrent subagents reached' (subagent.rs:429, :641-657).
- CLI: nesting stops at depth 3 with 'Maximum subagent nesting depth reached' (subagent.rs:453, :612-619).
- CLI: a session spend cap refuses new children when used up ('Session spend cap reached ...') and caps each child at an even share (subagent.rs:620-632).
- CLI: a child runs on exactly its parent's provider and privacy mode and is refused if the route leaves that boundary (subagent.rs:23-70).
- CLI app server publishes each child as a DeveloperChildTask (id, parentSessionId, title, state, timestamps, transcriptAvailable) to clients (crates/agiworkforce-protocol/bindings/DeveloperChildTask.ts; apps/cli/src/agent/mod.rs:2587-2600).
- VS Code sidebar renders the Subagents group from that data (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6258-6270).
- Web local developer session panel renders the same group (apps/web/features/code/components/LocalSessionPanel.tsx:174).

**Incomplete**

- The list is flat; no app draws a parent-child tree. The link is the session itself.
- VS Code and web rows carry no role label, model or cost because DeveloperChildTask has no such fields (DeveloperChildTask.ts).
- Web group has no Stop or Transcript control; VS Code has both (LocalSessionPanel.tsx:187-200 vs webviewContent.ts:3519-3545).
- /tasks list also prints background shell terminals under the child list (registry.rs:515-521); that is not an agent list.

**Present but disconnected or switched off**

- The task tool is removed from the model's tools when the session is not persisted (apps/cli/src/agent/mod.rs:1063-1065).

**Not available**

- Web (cloud chat), Mobile, Chrome: no child-agent list found.
- Desktop (Tauri DesktopTasks): lists Cloud runs only, no child agents (apps/desktop/src/features/tasks/DesktopTasks.tsx).
- The brief (S62.01-S62.03) marks web, desktop and VS Code as missing; code found contradicts that for VS Code and web local sessions (see gaps).

## 4. Required behaviour

**Established requirements**

- A parent task visibly owns the child agents it spawned and the user can see that relationship. (source: brief S62.01)
- The user sees a list of the child agents working under a task. (source: brief S62.02)
- Each child agent is labelled with its role. (source: brief S62.03)
- Progress, including subagents, is typed durable data and capability honesty is absolute: a disabled control is better than a no-op. (source: docs/product/experience-contract.md rules 4 and 6)
- A child never leaves its parent's trust boundary. (source: AGENTS.md section 6; apps/cli/src/subagent.rs:19-22)

**Acceptance criteria**

1. In a persisted CLI session with no children, /tasks prints the 'No subagent tasks in this session yet' text.
2. After the model spawns two children, /tasks shows two rows with id, role and status, sorted by id.
3. Spawning an 8th concurrent child is refused with the 'Maximum concurrent subagents' message.
4. A session at depth 3 cannot spawn; the message names the depth limit.
5. With a spend cap already used up, a spawn is refused with 'Session spend cap reached'.
6. In VS Code, a resumed conversation with three children shows 'Subagents (3) · ...' with state words.
7. A child started in a Local session never uses a cloud provider.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Role labels should reach VS Code and web rows, since the CLI already has the role and the brief expects labels on every app.
- [inferred] The Electron desktop shows the web group because it loads the hosted web app (AGENTS.md section 5).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add role and model fields to DeveloperChildTask so VS Code and web match the CLI list.
- [proposed] Indent children under their parent turn, if a tree is wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /tasks and /task | `apps/cli/src/repl/slash_commands.rs` | Routes the slash command to tasks_for_display (lines 267-271, 726-731). |
| service | tasks_for_display | `apps/cli/src/repl/registry.rs` | Handles list, show, output, stop, cancel, transcript subcommands (484-570). |
| service | format_task_list | `apps/cli/src/subagent.rs` | Builds the list text and the empty-state text (101-118). |
| service | SubagentManager | `apps/cli/src/subagent.rs` | Owns children, enforces concurrency 7, depth 3, spend cap; list_with_roles (462-935). |
| config | InheritedRoute | `apps/cli/src/subagent.rs` | Pins child to parent's provider and privacy mode (23-70). |
| component | working-at-once line | `apps/cli/src/tui/tui_app.rs` | Shows 'N subagents working at once' (2977-2996); RunTasks handler at 7734. |
| service | task tool dispatch | `apps/cli/src/agent/chat.rs` | Starts children when the model calls task or agent, waits, records spend (2975-3160). |
| service | child task persistence | `apps/cli/src/agent/mod.rs` | start_child_task, settle_child_task, publish_child_task, can_own_child_tasks (2508-2600). |
| service | developer_child_task projection | `apps/cli/src/platform/runtime/session.rs` | Maps a stored task to DeveloperChildTask with transcriptAvailable (992-1003). |
| schema | DeveloperChildTask / DeveloperChildTaskState | `crates/agiworkforce-protocol/bindings/DeveloperChildTask.ts` | Generated wire type read by VS Code and web. |
| component | Subagents panel (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | HTML and script for the Subagents group (3176, 3475-3550). |
| service | ChatStateManager subagent state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Keeps child tasks, posts 'subagents' messages (6258-6270). |
| service | localRuntimeClient child task schema | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Parses turn/childTask notifications (377-410, 1283). |
| component | LocalSubagents | `apps/web/features/code/components/LocalSessionPanel.tsx` | Web Subagents group (174-203). |
| hook | use-local-session childTasks | `apps/web/features/code/hooks/use-local-session.ts` | Holds child tasks from the transcript read (172, 249). |
| config | DEVELOPER_CHILD_TASK_STATE_LABELS | `packages/contracts/local-runtime/src/developer-session.ts` | Words for each child state (161-169). |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Starts the local runtime for Electron desktop; imports DeveloperChildTask (59). |
| test | subagent unit tests | `apps/cli/src/subagent.rs` | Inline tests for list format, caps and depth (1365, 1611, 1729, 1757). |
| test | subagents webview test | `apps/extension-vscode/src/__tests__/subagents.webview.test.ts` | Covers the VS Code group. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Model calls the task tool; CLI checks the session is persisted and builds a child description and prompt. | device | apps/cli/src/agent/chat.rs:2975-3070; apps/cli/src/agent/mod.rs:2508-2512 |
| SubagentManager refuses if depth, spend cap or concurrency limit is hit, else starts a dedicated OS thread with its own async runtime. | device | apps/cli/src/subagent.rs:609-725 |
| Child session is created on the parent's exact route and privacy mode; its prompt is sent to the parent's provider (Local, own key or Cloud). | device and our servers | apps/cli/src/subagent.rs:52-70, :1085-1100 (a Local route stays on the device; a Cloud route calls our service) |
| Child state is stored in the managed session file and published to attached clients as DeveloperChildTask. | device | apps/cli/src/agent/mod.rs:2548-2600 |
| CLI /tasks reads the manager's in-memory entries; VS Code and web read the published tasks and redraw the group. | device | apps/cli/src/repl/registry.rs:510-523; ChatStateManager.ts:6258-6270 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Child entry (id, role, description, status, result, transcript) | In memory in SubagentManager for the live session | No sync found | Lives while the session process lives; abandoned children are cancelled at the 600 s wait limit (subagent.rs:439). |
| Child task record and bounded child transcript | Managed session file on the device (ManagedSession.child_transcripts) | Not synced to our servers by this code; unknown for other paths | Kept bounded (MANAGED_SESSION_MAX_CHILD_TRANSCRIPTS) (apps/cli/src/platform/runtime/session.rs:1005-1015). |
| Subagent audit record (id, agent, depth, prompt size, status, usage) | Written by crate::subagent_audit (location not read) | unknown | unknown |

**Models and providers.** A child uses the same model, provider and privacy mode as its parent; a named agent definition may change the model for that child (apps/cli/src/subagent.rs:1130; apps/cli/src/agents.rs:31). Route cannot leave the parent's boundary (subagent.rs:60-67).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI: none required for Local or own-key sessions; a Cloud route needs sign-in [inferred from route rules]. VS Code and web group need a local developer session. |
| Permissions | Children inherit the parent's permission mode, allowed and disallowed tools, and approval sink (apps/cli/src/subagent.rs:668-683). No separate permission for viewing the list was found. |
| Subscription | No plan check on the list itself. Cloud-routed children are billed through the parent's usage (apps/cli/src/agent/chat.rs:3129-3136). |
| Limits and metering | 7 concurrent children, depth 3, 15 turns per child, 600 s wait (apps/cli/src/subagent.rs:429-453). Spend cap divides remaining budget among children (subagent.rs:620-632). |
| Feature flags | none found in the code for the list; the task tool depends on session persistence (agent/mod.rs:2508). |
| Model compatibility | Not model specific; any model that can call tools can call the task tool [inferred]. |
| Provider restrictions | Child must match the parent's provider trust boundary or it fails before any request (subagent.rs:60-67). |
| Local mode | Works. A Local session's children run on the device with Local models and are refused a cloud route (subagent.rs:19-22, :60-67). Listing needs no network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | CLI prints the 'No subagent tasks in this session yet' text; VS Code and web hide the group. | apps/cli/src/subagent.rs:102-106; subagents.webview.test.ts |
| Waiting / running | Status running; TUI shows the 'working at once' line when more than one runs. | subagent.rs:77; tui_app.rs:2977-2996 |
| Failure | Status 'failed: <error>'; the error is also printed outside the TUI. | subagent.rs:86-93, :818-832 |
| Cancel | /tasks stop <id> marks it cancelled and sets a flag the child polls; stopping a non-running child errors. | subagent.rs:378-392; registry.rs:548-553 |
| Timeout | A child still running after 600 s is cancelled and reported timed out. | subagent.rs:439 and wait_all comment (~410-440) |
| Spawn refused | Spawn errors become a failed tool result for the model; the child is settled failed in the saved session. | apps/cli/src/agent/chat.rs:3063-3072 |
| Unknown task id | 'No task <id> in this session. /tasks lists them.' | registry.rs:546-548 |
| Offline / reconnect | not handled in the code for the list itself; VS Code re-reads children on conversation load. | ChatStateManager.ts:4592, :5539 |
| Accessibility | VS Code list has aria-label 'Subagent status' and Stop buttons are labelled 'Stop subagent <title>'. | webviewContent.ts:3178, :3527-3530 |
| App differences | CLI shows role and description; VS Code and web show title and state only. | DeveloperChildTask.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/subagent.rs`: Inline tests: empty and populated list text, spend cap refusal (1611), per-child even share (1627), concurrency refusal (1729), depth refusal (1757).
- `apps/extension-vscode/src/__tests__/subagents.webview.test.ts`: VS Code group hidden until children exist, counts and state words, folding, Stop and Transcript messages, resumed conversation.
- `apps/web/features/code/components/LocalSessionPanel.test.tsx`: Web local-subagents group (test id at lines 1599-1636).
- `apps/web/features/code/hooks/use-local-session.test.ts`: Mentions child tasks; detail not read.
- `packages/contracts/local-runtime/src/__tests__/developer-session.test.ts`: Child state label keys match the state list (line 119).

**Test scenarios**

- **Empty list**
  1. Start a persisted CLI session.
  2. Type /tasks.
  - Expected: The 'No subagent tasks in this session yet' text appears.
- **Two children**
  1. Ask the model to review two files in parallel with subagents.
  2. Type /tasks while they run, then after.
  - Expected: Two rows with role, status running then completed.
- **Concurrency cap**
  1. Ask for 8 parallel subagents.
  - Expected: 7 start; the 8th spawn fails with the 'Maximum concurrent subagents' message.
- **Depth cap**
  1. Run a session whose children spawn children three levels deep.
  - Expected: The deepest spawn is refused naming the nesting limit.
- **VS Code group**
  1. Resume a conversation that used subagents in VS Code.
  - Expected: Subagents group shows counts and one row per child with a state word.
- **Local boundary**
  1. Start a Local-mode CLI session with a local model.
  2. Ask for a subagent.
  - Expected: The child runs on the local model; no cloud request is made.

**Where to look when it fails**

- Stderr lines '[task] Spawning subagent' and failure line outside the TUI (subagent.rs:709-716).
- Error text 'Maximum subagent nesting depth reached', 'Session spend cap reached', 'Maximum concurrent subagents reached'.
- Child outcome persistence failure: 'Failed to persist child outcome' (agent/chat.rs:3117).
- Managed session file child_transcripts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md)
- CLI: [70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md)
- VS Code: [70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **The brief marks VS Code, web and desktop as having no child-agent view, but VS Code and web local sessions have one.** Affects: Documentation and test planning on VS Code, web, desktop. Evidence: apps/extension-vscode/src/__tests__/subagents.webview.test.ts; LocalSessionPanel.tsx:174. Work needed: Correct the brief rows; verify the Electron desktop reaches the web group.
- **No role label outside the CLI.** Affects: VS Code, web. Evidence: DeveloperChildTask.ts has no role field. Work needed: Add role to the protocol type and render it.
- **No visual parent-child tree anywhere.** Affects: All apps. Evidence: registry.rs:515; LocalSessionPanel.tsx:187. Work needed: Decide if a tree is wanted; the contract only asks that the relationship be visible.
- **No Cloud chat or mobile or Chrome child-agent list.** Affects: web cloud chat, mobile, Chrome. Evidence: No code found in apps/mobile, apps/extension. Work needed: Only if those apps ever spawn children; none found today.
- **No test found for tasks_for_display (the /tasks command output).** Affects: CLI. Evidence: search of apps/cli found tests only for format_task_list. Work needed: Add command-level tests.
- Not built on: Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- surface:web
- surface:desktop
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/subagent.rs
- store:managed-session-file
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-chat-turn-pipeline

## Unknown

- Whether the Electron desktop actually exposes the web Subagents group (not run).
- Whether /tasks can be typed while the parent turn waits for children (wait_all blocks the turn; TUI input handling not traced).
- Where the subagent audit record is stored and how long it is kept.
- The CLI flag that disables session persistence, which removes the task tool.
- Whether VS Code and web groups update live during a turn on every path (only the notification parser was read).
