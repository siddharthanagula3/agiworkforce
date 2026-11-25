---
id: "REQ-AREA-073"
type: "requirements"
title: "Requirement items: VS Code and IDE extension"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 73. VS Code and IDE extension

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S73.01

**Sidebar chat view.** An AGI Workforce view in the VS Code sidebar hosts a chat that sends turns and streams replies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-01 Chat in the sidebar and in an editor tab](../../20-features/073-vs-code-and-ide-extension/F073-01-chat-in-the-sidebar-and-in-an-editor-tab.md)

## S73.02

**Editor-adjacent chat.** Chat can open as an editor tab beside code (and @agi in VS Code native Chat).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-01 Chat in the sidebar and in an editor tab](../../20-features/073-vs-code-and-ide-extension/F073-01-chat-in-the-sidebar-and-in-an-editor-tab.md)

## S73.03

**Session picker.** The user can list previous sessions (local and cloud) and reopen one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-06 Previous sessions and session search](../../20-features/073-vs-code-and-ide-extension/F073-06-previous-sessions-and-session-search.md)

## S73.04

**Repository/workspace association.** Sessions are tied to the open workspace folder: the runtime runs in that folder and history is listed per folder.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-06 Previous sessions and session search](../../20-features/073-vs-code-and-ide-extension/F073-06-previous-sessions-and-session-search.md)

## S73.05

**Active-file context.** The active editor file is attached to each turn as context (shown as a removable chip).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-02 Context from the editor (open file, selection, problems, unsaved text)](../../20-features/073-vs-code-and-ide-extension/F073-02-context-from-the-editor-open-file-selection-proble.md)

## S73.06

**Selected-code context.** Selected code in the editor is attached to the turn (chip) and selection commands (Explain, Send Selection) exist.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-02 Context from the editor (open file, selection, problems, unsaved text)](../../20-features/073-vs-code-and-ide-extension/F073-02-context-from-the-editor-open-file-selection-proble.md)

## S73.07

**Unsaved-buffer context.** Unsaved edits in open buffers (including untitled files) reach the model rather than the stale saved file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-02 Context from the editor (open file, selection, problems, unsaved text)](../../20-features/073-vs-code-and-ide-extension/F073-02-context-from-the-editor-open-file-selection-proble.md)

## S73.08

**File mentions.** Typing @ in the composer searches workspace files and attaches the chosen file content to the turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-03 File and symbol mentions with @](../../20-features/073-vs-code-and-ide-extension/F073-03-file-and-symbol-mentions-with.md)

## S73.09

**Symbol mentions.** @ search also offers workspace symbols, attaching only the symbol's file range.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-03 File and symbol mentions with @](../../20-features/073-vs-code-and-ide-extension/F073-03-file-and-symbol-mentions-with.md)

## S73.10

**Diagnostics context.** Editor diagnostics (problems) for the active file are attached as context, and errors can be explained or fixed from the editor.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-02 Context from the editor (open file, selection, problems, unsaved text)](../../20-features/073-vs-code-and-ide-extension/F073-02-context-from-the-editor-open-file-selection-proble.md)

## S73.11

**Inline suggestions.** Ghost-text inline code suggestions appear while typing and can be accepted with Tab.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-04 Inline suggestions and inline fix or refactor](../../20-features/073-vs-code-and-ide-extension/F073-04-inline-suggestions-and-inline-fix-or-refactor.md)

## S73.12

**Inline edits.** Selecting code and running Fix/Refactor rewrites that code in place in the editor.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-04 Inline suggestions and inline fix or refactor](../../20-features/073-vs-code-and-ide-extension/F073-04-inline-suggestions-and-inline-fix-or-refactor.md)

## S73.13

**Native diff review.** Proposed or applied changes can be reviewed in VS Code's own diff editor.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-05 Review and apply changes in the editor diff](../../20-features/073-vs-code-and-ide-extension/F073-05-review-and-apply-changes-in-the-editor-diff.md)

## S73.14

