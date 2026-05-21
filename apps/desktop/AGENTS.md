# Desktop Agent Rules

Status: Current
Owner: Desktop lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/desktop/README.md`.

## Scope

`apps/desktop` owns the local-first desktop app, Tauri bridge, local files, MCP/connectors, artifacts, generated files, computer-use host behavior, and Desktop as future local compute host.

## High-Risk Areas

- Local file access, filesystem writes, shell/process execution, MCP credentials, browser/computer use, native messaging, sandbox policy, generated files, update/signing, and Local/BYOK/Managed handoffs.
- Frontend changes can affect Desktop and the embedded Web chat build path. Check both when touching shared shell/chat behavior.
- Do not move reusable runtime contracts into Desktop-only code.

## Verification

- Frontend: `pnpm --filter @agiworkforce/desktop typecheck`
- Frontend behavior: `pnpm --filter @agiworkforce/desktop test`
- Tauri/Rust: `cargo check -p agiworkforce-desktop`
- Packaging/release: run the relevant build or document why it was not run.
