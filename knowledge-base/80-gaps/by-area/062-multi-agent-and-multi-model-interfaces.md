---
id: "GAPS-AREA-062"
type: "gap-list"
title: "Gaps: Multi-agent and multi-model interfaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 62. Multi-agent and multi-model interfaces

80 open gaps that touch this area. Area page: [20-features/062-multi-agent-and-multi-model-interfaces](../../20-features/062-multi-agent-and-multi-model-interfaces/README.md).

## CMP-CP57

**Cap on parallel subagents**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Ours caps running subagents at 7 as a fixed constant that users cannot change Ours caps running subagents at 7 as a fixed constant that users cannot change.
- Evidence: apps/cli/src/subagent.rs:383,598

## CMP-CP68

**Fork a session into a background copy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: It does not start a background copy or a subtask row Ours /fork branches the conversation in the foreground; it does not start a background copy or a subtask row.
- Evidence: apps/cli/src/repl/slash_commands.rs:491; apps/cli/src/tui/tui_app.rs:5955

## CMP-CP80

**Subagent limits: concurrent count and nesting depth**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Up to 7 subagents at once and 3 levels deep, both fixed in code with no setting to change them Up to 7 subagents at once and 3 levels deep, both fixed in code with no setting to change them.
- Evidence: apps/cli/src/subagent.rs:383,407

## CMP-D29

**Parallel chunks of work and parallel goals per chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: A chat runs one thing at a time; you can start other chats or tasks, but one request is not split into parallel pieces.
- Evidence: searched: parallel agents, fork in apps/web/features/chat, apps/web/app/api/llm

## CMP-D31

**Subagents and built-in helper agents (explorer, worker, planner) with their own context**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Cloud chat and tasks have no delegation to subagents with separate context; only local Code sessions on this computer list child tasks, which is out of scope here.
- Evidence: searched: subagent, spawn_agent, delegate in apps/web/app/api/llm, apps/web/features/chat

## CMP-VP31

**Subagent and background task view**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: There is no map view A Subagents panel lists child tasks with state counts; there is no map view.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3190-3225

## CMP-W158

**Parallel subagents inside one task with a read-only activity list**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Cloud tasks and Work run as one agent; there is no way to delegate parts to subagents and see their results in the chat.
- Evidence: searched: subagent, spawn_agent, delegate in apps/web/lib, features, unified-chat (only local code panel)

## CMP-WP127

**Agent splits work among parallel background agents**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Web chat does not split work for you Code shows child tasks in the session panel, but web chat does not split work for you.
- Evidence: apps/web/features/code/components/LocalSessionPanel.tsx:172-177

## CMP-WP200

**Fork a coding session from the browser**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: No fork was found for cloud coding sessions Device-local sessions can be forked; no fork was found for cloud coding sessions.
- Evidence: apps/web/features/code/CloudCodePage.tsx:1876; apps/web/features/code/components/LocalSessionPanel.tsx:442

## GAP-AREA062-LW06

**A comment says child tasks run as a bounded foreground lifecycle, but the spawn path starts a thread and returns the id straight away.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-062
- Detail: Area 62. Multi-agent and multi-model interfaces
- Evidence: apps/cli/src/subagent.rs:579-589 and apps/cli/src/subagent.rs:717-720

## GAP-AREA062-LW07

**The command-line task list does not sort or group children by whether they need input, so needs-you priority is missing there.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-062
- Detail: Area 62. Multi-agent and multi-model interfaces
- Evidence: apps/cli/src/subagent.rs:101-117

## GAP-AREA062-LW08

**The web comparison has no cost estimate, rerun control or synthesis, and the comparison is lost on reload.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-062
- Detail: Area 62. Multi-agent and multi-model interfaces
- Evidence: apps/web/features/models/components/CompareAnswersPage.tsx:327; apps/web/features/models/lib/use-compare-answers.ts:45-159

## GAP-AREA062-LW09

**Mobile timing and token figures are estimates from text length, not billed usage, and the screen does not say so.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-062
- Detail: Area 62. Multi-agent and multi-model interfaces
- Evidence: apps/mobile/src/features/compare/index.tsx:286-299; apps/mobile/src/features/compare/index.tsx:675-697

## GAP-CAP-agent-actions-06

