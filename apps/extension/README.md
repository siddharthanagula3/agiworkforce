# Chrome Extension

Status: Current
Owner role: Extension lead
Last updated: 2026-05-20
Kind: app
Criticality: high

## Purpose

`apps/extension` owns the Chrome MV3 extension: browser context capture, side panel UI, page interaction, native messaging bridge, and extension packaging.

## Consumers

- Chrome extension users.
- Desktop app through the native messaging bridge.
- Future browser-task and connector flows.

## Public API / Exports

This is an app, not a shared package. Other apps and packages must not import from `apps/extension`.

Reusable browser automation contracts belong in `packages/browser-tool`, `packages/runtime`, or `packages/types`.

## What Belongs Here

- MV3 manifest and extension entrypoints.
- Side panel, content script, background service worker, popup/options if present.
- Native host installer/bridge scripts owned by the extension surface.
- Extension-specific tests, threat model, icons, and packaging config.

## What Does Not Belong Here

- Desktop native code except bridge/install integration.
- Shared tool protocols or provider adapters.
- User browsing data, generated captures, or packaged `dist` outputs.

## Key Files

- `manifest.json` - Chrome extension manifest.
- `src/` - extension source code.
- `native-host/` - native messaging host integration.
- `THREAT_MODEL.md` - browser permission and trust analysis.
- `vite.config.ts` - extension build.

## Commands

- `pnpm --filter @agiworkforce/extension typecheck`
- `pnpm --filter @agiworkforce/extension test`
- `pnpm --filter @agiworkforce/extension build`
- `pnpm lint:extension`

## Environment / Secrets

Do not commit extension store credentials, private keys, local native-host registration state, browsing captures, cookies, tokens, or user page content.

## Security, Privacy, Data Boundaries

Security/privacy review is required for permissions, content-script injection, page capture, native messaging, cross-origin requests, command execution, browser storage, and any flow that sends page data to Local/BYOK/Managed runtime.

The extension should clearly separate "ask before acting" and "act" capabilities.

## Tests Required For Changes

- Source change: run typecheck, tests, and `pnpm lint:extension`.
- Manifest/permissions change: update `THREAT_MODEL.md` and manually verify browser install.
- Native host change: test install/uninstall paths for each supported OS.

## Release / Deployment Notes

Extension release requires a clean `dist`, manifest review, permission review, native-host installer verification, and store packaging checks.

## Known Caveats

- Native host installer automation still needs completion, including Windows coverage.

## CODEOWNERS

Primary: Extension lead.
Secondary: Desktop lead for native bridge integration. Security/privacy for permissions, capture, page context, native messaging, and browser storage.
