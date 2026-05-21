# VS Code Extension Agent Rules

Status: Current
Owner: Extension lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then the extension package README if present.

## Scope

`apps/extension-vscode` owns the IDE-native developer surface and workspace-scoped agent UI.

## High-Risk Areas

- Workspace trust, local file edits, terminal/process execution, CLI bridge/protocol behavior, provider keys, and developer-session handoff.
- VS Code sessions stay workspace/task scoped. Do not silently sync IDE context into Web/Mobile/Desktop app chat history.
- Shared developer-session schemas belong in `packages/types` or Rust crates, not extension-only files.

## Verification

- Small change: `pnpm --filter agi-workforce typecheck`
- Behavior change: `pnpm --filter agi-workforce test`
- Build/package change: `pnpm --filter agi-workforce build`