**Parallel subagents and background agents: Cloud Work and Desktop run as one agent; no delegation or child list on Web, Desktop or Mobile; CLI limits are fixed constants.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Requirement items: S60.17, S62.01, S62.02, S62.03, S62.08, S62.16
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-09

**Branch a conversation into a new chat from a message: Mobile code ships Branch Conversation from Here although decision D-2026-09-28-15 keeps branching off the phone. Chrome has none. A web console 404 on the branches request was seen on the first turn.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Requirement items: S16.10, S17.27, S62.17, S72.13
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-17

**Fork or branch a coding session: Background fork is missing on web, desktop, mobile. Web fork is partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Requirement items: S62.16, S62.17, S72.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F062-01-01

**The brief marks VS Code, web and desktop as having no child-agent view, but VS Code and web local sessions have one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Detail: Affects: Documentation and test planning on VS Code, web, desktop. Work needed: Correct the brief rows; verify the Electron desktop reaches the web group.
- Evidence: apps/extension-vscode/src/__tests__/subagents.webview.test.ts; LocalSessionPanel.tsx:174

## GAP-F062-01-02

**No role label outside the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Detail: Affects: VS Code, web. Work needed: Add role to the protocol type and render it.
- Evidence: DeveloperChildTask.ts has no role field

## GAP-F062-01-03

**No visual parent-child tree anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Detail: Affects: All apps. Work needed: Decide if a tree is wanted; the contract only asks that the relationship be visible.
- Evidence: registry.rs:515; LocalSessionPanel.tsx:187

## GAP-F062-01-04

**No Cloud chat or mobile or Chrome child-agent list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Detail: Affects: web cloud chat, mobile, Chrome. Work needed: Only if those apps ever spawn children; none found today.
- Evidence: No code found in apps/mobile, apps/extension

## GAP-F062-01-05

**No test found for tasks_for_display (the /tasks command output).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Detail: Affects: CLI. Work needed: Add command-level tests.
- Evidence: search of apps/cli found tests only for format_task_list

## GAP-F062-01-NOTBUILT

**Parent task and child agent list: not built on Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, Chrome
- Features: [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md)
- Requirement items: S62.01, S62.02, S62.03
- Detail: Desktop: S62.01, S62.02, S62.03; Mobile: S62.01, S62.02, S62.03; Chrome: S62.01, S62.02, S62.03

## GAP-F062-02-01

**No cost or usage per answer in mobile or web compare, and no pre-run estimate (S62.25).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Detail: Affects: Mobile, web. Work needed: Return usage with the stream and display it.
- Evidence: No cost fields in CompareStreamState or CompareAnswer

## GAP-F062-02-02

**The brief says web has no comparison, but /models/compare exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Detail: Affects: Docs, test plans. Work needed: Update brief rows S62.04-S62.08, S62.19, S62.20, S62.26 for web.
- Evidence: apps/web/app/models/compare/page.tsx

## GAP-F062-02-03

**CLI hides usage for failed or cancelled children.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Detail: Affects: CLI. Work needed: Show get_spent in the detail.
- Evidence: format_task_detail None branch (subagent.rs:170-173) while get_spent exists (:873)

## GAP-F062-02-04

**No comparison on desktop Tauri, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Detail: Affects: Those apps. Work needed: Decide scope; Electron may inherit web.
- Evidence: No code found

## GAP-F062-02-05

**No Local-model comparison on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Detail: Affects: Mobile Local mode users. Work needed: Product decision; Local inference is free of subscription so a local compare could be offered.
- Evidence: compare/index.tsx:81-84

## GAP-F062-02-NOTBUILT

**Per-agent status, model and result: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md)
- Requirement items: S62.04, S62.05, S62.07, S62.08
- Detail: VS Code: S62.04, S62.05, S62.07, S62.08; Chrome: S62.04, S62.05, S62.07, S62.08

## GAP-F062-03-01

**/tasks transcript cannot show failed or cancelled children, though their lines are saved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Detail: Affects: CLI. Work needed: Use get_transcript when no result exists.
- Evidence: registry.rs:536 uses get_result; unfinished lines live in get_transcript (subagent.rs:860)

## GAP-F062-03-02

**Web Code page subagent group has no transcript control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Detail: Affects: Web. Work needed: Add a button wired to childTask/transcript.
- Evidence: LocalSessionPanel.tsx:187-200

## GAP-F062-03-03