**Hunk acceptance.** Individual hunks of a proposed change can be accepted or rejected separately.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-05 Review and apply changes in the editor diff](../../20-features/073-vs-code-and-ide-extension/F073-05-review-and-apply-changes-in-the-editor-diff.md)

## S73.15

**Apply patch.** A suggested code block can be applied to the file as a reviewable patch and accepted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-05 Review and apply changes in the editor diff](../../20-features/073-vs-code-and-ide-extension/F073-05-review-and-apply-changes-in-the-editor-diff.md)

## S73.16

**Terminal integration.** The extension works with the integrated terminal: run/suggest/explain commands and continue a session in a terminal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-07 Terminal help](../../20-features/073-vs-code-and-ide-extension/F073-07-terminal-help.md)

## S73.17

**Command-palette actions.** Extension actions are available from the Command Palette.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-08 Commands, keyboard shortcuts, model and mode controls, status bar](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)

## S73.18

**Keyboard bindings.** Key actions have default keyboard shortcuts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-08 Commands, keyboard shortcuts, model and mode controls, status bar](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)

## S73.19

**Status-bar indicators.** A status-bar item shows the current model and agent mode and opens the model picker.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-08 Commands, keyboard shortcuts, model and mode controls, status bar](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)

## S73.20

**Model and permission controls.** The user can pick the model and the agent permission mode (and effort) from the extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-08 Commands, keyboard shortcuts, model and mode controls, status bar](../../20-features/073-vs-code-and-ide-extension/F073-08-commands-keyboard-shortcuts-model-and-mode-control.md)

## S73.21

**Task and approval notifications.** Pending approvals and finished tasks are signalled even when the chat view is hidden, and approvals can be answered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-09 Approvals and task notices](../../20-features/073-vs-code-and-ide-extension/F073-09-approvals-and-task-notices.md)

## S73.22

**Project instructions.** Project instruction files (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md) apply to turns in the session folder and can be viewed from the extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-10 Project instructions, skills and MCP servers](../../20-features/073-vs-code-and-ide-extension/F073-10-project-instructions-skills-and-mcp-servers.md)

## S73.23

**MCP/Skill/Plugin settings.** The user can view and manage MCP servers, skills and plugins from the extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-10 Project instructions, skills and MCP servers](../../20-features/073-vs-code-and-ide-extension/F073-10-project-instructions-skills-and-mcp-servers.md)

## S73.24

**Shared session with CLI/desktop.** A session can move between VS Code and the terminal CLI (continue a CLI session here; continue this chat in the terminal).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-06 Previous sessions and session search](../../20-features/073-vs-code-and-ide-extension/F073-06-previous-sessions-and-session-search.md)

## S73.25

**Remote workspace support.** The extension works in Remote-SSH/tunnel workspaces by running on the remote host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-11 Works in remote and container windows](../../20-features/073-vs-code-and-ide-extension/F073-11-works-in-remote-and-container-windows.md)

## S73.26

**Container/WSL support where offered.** The extension works in dev containers and WSL windows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-11 Works in remote and container windows](../../20-features/073-vs-code-and-ide-extension/F073-11-works-in-remote-and-container-windows.md)

## S73.27

**Workspace-trust experience.** In an untrusted workspace the extension limits risky features, explains why, and links to Manage Trust.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-12 Workspace trust, updates and version notices](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)

## S73.28

**Webview error and loading states.** The chat webview shows loading, setup-needed and error states with a retry.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-01 Chat in the sidebar and in an editor tab](../../20-features/073-vs-code-and-ide-extension/F073-01-chat-in-the-sidebar-and-in-an-editor-tab.md)

## S73.29

**Extension update flow.** The extension tells users when an update is needed or available and what changed, and lets them update.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-12 Workspace trust, updates and version notices](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)

## S73.30

**IDE-version compatibility messaging.** Users on an unsupported VS Code version (or a fork without needed APIs) are told what is incompatible.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F073-12 Workspace trust, updates and version notices](../../20-features/073-vs-code-and-ide-extension/F073-12-workspace-trust-updates-and-version-notices.md)
