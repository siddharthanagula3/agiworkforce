# Phase 6 VS Code Extension — Baseline Gate Results

Branch: claude/phase6-vscode-2026-05-18
Date: 2026-05-18
Engineer: VS Code Extension Engineer

## Baseline gates

### pnpm build (produces .vsix-ready bundle)

PASS — out/extension.js 683.8kb (105ms)

### typecheck

PASS — tsc --noEmit, zero errors

## Source inventory (30 source files, 27 test files)

### Current layout

```
src/
├── extension.ts               # entry point — activation, deactivation
├── lifecycle/                 # 5 files — advancedFeatures, chatSetup, commandSetup, providerSetup, runInlineCommand
├── providers/                 # 15 files across flat + 2 nested subdirs
│   ├── agentMode/             # agentLoop, agentUI
│   ├── sidebar/               # ChatStateManager, webviewContent
│   ├── agentModeProvider.ts
│   ├── chatEditorPanel.ts
│   ├── chatParticipant.ts
│   ├── codeActionProvider.ts
│   ├── codeLensProvider.ts
│   ├── contextPanelProvider.ts
│   ├── conversationTreeProvider.ts
│   ├── diagnosticsProvider.ts
│   ├── diffDecorationProvider.ts
│   ├── errorExplainerProvider.ts
│   ├── hoverProvider.ts
│   ├── inlineCompletionProvider.ts
│   ├── sidebarProvider.ts
│   └── terminalProvider.ts
├── registry/                  # 1 file — commands.ts
├── services/                  # 14 files — checkpointManager, contextBudget, contextBuilder,
│   │                          #   desktopBridge, modelConstants, modelMetrics, patchEngine,
│   │                          #   providerStreamClient, providerSwitchGuard, sendQueue,
│   │                          #   subsystemHealth, telemetry, tierResolver, tokenCounter,
│   │                          #   usageMeter, workspaceIndexer
├── storage/                   # 1 file — conversationStore.ts
└── utils/                     # 5 files — api, applyEdit, config, version, workspaceFolders
```

## package.json contributes contract (SACRED — must not change)

- Commands: 54+ with prefix "agi-workforce."
- Chat participant: @agi with /explain /fix /refactor /tests /docs /model
- Keybindings: 13+
- Settings: 17+ under "agiWorkforce.\*"
- Entry point: ./out/extension.js (esbuild bundles src/extension.ts)

## Target layout (Phase 6)

```
src/
├── core/                      # activation, command registry, telemetry init
├── features/
│   ├── chat-participant/      # @agi participant + /commands
│   ├── inline-completions/
│   ├── code-lens/
│   ├── hover/
│   ├── sidebar-webview/
│   ├── trees/
│   ├── model-picker/
│   └── desktop-bridge/        # port 8787 bridge
├── platform/                  # vscode-api abstractions
├── integrations/              # desktop bridge protocol, provider routing
├── data/                      # storage, settings adapters
└── ui/                        # shared webview components
```

## Step plan

1. [x] Bootstrap — worktree created, deps installed, baseline gates green
2. [x] Inventory — complete (see above)
3. [ ] Skeleton — create directory tree with placeholder barrels
4. [ ] Pilot move — hover feature (smallest, zero external deps besides vscode)
5. [ ] Verify — build + typecheck post-pilot
6. [ ] Report