**Cloud run detail is a journal, not a full per-agent transcript.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Decide whether the source chat link satisfies S62.12.
- Evidence: TaskDetailPanel.tsx:748

## GAP-F062-03-04

**No drill-down in Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Detail: Affects: Chrome. Work needed: Add a detail view or link to /tasks?run=<id>.
- Evidence: tasksSheet.ts

## GAP-F062-03-05

**No command-level CLI test for /tasks transcript.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Detail: Affects: CLI. Work needed: Add one.
- Evidence: no test found

## GAP-F062-03-NOTBUILT

**Per-agent transcript and drill-down: not built on Web, Desktop, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, Chrome
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Requirement items: S62.06, S62.12
- Detail: Web: S62.06; Desktop: S62.06; CLI: S62.06; Chrome: S62.06, S62.12

## GAP-F062-03-PARTLY

**Per-agent transcript and drill-down: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F062-03](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-03-per-agent-transcript-and-drill-down.md)
- Requirement items: S62.12

## GAP-F062-04-01

**Chrome has no needs-you ordering or inline reply.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Detail: Affects: Chrome. Work needed: Add the Needs you view and approve or deny.
- Evidence: tasksSheet.ts actions are Open and Stop

## GAP-F062-04-02

**Mobile 'All' view does not put needs-input runs first.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Detail: Affects: Mobile. Work needed: Sort blocked runs first or add a header.
- Evidence: runPresentation.ts:160-190 sorts by recency

## GAP-F062-04-03

**CLI has no Cloud run overview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Detail: Affects: CLI. Work needed: Product decision.
- Evidence: No code found

## GAP-F062-04-04

**VS Code lists only 25 runs and likely hides finished groups.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Detail: Affects: VS Code. Work needed: Pass states and a cursor.
- Evidence: cloudTasksTree.ts:137, runs/route.ts:36-42

## GAP-F062-04-05

**Desktop Tauri cannot archive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Detail: Affects: Desktop Tauri. Work needed: Wire archive or keep Electron as the public desktop.
- Evidence: DesktopTasks.tsx has no setRunArchived

## GAP-F062-04-06

**Overview covers AGI Work runs only; chat and Local sessions are not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Detail: Affects: All. Work needed: Product decision on a combined view.
- Evidence: runs/route.ts:150-158

## GAP-F062-04-NOTBUILT

**Concurrent task overview with needs-input first: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Requirement items: S62.10
- Detail: CLI: S62.10

## GAP-F062-04-PARTLY

**Concurrent task overview with needs-input first: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F062-04](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-04-concurrent-task-overview-with-needs-input-first.md)
- Requirement items: S62.09, S62.10, S62.11

## GAP-F062-05-01

**No shared or isolated workspace label on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-05](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-05-workspace-sharing-indicator.md)
- Detail: Affects: All six apps. Work needed: Define modes, carry the field through the protocol type, render it per app.
- Evidence: brief S62.13; no code found

## GAP-F062-05-02

**The CLI has no isolated child mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-05](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-05-workspace-sharing-indicator.md)
- Detail: Affects: CLI. Work needed: Product decision before labelling.
- Evidence: No isolation or worktree option found in apps/cli/src/subagent.rs

## GAP-F062-05-NOTBUILT

**Workspace sharing indicator: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F062-05](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-05-workspace-sharing-indicator.md)
- Requirement items: S62.13
- Detail: Web: S62.13; Desktop: S62.13; Mobile: S62.13; CLI: S62.13; VS Code: S62.13; Chrome: S62.13

## GAP-F062-06-01

**No summary-only handoff mode or indicator on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-06](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)
- Detail: Affects: All apps. Work needed: Add a mode and visible label.
- Evidence: brief S62.15; draft helper at cloudCodeSessions.ts:96 always clips to recent turns without saying so

## GAP-F062-06-02

**Handoff exists only in VS Code and is device-to-device, not agent-to-agent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-06](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)
- Detail: Affects: Web, desktop, mobile, CLI, Chrome. Work needed: Product decision about which surfaces need it.
- Evidence: No handoff code found in those apps

## GAP-F062-06-03

**Desktop and mobile handoff concepts (Dispatch) are in product requirements but were not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-06](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)
- Detail: Affects: Mobile, desktop. Work needed: Trace and map to this feature.
- Evidence: docs/product/requirements.md:1749

## GAP-F062-06-04

