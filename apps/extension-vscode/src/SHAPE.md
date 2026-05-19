# VS Code Extension — Target Source Shape

Phase 6 structural reorg. Zero behavior change. Pure moves + barrels.

## Directory map

| Directory                    | Purpose                                                             | Source files moving in                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core/                        | Extension activation, command registry, telemetry init              | extension.ts (activation), lifecycle/\*, registry/commands.ts, services/telemetry.ts, services/subsystemHealth.ts                                                                                                         |
| features/chat-participant/   | @agi chat participant + /explain /fix /refactor /tests /docs /model | providers/chatParticipant.ts                                                                                                                                                                                              |
| features/inline-completions/ | InlineCompletionItemProvider                                        | providers/inlineCompletionProvider.ts                                                                                                                                                                                     |
| features/code-lens/          | CodeLensProvider                                                    | providers/codeLensProvider.ts                                                                                                                                                                                             |
| features/hover/              | HoverProvider                                                       | providers/hoverProvider.ts                                                                                                                                                                                                |
| features/sidebar-webview/    | Sidebar webview panel + state                                       | providers/sidebarProvider.ts, providers/sidebar/\*                                                                                                                                                                        |
| features/trees/              | History tree + Context Files tree                                   | providers/conversationTreeProvider.ts, providers/contextPanelProvider.ts                                                                                                                                                  |
| features/model-picker/       | Model picker UI + state                                             | services/modelConstants.ts, services/modelMetrics.ts                                                                                                                                                                      |
| features/desktop-bridge/     | Port 8787 bridge to desktop app                                     | services/desktopBridge.ts                                                                                                                                                                                                 |
| platform/                    | VS Code API abstractions (workspace, window, env)                   | utils/workspaceFolders.ts, utils/config.ts, utils/version.ts                                                                                                                                                              |
| integrations/                | Provider routing, stream client, patch engine                       | services/providerStreamClient.ts, services/patchEngine.ts, services/providerSwitchGuard.ts, services/tierResolver.ts                                                                                                      |
| data/                        | Storage + settings adapters                                         | storage/conversationStore.ts, services/checkpointManager.ts, services/contextBudget.ts, services/contextBuilder.ts, services/sendQueue.ts, services/usageMeter.ts, services/tokenCounter.ts, services/workspaceIndexer.ts |
| ui/                          | Shared webview components                                           | providers/chatEditorPanel.ts, providers/agentMode/\*, providers/sidebar/webviewContent.ts                                                                                                                                 |

## Migration status

- [ ] core/
- [ ] features/chat-participant/
- [ ] features/inline-completions/
- [ ] features/code-lens/
- [x] features/hover/ ← PILOT (move complete)
- [ ] features/sidebar-webview/
- [ ] features/trees/
- [ ] features/model-picker/
- [ ] features/desktop-bridge/
- [ ] platform/
- [ ] integrations/
- [ ] data/
- [ ] ui/
