# Desktop App

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-20
Kind: app
Criticality: high

## Purpose

`apps/desktop` owns the local-first desktop application: rich chat, artifacts, local files, MCP/connectors, generated files, computer-use host behavior, and the Tauri bridge to local Rust capabilities.

## Consumers

- Desktop users on macOS, Windows, and Linux.
- Mobile and future remote-control flows that delegate heavy local compute to Desktop.
- Web build flow when the desktop Vite app is embedded under the web `/chat/` route.

## Public API / Exports

This is an app, not a package. Other apps and packages must not import from `apps/desktop`.

Reusable contracts belong in `packages/contracts/types`, `packages/client/client-runtime`, `packages/tools/mcp`, `packages/ui/unified-chat`, or Rust crates. Tauri commands are the boundary between frontend and `src-tauri`.

## What Belongs Here

- Tauri desktop shell and local-first UX.
- Desktop-only React UI and Desktop v3 shell behavior.
- Local file, artifact, MCP, generated-file, and desktop bridge UI.
- `src-tauri` Rust backend commands specific to the desktop app.
- Desktop WebdriverIO/Playwright/Vitest tests and release packaging config.

## What Does Not Belong Here

- Shared provider adapters or schemas.
- Web account/billing implementation.
- CLI TUI/REPL implementation.
- Generated reports, screenshots outside approved evidence folders, or local `.env` files.

## Key Files

- `src/` - desktop React frontend.
- `src-tauri/` - Tauri Rust backend.
- `wdio/` and `wdio.conf.ts` - primary e2e runner (`pnpm test:e2e`); drives the real Tauri app via an embedded WebDriver, so it's the only harness that exercises native IPC/Rust commands, not just the DOM.
- `e2e/` and `playwright.config.ts` - DOM-only e2e harness (`pnpm test:e2e:dom`); drives the Vite dev URL in a plain browser, so it cannot see or exercise Tauri IPC/Rust commands. Useful for pure-DOM assertions; not a substitute for `test:e2e` on anything that crosses the Tauri bridge.
- `vite.config.ts` - desktop/web build behavior.
- `mcp-servers-config.example.json` - local MCP config example.

## Commands

- `pnpm dev:desktop`
- `pnpm --filter @agiworkforce/desktop typecheck`
- `pnpm --filter @agiworkforce/desktop test`
- `pnpm --filter @agiworkforce/desktop test:e2e`
- `pnpm build:desktop`
- `cargo check -p agiworkforce-desktop`

## Environment / Secrets

Use `.env.example` templates only. Never commit `.env.local`, production signing credentials, provider API keys, MCP OAuth tokens, local file indexes, or user data.

## Security, Privacy, Data Boundaries

Security/privacy review is required for local file access, filesystem writes, generated files, MCP/connectors, shell/process execution, computer use, sandbox policy, native messaging, update/signing, and Local/BYOK/Managed handoffs.

Local mode must keep user files and generated files local unless an explicit preview and approval flow transfers data to BYOK or Managed compute.

## Tests Required For Changes

- Frontend change: run desktop typecheck and targeted Vitest tests.
- Tauri/Rust command change: run relevant Cargo check/test and verify IPC schema.
- Local files/MCP/sandbox/generated files: add privacy-boundary tests or documented manual verification.
- Release packaging change: run the relevant platform build or packaging dry run.

## Release / Deployment Notes

Desktop release requires platform packaging, signing/notarization where applicable, updater metadata, and verification that local data paths and generated-file locations are stable.

## Known Caveats

- Desktop is one of the largest surfaces; product UI domains now live under `src/features`, while `src/components` is reserved for shared UI primitives.
- Web build reuse through `/chat/` means some UI changes can affect both Desktop and Web.

## CODEOWNERS

Primary: Desktop lead.
Secondary: Rust platform for `src-tauri`. Security/privacy for files, MCP, sandbox, computer use, generated files, signing, and updater behavior.
