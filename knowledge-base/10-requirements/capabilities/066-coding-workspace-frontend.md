---
id: "REQ-AREA-066"
type: "requirements"
title: "Requirement items: Coding-workspace frontend"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 66. Coding-workspace frontend

41 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S66.01

**Repository picker.** The user chooses which repository or folder a coding session works on before it starts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done
- Seen in a real run: Web UI_ONLY
- Feature: [F066-01 Start a session in a folder, branch or worktree](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Competitor trace: CAP-coding-workflows-06, CAP-coding-workflows-07

## S66.02

**Branch picker.** The user chooses the git branch a coding session starts from or works on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI missing, VS Code done
- Seen in a real run: Web UI_ONLY
- Feature: [F066-01 Start a session in a folder, branch or worktree](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Competitor trace: CAP-coding-workflows-07

## S66.03

**Worktree picker.** The user picks or creates a git worktree for a coding session so parallel work stays isolated.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F066-01 Start a session in a folder, branch or worktree](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Competitor trace: CAP-coding-workflows-23

## S66.04

**Local/cloud execution selector.** Before starting, the user chooses whether the coding session runs locally or in a cloud sandbox.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-01 Start a session in a folder, branch or worktree](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Competitor trace: CAP-coding-workflows-06

## S66.05

**Coding-session list.** The user sees a list of their coding sessions and can open one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-02 Session list, titles and status](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Competitor trace: CAP-coding-workflows-06

## S66.06

**Coding-session title.** Each coding session shows a readable title, and the user can rename it where the surface offers renaming.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-02 Session list, titles and status](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)

## S66.07

**Session status.** Each coding session shows whether it is running, waiting for approval, idle, failed or closed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-02 Session list, titles and status](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)

## S66.08

**File tree.** The coding workspace shows a browsable tree of the repository's files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.09

**File search.** The user searches the workspace for files by name from inside the coding surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.10

**Symbol search.** The user searches for code symbols (functions, classes) by name from the coding surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.11

**Code editor.** The user can open and edit a source file inside the coding surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI missing, VS Code done
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.12

**Editor tabs.** Several files can be open at once in editor tabs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.13

**Selected-code context.** The user selects code in the workspace and sends that selection to the agent as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.14

**Diagnostics panel.** The workspace shows compiler/linter diagnostics and lets the user act on them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done
- Feature: [F066-03 Files, search, editor, diagnostics and selected-code context](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)

## S66.15

**Integrated terminal.** The user runs shell commands in a terminal attached to the coding session and sees their output.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F066-04 Terminal and command history](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)

## S66.16

**Terminal tabs.** The user keeps several terminals open side by side or in tabs within the coding surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing
- Feature: [F066-04 Terminal and command history](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)

## S66.17

**Command-history view.** The user can review the commands run in the session with their output and exit status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-04 Terminal and command history](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)

## S66.18

**Diff viewer.** The user views a line-level diff of the changes the agent made.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-05 Review the agent's changes](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Competitor trace: CAP-coding-workflows-09

## S66.19

**File-change summary.** The user sees a summary of which files the session created, modified or deleted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-05 Review the agent's changes](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Competitor trace: CAP-coding-workflows-09

## S66.20

**Inline review comments.** The user leaves review comments on specific lines of a change, and the agent can act on them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-05 Review the agent's changes](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Competitor trace: CAP-coding-workflows-09

## S66.21

**Hunk acceptance/rejection.** The user accepts or rejects individual hunks of an agent change.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F066-05 Review the agent's changes](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Competitor trace: CAP-coding-workflows-09

## S66.22

**Checkpoint list.** The user sees a list of checkpoints (saved states of code and conversation) for the session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F066-06 Checkpoints and rewind](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Competitor trace: CAP-editing-regeneration-and-branching-16

## S66.23

**Restore checkpoint.** The user restores the session's code and conversation to an earlier checkpoint.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F066-06 Checkpoints and rewind](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Competitor trace: CAP-editing-regeneration-and-branching-16

## S66.24

**Plan mode.** The user switches the agent into a plan mode where it proposes a plan and makes no edits until approved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F066-07 Plan mode, edit mode and permission control](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Competitor trace: CAP-coding-workflows-21

## S66.25

**Edit/agent mode.** The user chooses a mode in which the agent may edit files and run tools on its own (edit/agent mode) versus asking first.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F066-07 Plan mode, edit mode and permission control](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Competitor trace: CAP-coding-workflows-21

## S66.26

**Permission-mode control.** The user sets how much the agent must ask before acting (ask every time / auto-approve safe / autonomous), and the running session honours it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done
- Seen in a real run: Web UI_ONLY
- Feature: [F066-07 Plan mode, edit mode and permission control](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Competitor trace: CAP-coding-workflows-21

## S66.27

**Context-usage indicator.** The workspace shows how much of the model's context window the session has used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F066-08 Usage and context-window indicator](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)

## S66.28

**Usage/cost indicator.** The coding surface shows how much plan usage or money the user has spent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-08 Usage and context-window indicator](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Competitor trace: CAP-coding-workflows-27

## S66.29

**Background task list.** The user sees a list of the session's background tasks (long commands, spawned jobs) and their state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done
- Feature: [F066-09 Background tasks, subagents and running servers](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)

## S66.30

**Subagent panel.** The user sees the subagents the session spawned, what each is doing and its result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F066-09 Background tasks, subagents and running servers](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)

## S66.31

**Browser preview.** The workspace shows a live browser preview of the app the session is building.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-10 Live browser preview and simulator](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)

## S66.32

**Console-log panel.** The workspace shows the previewed app's browser console logs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-10 Live browser preview and simulator](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)

## S66.33

**Running-server list.** The user sees which dev servers the session started, and can stop them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-09 Background tasks, subagents and running servers](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)

## S66.34

**Port/preview URL.** The workspace shows the port or preview URL of a server the session runs, and opens it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-10 Live browser preview and simulator](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)

## S66.35

**Simulator panel where offered.** Where offered, the workspace shows a device simulator running the app under development.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-10 Live browser preview and simulator](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)

## S66.36

**Pull-request panel.** The workspace shows the session's pull request (open one, see its number/link and state).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-11 Pull request, checks, test results, recap](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Competitor trace: CAP-coding-workflows-10

## S66.37

**CI-status panel.** The workspace shows CI check status for the session's branch or pull request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F066-11 Pull request, checks, test results, recap](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Competitor trace: CAP-coding-workflows-11

## S66.38

**Test-results panel.** The workspace shows the results of test runs (pass/fail, counts, failing output).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile done, CLI missing
- Feature: [F066-11 Pull request, checks, test results, recap](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)

## S66.39

**Session recap.** The user gets a recap of what the session did: goal, decisions, files touched, checks run, next steps.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F066-11 Pull request, checks, test results, recap](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)

## S66.40

**Share session.** The user shares a coding session with someone else, who can open it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing
- Feature: [F066-12 Continue, share and move sessions](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Competitor trace: CAP-coding-workflows-24

## S66.41

**Continue in another client.** The user moves an ongoing coding session to another client (terminal, editor, desktop, phone) and continues it there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F066-12 Continue, share and move sessions](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Competitor trace: CAP-coding-workflows-20
