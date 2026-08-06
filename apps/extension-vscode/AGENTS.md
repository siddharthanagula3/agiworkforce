# VS Code Extension Agent Rules

Status: Current
Owner: Extension lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `docs/CONTRIBUTING-NOTES.md`.

`README.md` in this package is the VS Code Marketplace "Details" page — it
ships byte-identical inside the VSIX. Keep engineering detail out of it and in
`docs/CONTRIBUTING-NOTES.md`, which `.vscodeignore` excludes from the package.

## Scope

`apps/extension-vscode` owns the IDE-native developer surface and workspace-scoped agent UI.

## Lane Contract

- Primary lane: `vscode-extension`.
- Owned write path: `apps/extension-vscode/**`.
- Read-only context: CLI behavior and shared developer-session contracts.
- CLI protocol changes and `packages/contracts/types/**` edits require the CLI or contracts lane.

## High-Risk Areas

- Workspace trust, local file edits, terminal/process execution, CLI bridge/protocol behavior, provider keys, and developer-session handoff.
- VS Code sessions stay workspace/task scoped. Do not silently sync IDE context into Web/Mobile/Desktop app chat history.
- Shared developer-session schemas belong in `packages/contracts/types` or Rust crates, not extension-only files.

## Verification

- Small change: `pnpm --filter agi-workforce typecheck`
- Behavior change: `pnpm --filter agi-workforce test`
- Build/package change: `pnpm --filter agi-workforce build`