**The brief marks VS Code done; code supports Continue here and Continue in the cloud only partly against 'receiving agent continues it'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-06](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)
- Detail: Affects: VS Code. Work needed: Verify by run that the continuing chat actually picks up the work.
- Evidence: cloudCodeSessions.ts:243-343

## GAP-F062-06-NOTBUILT

**Agent handoff with summary: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F062-06](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-06-agent-handoff-with-summary.md)
- Requirement items: S62.14, S62.15
- Detail: Web: S62.14, S62.15; Desktop: S62.14, S62.15; Mobile: S62.14, S62.15; CLI: S62.14; VS Code: S62.15; Chrome: S62.14, S62.15

## GAP-F062-07-01

**Brief marks web, desktop, mobile and VS Code inconsistently; mobile branch and CLI background fork exist in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Affects: Anyone planning from the brief.. Work needed: Correct the area brief statuses.
- Evidence: apps/mobile/stores/chat/chatMessageStore.ts:607; apps/cli/src/background.rs:342

## GAP-F062-07-02

**No background fork on web, desktop, mobile, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Affects: All apps except CLI.. Work needed: Decide scope, then build or mark CLI-only.
- Evidence: No code found outside apps/cli/src/background.rs.

## GAP-F062-07-03

**Branch metadata (trust boundary, provider change, redaction, consent time) is not stored.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Affects: Web, mobile Cloud.. Work needed: Add columns and write them on branch.
- Evidence: apps/web/lib/services/conversation-branch-service.ts:323-336 vs docs/product/requirements.md:696-703

## GAP-F062-07-04

**Desktop Tauri branching only in Local.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Affects: Tauri desktop Managed Cloud users.. Work needed: Route Cloud branches to the server API or rely on the Electron web app.
- Evidence: apps/desktop/src/features/chat/useTauriMessageActions.ts:44-48

## GAP-F062-07-05

**No test found for CLI spawn_thread and gather_prompt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Affects: CLI.. Work needed: Add tests for fork, parent link and gather.
- Evidence: apps/cli/src/background.rs tests list

## GAP-F062-07-06

**Chrome has no branch control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Affects: Chrome.. Work needed: Add a control or leave out of scope.
- Evidence: Only window-ownership copy found.

## GAP-F062-07-NOTBUILT

**Background fork and conversation branch: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Requirement items: S62.16, S62.17
- Detail: Web: S62.16; Desktop: S62.16; VS Code: S62.16; Chrome: S62.16, S62.17

## GAP-F062-08-01

**Advisor exists only in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-08](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-08-advisor-consultation.md)
- Detail: Affects: Web, desktop, mobile, VS Code, Chrome.. Work needed: Decide if the advisor belongs on other apps, and expose the tool through the app server for VS Code.
- Evidence: No code found in those apps.

## GAP-F062-08-02

**Full-screen view lacks the 'not added to conversation' note; the answer is shown as a system message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-08](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-08-advisor-consultation.md)
- Detail: Affects: CLI full-screen users.. Work needed: Add the same note.
- Evidence: apps/cli/src/tui/tui_app.rs:7863-7866 vs apps/cli/src/repl/mod.rs:521-525

## GAP-F062-08-03

**The label uses the requested model, which may differ from the model the provider resolved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-08](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-08-advisor-consultation.md)
- Detail: Affects: CLI.. Work needed: Label with the resolved model.
- Evidence: apps/cli/src/platform/runtime/advisor.rs:225-241

## GAP-F062-08-04

**No end-to-end test of /advisor output formatting found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-08](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-08-advisor-consultation.md)
- Detail: Affects: CLI.. Work needed: Add a test for the label and the unchanged history.
- Evidence: Only registration test at tui_app.rs:11413.

## GAP-F062-08-NOTBUILT

**Advisor consultation: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F062-08](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-08-advisor-consultation.md)
- Requirement items: S62.18
- Detail: Web: S62.18; Desktop: S62.18; Mobile: S62.18; VS Code: S62.18; Chrome: S62.18

## GAP-F062-09-01

**No desktop compare screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Detail: Affects: Desktop (Tauri; Electron only via hosted web).. Work needed: Confirm Electron reaches /models/compare; add a nav entry if wanted.
- Evidence: No compare code in apps/desktop.

## GAP-F062-09-02

