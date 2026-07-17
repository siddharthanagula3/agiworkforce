# AGI for VS Code

Status: Current

Owner role: Extension lead

Last updated: 2026-07-14

Kind: app

Criticality: high

## Purpose

IDE-native access to AGI developer sessions. Chat is workspace scoped and runs through the local `agi app-server` process shared with the CLI protocol. It does not synchronize consumer Web, Mobile, or Desktop chat history.

## Developer-session architecture

- `@agi` chat participant, sidebar chat, and chat-editor panel use the same `LocalRuntimePool`.
- Each workspace root owns one lazy local app-server process.
- The app-server owns threads, turns, streamed output, approvals, cancellation, and session history.
- Multi-root windows keep runtimes isolated by workspace root.
- Changing `agiWorkforce.cliPath` disposes existing processes; the next request starts a process with the new path.
- MCP discovery runs in the local runtime. Loading and availability notifications are non-terminal.
- VS Code sessions stay local/workspace/task scoped unless a separate explicit handoff flow is invoked.

## Quick start

1. Install or build the extension.
2. Install the AGI CLI so `agi` is on `PATH`, or set `agiWorkforce.cliPath` to the binary.
3. Open a trusted workspace folder.
4. Open the AGI sidebar, run `AGI: Open Chat in Editor`, or use `@agi` in VS Code Chat.

No AGI Cloud sign-in or extension API key is required for the local developer-session transport. Provider credentials and routing are owned by the local runtime configuration. Inline completions and older cloud-backed utility commands have separate credential requirements.

## Current surfaces

- `@agi` chat participant with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, and `/model`.
- Sidebar and editor-panel chat over the local runtime.
- Runtime-owned developer-session history.
- Explicit approval prompts for privileged runtime actions.
- Editor selection and surrounding-code context wrapped as untrusted data.
- Editor context, model selection, diagnostics sharing, and diff proposals.
- Inline completions, CodeLens, hover, diagnostics, terminal helpers, memory UI, and Desktop bridge integrations.

## Configuration highlights

| Setting                                  | Default            | Purpose                                                                                    |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `agiWorkforce.cliPath`                   | `agi`              | Local CLI binary used to launch `app-server`.                                              |
| `agiWorkforce.model`                     | catalog default    | Model selection forwarded to the runtime when explicit.                                    |
| `agiWorkforce.inlineCompletions.enabled` | `true`             | Enables the separate inline-completion path.                                               |
| `agiWorkforce.mcp.enabled`               | configured default | Enables MCP-related extension integration. Runtime MCP discovery remains app-server owned. |
| `agiWorkforce.desktopBridge.enabled`     | configured default | Enables the explicit Desktop bridge.                                                       |
| `agiWorkforce.telemetryEnabled`          | `false`            | Extension telemetry opt-in, also subject to VS Code telemetry settings.                    |

## Verification

```bash
pnpm --filter agi-workforce typecheck
pnpm --filter agi-workforce test
pnpm --filter agi-workforce test:webview
pnpm --filter agi-workforce lint
pnpm --filter agi-workforce build
```

## Trust boundaries

- Workspace Trust gates privileged workspace behavior.
- Webview messages are runtime validated before dispatch.
- Local runtime processes are isolated by workspace root.
- Editor and file content is untrusted model input.
- The local runtime owns approval requests for destructive, external, privileged, or expensive actions.

## License

Proprietary. © 2026 AGI Workforce. See `LICENSE`.
