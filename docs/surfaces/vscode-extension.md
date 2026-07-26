# VS Code extension surface

> **Path:** `apps/extension-vscode/` · **Stack:** VS Code Extension API + TypeScript · **Owner:** extension lead · **Status:** v0.3.0; Marketplace publication not proven in-repo · **Updated:** 2026-07-25.

## Mission

AGI's IDE-native, workspace-scoped developer surface. `@agi`, the activity-bar sidebar, and the editor chat panel use the local `agi app-server`; they never synchronize consumer Web/Mobile/Desktop chat history.

## Runtime and trust

- `LocalRuntimePool` launches one lazy `agi app-server` per workspace root.
- The app-server owns threads, turns, streaming, approvals, cancellation, provider credentials, local-model discovery, and session history.
- Local, BYOK, and Managed Cloud remain separate trust boundaries. Provider-boundary changes start a new thread and do not forward the prior transcript.
- The sidebar always shows the Local host plus the resolved provider or “Auto routing.”
- Workspace Trust gates developer sessions and all privileged write/execute paths.
- The Desktop bridge is optional and defaults off; it is not required for local chat.
- IDE sessions do not enter Neon/app-chat sync. Any Desktop handoff is explicit and redacted.

## Shipped surfaces

- `@agi` participant with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, and `/model`.
- Sidebar and chat-in-editor webviews with sanitized Markdown, code-copy controls, model/mode/effort chips, attachments, usage state, and cancellation.
- Catalog-driven model picker plus app-server-discovered Ollama/LM Studio rows.
- Tier-aware Auto/manual model locking, including forged-message rejection.
- Context Files, History, and Memory trees.
- Bounded, untrusted editor/workspace/memory context.
- Editor Apply routed through native diff review, with accept/reject and patch provenance.
- Inline completions (explicit opt-in), CodeLens, hover, diagnostics, terminal helpers, checkpoints, and optional Desktop bridge.

## Manifest facts

Read counts from `package.json`; as of this update it contributes:

- 67 commands.
- 24 configuration properties.
- 14 keybindings.
- 1 activity-bar container with 4 views.

Important defaults:

| Setting                                  | Default | Meaning                                                          |
| ---------------------------------------- | ------- | ---------------------------------------------------------------- |
| `agiWorkforce.cliPath`                   | `agi`   | CLI binary used to start the workspace app-server.               |
| `agiWorkforce.model`                     | `auto`  | Task- and tier-aware runtime routing alias.                      |
| `agiWorkforce.inlineCompletions.enabled` | `false` | Cloud completion context requires explicit opt-in.               |
| `agiWorkforce.mcp.enabled`               | `false` | MCP integration is opt-in.                                       |
| `agiWorkforce.desktopBridge.enabled`     | `false` | Desktop bridge is optional.                                      |
| `agiWorkforce.useProviderStream`         | `false` | Account-authenticated cloud transport for editor utilities only. |
| `agiWorkforce.telemetryEnabled`          | `false` | Extension telemetry opt-in.                                      |

The extension access-mode override preserves every canonical plan value: `local`, `byok`, `free`, `basic`, `pro`, `team`, `max`, `max_15x`, and `enterprise`. Concrete model IDs come from `packages/contracts/types/src/models.json`.

## File layout

```text
apps/extension-vscode/
├── package.json
├── src/
│   ├── extension.ts
│   ├── core/
│   ├── features/
│   │   ├── account-auth/
│   │   ├── chat-participant/
│   │   ├── desktop-bridge/
│   │   ├── inline-completions/
│   │   ├── model-picker/
│   │   ├── sidebar-webview/
│   │   └── trees/
│   ├── integrations/
│   │   ├── localRuntimeClient.ts
│   │   ├── patchEngine.ts
│   │   ├── providerStreamClient.ts
│   │   └── tierResolver.ts
│   ├── memory/
│   ├── platform/
│   ├── protocol/
│   ├── providers/
│   └── __tests__/
├── scripts/
└── README.md
```

## Build and verification

```bash
pnpm --filter agi-workforce typecheck
pnpm --filter agi-workforce lint
pnpm --filter agi-workforce test
pnpm --filter agi-workforce test:webview
pnpm --filter agi-workforce test:integration
pnpm --filter agi-workforce check:vscode-theme-tokens
pnpm --filter agi-workforce build
pnpm --filter agi-workforce package
```

The integration suite runs in a real VS Code Extension Host and verifies activation, extension identity/version, manifest-command registration, and New Conversation dispatch. Deeper live model turns require a current `agi` binary plus configured local/BYOK provider access.

## Distribution

The repository can build a versioned `.vsix` through the package script. A live VS Code Marketplace or Open VSX listing is not proven by repository files; publishing still requires the external publisher credentials and release action. Do not claim either listing until independently verified.
