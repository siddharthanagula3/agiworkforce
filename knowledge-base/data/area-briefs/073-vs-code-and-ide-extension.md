# Area 73. VS Code and IDE extension

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S73.01 Sidebar chat view.
- Should: An AGI Workforce view in the VS Code sidebar hosts a chat that sends turns and streams replies.
- Status: vscode done
- Code: apps/extension-vscode/package.json:796; apps/extension-vscode/src/core/chatSetup.ts:59; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2656

## S73.02 Editor-adjacent chat.
- Should: Chat can open as an editor tab beside code (and @agi in VS Code native Chat).
- Status: vscode done
- Code: apps/extension-vscode/src/core/commandSetup.ts:950; apps/extension-vscode/src/providers/chatEditorPanel.ts:46; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:591

## S73.03 Session picker.
- Should: The user can list previous sessions (local and cloud) and reopen one.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:934; apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:100; apps/extension-vscode/src/core/commandSetup.ts:1243

## S73.04 Repository/workspace association.
- Should: Sessions are tied to the open workspace folder: the runtime runs in that folder and history is listed per folder.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2442; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2466

## S73.05 Active-file context.
- Should: The active editor file is attached to each turn as context (shown as a removable chip).
- Status: vscode done
- Code: apps/extension-vscode/src/data/composerContext.ts:162; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2650

## S73.06 Selected-code context.
- Should: Selected code in the editor is attached to the turn (chip) and selection commands (Explain, Send Selection) exist.
- Status: vscode done
- Code: apps/extension-vscode/src/data/composerContext.ts:178; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2660; apps/extension-vscode/src/core/commandSetup.ts:965; apps/extension-vscode/src/data/contextExclusion.ts:132; apps/extension-vscode/src/__tests__/contextExclusion.test.ts:1

## S73.07 Unsaved-buffer context.
- Should: Unsaved edits in open buffers (including untitled files) reach the model rather than the stale saved file.
- Status: vscode done
- Code: apps/extension-vscode/src/data/composerContext.ts:163; apps/extension-vscode/src/data/composerContext.ts:190

## S73.08 File mentions.
- Should: Typing @ in the composer searches workspace files and attaches the chosen file content to the turn.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5488; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:794; apps/extension-vscode/src/features/chat-participant/promptReferences.ts:143

## S73.09 Symbol mentions.
- Should: @ search also offers workspace symbols, attaching only the symbol's file range.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5488; apps/extension-vscode/src/data/mentionSearch.ts:60

## S73.10 Diagnostics context.
- Should: Editor diagnostics (problems) for the active file are attached as context, and errors can be explained or fixed from the editor.
- Status: vscode done
- Code: apps/extension-vscode/src/data/composerContext.ts:189; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2660

## S73.11 Inline suggestions.
- Should: Ghost-text inline code suggestions appear while typing and can be accepted with Tab.
- Status: vscode done
- Code: apps/extension-vscode/package.json:1060; apps/extension-vscode/src/core/providerSetup.ts:79; apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts:193

## S73.12 Inline edits.
- Should: Selecting code and running Fix/Refactor rewrites that code in place in the editor.
- Status: vscode done
- Code: apps/extension-vscode/src/core/commandSetup.ts:969; apps/extension-vscode/src/platform/applyEdit.ts:50

## S73.13 Native diff review.
- Should: Proposed or applied changes can be reviewed in VS Code's own diff editor.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1002; apps/extension-vscode/src/features/path-links/index.ts:84

## S73.14 Hunk acceptance.
- Should: Individual hunks of a proposed change can be accepted or rejected separately.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5378; apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:90; apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:142; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2118

## S73.15 Apply patch.
- Should: A suggested code block can be applied to the file as a reviewable patch and accepted.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1324; apps/extension-vscode/src/providers/diffDecorationProvider.ts:335

## S73.16 Terminal integration.
- Should: The extension works with the integrated terminal: run/suggest/explain commands and continue a session in a terminal.
- Status: vscode done
- Code: apps/extension-vscode/src/providers/terminalProvider.ts:312; apps/extension-vscode/src/providers/terminalProvider.ts:110; apps/extension-vscode/src/core/commandSetup.ts:424

## S73.17 Command-palette actions.
- Should: Extension actions are available from the Command Palette.
- Status: vscode done
- Code: apps/extension-vscode/package.json:80; apps/extension-vscode/src/core/commandSetup.ts:950

## S73.18 Keyboard bindings.
- Should: Key actions have default keyboard shortcuts.
- Status: vscode done
- Code: apps/extension-vscode/package.json:1139; apps/extension-vscode/src/core/commandSetup.ts:965

## S73.19 Status-bar indicators.
- Should: A status-bar item shows the current model and agent mode and opens the model picker.
- Status: vscode done
- Code: apps/extension-vscode/src/extension.ts:221; apps/extension-vscode/src/core/statusBar.ts:3

## S73.20 Model and permission controls.
- Should: The user can pick the model and the agent permission mode (and effort) from the extension.
- Status: vscode done
- Code: apps/extension-vscode/src/core/commandSetup.ts:1097; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1037; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2667

## S73.21 Task and approval notifications.
- Should: Pending approvals and finished tasks are signalled even when the chat view is hidden, and approvals can be answered.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:138; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:973

## S73.22 Project instructions.
- Should: Project instruction files (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md) apply to turns in the session folder and can be viewed from the extension.
- Status: vscode done
- Code: apps/extension-vscode/src/data/projectInstructions.ts:14; apps/extension-vscode/src/features/trees/contextPanelProvider.ts:138

## S73.23 MCP/Skill/Plugin settings.
- Should: The user can view and manage MCP servers, skills and plugins from the extension.
- Status: vscode done
- Code: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:551; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:580; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:293

## S73.24 Shared session with CLI/desktop.
- Should: A session can move between VS Code and the terminal CLI (continue a CLI session here; continue this chat in the terminal).
- Status: vscode done
- Code: apps/extension-vscode/src/core/commandSetup.ts:1235; apps/extension-vscode/src/core/commandSetup.ts:447

## S73.25 Remote workspace support.
- Should: The extension works in Remote-SSH/tunnel workspaces by running on the remote host.
- Status: vscode done
- Code: apps/extension-vscode/package.json:19; apps/extension-vscode/src/platform/remoteEnvironment.ts:16; apps/extension-vscode/src/extension.ts:92; apps/extension-vscode/src/core/commandSetup.ts:779

## S73.26 Container/WSL support where offered.
- Should: The extension works in dev containers and WSL windows.
- Status: vscode done
- Code: apps/extension-vscode/package.json:19; apps/extension-vscode/src/platform/remoteEnvironment.ts:16; apps/extension-vscode/src/core/commandSetup.ts:779

## S73.27 Workspace-trust experience.
- Should: In an untrusted workspace the extension limits risky features, explains why, and links to Manage Trust.
- Status: vscode done
- Code: apps/extension-vscode/package.json:55; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2715; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:744

## S73.28 Webview error and loading states.
- Should: The chat webview shows loading, setup-needed and error states with a retry.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2327; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:749

## S73.29 Extension update flow.
- Should: The extension tells users when an update is needed or available and what changed, and lets them update.
- Status: vscode done
- Code: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:132; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1047; apps/extension-vscode/src/core/hostNotices.ts:8

## S73.30 IDE-version compatibility messaging.
- Should: Users on an unsupported VS Code version (or a fork without needed APIs) are told what is incompatible.
- Status: vscode done
- Code: apps/extension-vscode/src/core/hostNotices.ts:27; apps/extension-vscode/src/extension.ts:310
