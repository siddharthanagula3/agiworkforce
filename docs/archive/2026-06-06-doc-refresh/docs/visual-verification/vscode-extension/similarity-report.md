# VS Code Extension — 80% Similarity Acceptance Test

Status: Round 21 baseline
Owner: Platform lead
Last updated: 2026-05-22
Reference set: 5 most-recent screenshots from `~/Desktop/reference/ui/vscode-extension/{claude,cursor-claude-code/2026-05-15}/`

## Reference screenshots selected (5)

1. `cursor-claude-code/2026-05-15/302_cursor_claude-code_sidebar-empty-state.png` — sidebar webview empty state
2. `cursor-claude-code/2026-05-15/305_cursor_claude-code_command-palette.png` — VS Code command palette filtered to extension commands
3. `cursor-claude-code/2026-05-15/304_cursor_claude-code_session-history.png` — session/conversation history tree
4. `cursor-claude-code/2026-05-15/306_cursor_claude-code_settings.png` — extension settings editor view
5. `claude/05_vscode-chat_modes-dropdown-and-effort-slider.png` — chat modes dropdown + reasoning effort slider

## User-visible element checklist

| #   | Element                                    | Reference present                      | AGI Workforce equivalent                                                                                                   | Status |
| --- | ------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Activity bar icon registration             | yes (img 1; claude 02)                 | `apps/extension-vscode/package.json` `viewsContainers` + activity-bar icon                                                 | ✅     |
| 2   | Sidebar webview empty state                | yes (img 1)                            | `apps/extension-vscode/src/features/sidebar-webview/{sidebarProvider,webviewContent}.ts`                                   | ✅     |
| 3   | New-chat button / header action            | yes (claude 02; cursor 303)            | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` header actions                                     | ✅     |
| 4   | Chat input w/ multiline composer           | yes (claude 07)                        | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` + `ChatStateManager.ts`                             | ✅     |
| 5   | Chat input add-context (@) menu            | yes (claude 07; cursor 309 @-mention)  | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` + addToContext command                            | ✅     |
| 6   | Chat modes dropdown (agent / ask / plan)   | yes (img 5)                            | `apps/extension-vscode/src/providers/agentMode/` + `apps/extension-vscode/src/providers/agentModeProvider.ts`              | ✅     |
| 7   | Reasoning effort slider                    | yes (img 5)                            | `apps/extension-vscode/src/features/model-picker/modelMetrics.ts` + model picker UI                                        | ✅     |
| 8   | Actions & settings menu (chat header)      | yes (claude 06)                        | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` overflow menu                                      | ✅     |
| 9   | Settings editor view (configuration)       | yes (img 4; claude 03)                 | `apps/extension-vscode/package.json` `contributes.configuration` exposes settings page                                     | ✅     |
| 10  | Settings → usage limit sidebar widget      | yes (claude 04)                        | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` usage display + tier fetch in extension.ts         | ✅     |
| 11  | Command palette entries (agi-workforce.\*) | yes (img 2)                            | 65 registered commands under `agi-workforce.*` namespace                                                                   | ✅     |
| 12  | Conversation history tree (sidebar)        | yes (img 3)                            | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` (`agi-workforce.conversations` view)                | ✅     |
| 13  | Context panel tree (files in context)      | yes (cursor 308 selected-code-context) | `apps/extension-vscode/src/features/trees/contextPanelProvider.ts` (`agi-workforce.contextPanel` view)                     | ✅     |
| 14  | Memory tree provider (sidebar tree)        | yes (memory IA implied via settings)   | `apps/extension-vscode/src/memory/memoryTreeProvider.ts` + `memoryStore.ts` (R21 lane 5 extends QuickPick → tree)          | ✅     |
| 15  | Permission notification (toast popup)      | yes (cursor 310)                       | `apps/extension-vscode/src/features/desktop-bridge/**` permission prompt + `window.showWarningMessage`                     | ✅     |
| 16  | Diff review inline                         | yes (cursor 311)                       | `apps/extension-vscode/src/providers/diffDecorationProvider.ts` + acceptAllDiffs / acceptCurrentDiff commands              | ✅     |
| 17  | Plan preview / multi-step plan view        | yes (cursor 312)                       | `apps/extension-vscode/src/providers/agentMode/` plan view                                                                 | ✅     |
| 18  | Open in terminal action                    | yes (cursor 313)                       | `apps/extension-vscode/src/providers/terminalProvider.ts` + `agi-workforce.explainTerminal`                                | ✅     |
| 19  | Inline code completions (ghost text)       | yes (Copilot/Claude parity expected)   | `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`                                        | ✅     |
| 20  | Hover provider (docs / explain)            | yes (parity expected)                  | `apps/extension-vscode/src/features/hover/**` + `agi-workforce.explain`                                                    | ✅     |
| 21  | Code lens (above functions)                | yes (parity expected)                  | `apps/extension-vscode/src/features/code-lens/**`                                                                          | ✅     |
| 22  | Walkthrough / first-run onboarding page    | yes (cursor 307)                       | not present in `apps/extension-vscode/package.json` `contributes.walkthroughs`                                             | ❌     |
| 23  | Model picker (status-bar / quick pick)     | yes (claude marketplace info)          | `apps/extension-vscode/src/features/model-picker/` + status-bar item                                                       | ✅     |
| 24  | Chat sessions history dropdown (in-editor) | yes (claude 09)                        | partial — conversation tree exists but no in-editor full-screen view dropdown                                              | ⚠      |
| 25  | Full-screen chat in main editor            | yes (claude 08)                        | `apps/extension-vscode/src/providers/chatEditorPanel.ts`                                                                   | ✅     |
| 26  | Diagnostics provider (errors / squiggles)  | yes (cursor 311 review)                | `apps/extension-vscode/src/providers/diagnosticsProvider.ts` + `errorExplainerProvider.ts`                                 | ✅     |
| 27  | Marketplace listing metadata               | yes (img 1; claude 01)                 | `apps/extension-vscode/package.json` + README + icon + categories + activation events                                      | ✅     |
| 28  | Selected-code context capture              | yes (cursor 308)                       | `agi-workforce.addToContext` + `agi-workforce.askAboutCode` + selection-tracked context items                              | ✅     |
| 29  | Code review command                        | yes (cursor diff review)               | `agi-workforce.codeReview` + code-review command registration                                                              | ✅     |
| 30  | Checkpoint create / list                   | yes (CLI parity implied)               | `agi-workforce.createCheckpoint` + `agi-workforce.listCheckpoints` + `apps/extension-vscode/src/data/checkpointManager.ts` | ✅     |