**No compare in CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Detail: Affects: Those apps.. Work needed: Decide scope.
- Evidence: No code found.

## GAP-F062-09-03

**Mobile fixed to two models; web allows three.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Detail: Affects: Mobile.. Work needed: Align or document.
- Evidence: apps/mobile/src/features/compare/index.tsx:147-148

## GAP-F062-09-04

**Mobile picker swaps instead of rejecting a duplicate; tier violations are silent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Detail: Affects: Mobile.. Work needed: Show a message.
- Evidence: apps/mobile/src/features/compare/index.tsx:343-367

## GAP-F062-09-05

**No tests found for the web compare page or hook; only the stream parser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Detail: Affects: Web.. Work needed: Add component and hook tests for concurrency and failure.
- Evidence: features/models tests list.

## GAP-F062-09-06

**Local on-device comparison not offered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Detail: Affects: Mobile Local and desktop Local users.. Work needed: Decide whether local models should compare on device.
- Evidence: apps/mobile/src/features/compare/index.tsx:87-89

## GAP-F062-09-NOTBUILT

**Side-by-side model comparison: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F062-09](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-09-side-by-side-model-comparison.md)
- Requirement items: S62.19, S62.20, S62.26
- Detail: Desktop: S62.19, S62.20, S62.26; CLI: S62.19, S62.20, S62.26; VS Code: S62.19, S62.20, S62.26; Chrome: S62.19, S62.20, S62.26

## GAP-F062-10-01

**No synthesis, agreement or unique-findings view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-10](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)
- Detail: Affects: Web and mobile compare users; all other apps.. Work needed: Design and build a synthesis step, with model chosen from the catalog and usage counted.
- Evidence: No code found.

## GAP-F062-10-02

**Mobile 'Faster' badge may be read as a quality verdict.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-10](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)
- Detail: Affects: Mobile.. Work needed: Keep label as speed; do not imply quality.
- Evidence: apps/mobile/src/features/compare/index.tsx:589-600

## GAP-F062-10-03

**No test for CLI /gather.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-10](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)
- Detail: Affects: CLI.. Work needed: Add tests.
- Evidence: background.rs tests list.

## GAP-F062-10-NOTBUILT

**Synthesis, agreement and unique findings: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F062-10](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-10-synthesis-agreement-and-unique-findings.md)
- Requirement items: S62.21, S62.22, S62.23
- Detail: Web: S62.21, S62.22, S62.23; Desktop: S62.21, S62.22, S62.23; Mobile: S62.21, S62.22, S62.23; CLI: S62.21, S62.22, S62.23; VS Code: S62.21, S62.22, S62.23; Chrome: S62.21, S62.22, S62.23

## GAP-F062-11-01

**No combined sources.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-11](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
- Detail: Affects: Web, mobile and all other apps.. Work needed: Decide whether compare may use search; add a merged sources panel.
- Evidence: Tools off in compare requests.

## GAP-F062-11-02

**No cost estimate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-11](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
- Detail: Affects: Web, mobile.. Work needed: Compute estimate from catalogue prices and plan metering.
- Evidence: Only hint text exists.

## GAP-F062-11-03

**No per-panel rerun.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-11](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
- Detail: Affects: Web, mobile.. Work needed: Add rerun(index) to the hook.
- Evidence: useCompareAnswers has start and stop only.

## GAP-F062-11-04

**No saved comparisons.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-11](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
- Detail: Affects: All apps.. Work needed: Add storage, list and delete with confirmation; define Local versus Cloud sync.
- Evidence: State only in memory.

## GAP-F062-11-05

**'Chat with' drops the prompt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F062-11](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
- Detail: Affects: Web.. Work needed: Optionally seed the new chat with the prompt.
- Evidence: chatWith only selects a model.

## GAP-F062-11-NOTBUILT

**Comparison sources, cost, rerun and save: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F062-11](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-11-comparison-sources-cost-rerun-and-save.md)
- Requirement items: S62.24, S62.25, S62.27, S62.28
- Detail: Web: S62.24, S62.25, S62.27, S62.28; Desktop: S62.24, S62.25, S62.27, S62.28; Mobile: S62.24, S62.25, S62.27, S62.28; CLI: S62.24, S62.25, S62.27, S62.28; VS Code: S62.24, S62.25, S62.27, S62.28; Chrome: S62.24, S62.25, S62.27, S62.28
