# AGI for VS Code — Contributor Notes

Status: Current

Owner role: Extension lead

Last updated: 2026-08-05

Kind: app

Criticality: high

This file holds the engineering-facing content that used to live in
`README.md`. `README.md` ships byte-identical into the VSIX as the Marketplace
"Details" page, so it now carries only user-facing listing copy; `docs/**` is
excluded by `.vscodeignore` and never reaches the published extension.

Read `AGENTS.md` in this package for the lane contract and high-risk areas.

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

## Activation contract

`activate()` in `src/extension.ts` must never lose the sidebar chat view.
`setupProviders` and `setupChat` are individually guarded: a throw is recorded
in subsystem health, surfaced with `showErrorMessage`, and — for the provider
step — replaced with `createDegradedProviderState` so chat and commands still
register. An unregistered `agi-workforce.sidebar` webview view renders VS
Code's empty "no data provider registered" placeholder, which users read as
"the panel will not open". `src/__tests__/activationResilience.test.ts` locks
this in.

The view container is contributed to `contributes.viewsContainers.activitybar`.
It must stay there: the Secondary Side Bar is collapsed by default and
contributes no persistent icon, so a container placed there is undiscoverable
on a fresh install. `src/__tests__/viewContainerContribution.test.ts` locks this
in.

## Quick start

1. Install or build the extension.
2. Install the AGI CLI so `agi` is on `PATH`, or set `agiWorkforce.cliPath` to the binary.
3. Open a trusted workspace folder.
4. Open the AGI sidebar, run `AGI: Open Chat in Editor`, or use `@agi` in VS Code Chat.

No AGI Cloud sign-in or extension API key is required for the local developer-session transport. Provider credentials and routing are owned by the local runtime configuration. Inline completions and older cloud-backed utility commands have separate credential requirements.

## Cloud account and Web handoffs

`AGI Workforce: Sign In to AGI Cloud` uses the shared browser-approved device
flow and stores its revocable developer credential in VS Code `SecretStorage`.
The Account & Usage command reads `/api/usage`, applies both plan and
subscription status before caching an effective tier, and exposes explicit Web
links for usage, billing recovery, Cloud connectors, and Team or Enterprise
administration.

Cloud connector setup remains a Web Managed Cloud capability. It does not
replace the workspace's local MCP configuration, and signing in never silently
moves a local developer session across a trust boundary.

## Current surfaces

- `@agi` chat participant with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, and `/model`.
- Sidebar and editor-panel chat over the local runtime.
- Runtime-owned developer-session history.
- Explicit approval prompts for privileged runtime actions.
- Editor selection and surrounding-code context wrapped as untrusted data.
- Editor context, catalog-driven model selection, diagnostics sharing, and reviewable diff proposals.
- The editor-panel Apply action opens the proposed change in VS Code's native diff view.
- Workspace-file attachments are validated against traversal, symlinks, folders, and sensitive filenames.
- User-curated memory is bounded and injected as untrusted context for future turns.
- Visible Local host and resolved provider/Auto-routing labels, including in narrow sidebars.
- Inline completions, CodeLens, hover, diagnostics, terminal helpers, memory UI, and an optional authenticated Desktop availability bridge.

## Configuration highlights

| Setting                                  | Default | Purpose                                                                                     |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `agiWorkforce.cliPath`                   | `agi`   | Local CLI binary used to launch `app-server`.                                               |
| `agiWorkforce.model`                     | `auto`  | Routes each turn using the task and the models available to the resolved plan.              |
| `agiWorkforce.inlineCompletions.enabled` | `false` | Explicit opt-in for sending surrounding code to the cloud completion utility.               |
| `agiWorkforce.mcp.enabled`               | `false` | Enables MCP-related extension integration. Runtime MCP discovery remains app-server owned.  |
| `agiWorkforce.desktopBridge.enabled`     | `false` | Shows authenticated Desktop availability; IDE sessions and actions remain app-server owned. |
| `agiWorkforce.useProviderStream`         | `false` | Opt-in account-authenticated transport for cloud-backed editor utilities only.              |
| `agiWorkforce.telemetryEnabled`          | `false` | Extension telemetry opt-in, also subject to VS Code telemetry settings.                     |

The user-facing settings table lives in `README.md`. Keep both truthful against
`contributes.configuration` when a key is added, renamed, or re-defaulted.

## Verification

```bash
pnpm --filter agi-workforce typecheck
pnpm --filter agi-workforce test
pnpm --filter agi-workforce test:webview
pnpm --filter agi-workforce test:integration
pnpm --filter agi-workforce lint
pnpm --filter agi-workforce check:vscode-theme-tokens
pnpm --filter agi-workforce build
```

## Trust boundaries

- Workspace Trust gates privileged workspace behavior.
- Webview messages are runtime validated before dispatch.
- Local runtime processes are isolated by workspace root.
- Editor and file content is untrusted model input.
- Switching a live session across a provider boundary starts a new runtime thread; the earlier transcript is not forwarded and a visible session notice explains the reset.
- The local runtime owns approval requests for destructive, external, privileged, or expensive actions.

## License

Proprietary. © 2026 AGI Workforce. See `LICENSE`.