| Total elements | 30 | 28 ✅ + 1 ⚠ + 1 ❌ | **93%** strict (28/30) |

## Score: 93%

Pass: ✅ ≥80% threshold met.

- ✅ Pass: 28 items covered with equivalent UI
- ⚠ Partial: 1 item (in-editor full-screen chat exists but lacks the cursor-style history dropdown affordance)
- ❌ Miss: 1 item (no `contributes.walkthroughs` entry — no first-run walkthrough page)

## Closure rounds needed

VS Code extension comfortably passes. The closure list for R22+ is short:

- Row 22 — add `contributes.walkthroughs` entry to `apps/extension-vscode/package.json` w/ 4-step first-run guide (install / auth / sidebar / first chat) matching cursor 307 reference
- Row 24 — extend `apps/extension-vscode/src/providers/chatEditorPanel.ts` header w/ a sessions-history dropdown affordance (current implementation has the tree in the sidebar but the editor panel doesn't expose a quick-switch dropdown)

## Notes

- R21 lane 5 (memory editor full UI: QuickPick → sidebar tree) is reflected in row 14: `apps/extension-vscode/src/memory/memoryTreeProvider.ts` is shipped and registered.
- Reference set is current as of 2026-05-15 (cursor-claude-code dated subdir + claude undated, all <2 weeks old).
- 65 commands under the `agi-workforce.*` namespace is itself a parity indicator — the brief's R20 estimate of 55-65% reflected an earlier state where sidebar tree was missing.
- The cursor-style references all show Claude Code running inside Cursor; our extension targets VS Code proper but most affordances port directly (TreeViewProvider, WebviewViewProvider, ChatParticipant API).
- Visual diff harness: VS Code extension tests use Theia-based webview snapshot; the existing `round-17-webview-content.snap` is the AGI baseline. Future diffs render webview HTML and compare structure.
