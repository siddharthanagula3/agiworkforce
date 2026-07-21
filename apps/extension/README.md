# Chrome Extension

Status: Current
Owner role: Extension lead
Last updated: 2026-07-15
Kind: app
Criticality: high

## Purpose

`apps/extension` owns the Chrome MV3 extension: Managed Cloud chat, browser-local conversations, browser context capture, approved-site page interaction, explicit native context handoff, and extension packaging.

## Consumers

- Chrome extension users.
- Desktop app through explicit, reviewed native context handoff and browser mechanics.
- Future browser-task and connector flows.

## Public API / Exports

This is an app, not a shared package. Other apps and packages must not import from `apps/extension`.

Reusable browser automation contracts belong in `packages/tools/browser-tool`, `packages/client/client-runtime`, or `packages/contracts/types`.

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
- `pnpm --filter @agiworkforce/extension test:e2e` — real-UI smoke: builds, loads
  the unpacked extension into Chromium (Playwright `--load-extension`), and asserts
  the side panel + options pages render without page exceptions or CSP violations.
- `pnpm --filter @agiworkforce/extension build`
- `pnpm lint:extension`

## Install / Load In Chrome

Run the extension locally without a Web Store listing:

1. Install workspace dependencies from the repo root: `pnpm install`.
2. Build the unpacked extension: `pnpm --filter @agiworkforce/extension build`.
   Output lands in `apps/extension/dist/` (a complete MV3 bundle: `manifest.json`,
   `src/background.js`, `src/content.js`, `src/side_panel.js`, `src/options.js`,
   plus `assets/` and `icons/`).
3. In Chrome (or any Chromium ≥ 132), open `chrome://extensions`, enable
   **Developer mode** (top-right), click **Load unpacked**, and select the
   `apps/extension/dist` folder.
4. Open the side panel with **Ctrl+Shift+A** (macOS **⌘+Shift+A**) or the AGI
   toolbar icon; **Ctrl+Shift+C** captures the current page. The options page is
   reachable from the extension's "Details → Extension options".

For a distributable/store build use `pnpm --filter @agiworkforce/extension package`
(see Release / Deployment Notes) — it produces a validated `extension.zip` and
requires the production environment values below.

## Environment / Secrets

Do not commit extension store credentials, private keys, local native-host registration state, browsing captures, cookies, tokens, or user page content.

The build reads the public values documented in `.env.example`:

- `CLERK_PUBLISHABLE_KEY` — the same Clerk instance used by Web.
- `CLERK_FRONTEND_API` — the exact Clerk Frontend API origin.
- `CLERK_SYNC_HOST` — the exact Clerk web-session Sync Host origin.
- `CHROME_EXTENSION_PUBLIC_KEY` — public CRX key material that keeps the
  extension ID stable across unpacked/store builds.

Production packages require a live Clerk key and all three origins/key values.
The package script fails closed when they are absent or malformed.

## Security, Privacy, Data Boundaries

Security/privacy review is required for permissions, content-script injection, page capture, native messaging, cross-origin requests, command execution, browser storage, and any flow that sends page data to Local/BYOK/Managed runtime.

The extension should clearly separate "ask before acting" and "act" capabilities. Chrome has no Local or BYOK chat mode and must never fall back from Managed Cloud inference to Desktop/native execution.

## Demo Boundary

Chrome is a secondary demo surface. Do not present autonomous browser actions as public-ready unless the demo explicitly shows the user-managed site allowlist, the Desktop pairing state, and the action approval path. Non-allowlisted pages are treated as untrusted even though the content script is installed broadly for MV3 discovery and context capture.

## Tests Required For Changes

- Source change: run typecheck, tests, and `pnpm lint:extension`.
- Manifest/permissions change: update `THREAT_MODEL.md` and manually verify browser install.
- Native host change: test install/uninstall paths for each supported OS.

## Release / Deployment Notes

Run `pnpm --filter @agiworkforce/extension package` only with the production
environment configured. The build injects the exact Clerk origins and stable
CRX public key into `dist/manifest.json`; `prepare-package.mjs` validates the
result before creating `extension.zip`.

Extension release also requires external evidence that Clerk Native API is
enabled and `chrome-extension://<stable-id>` is present in the production Clerk
instance's `allowed_origins`. A clean build alone does not prove either dashboard
setting. Manifest review, permission review, native-host installer verification,
and Chrome Web Store package checks remain required.

## Known Caveats

- Native host installer automation still needs completion, including Windows coverage.

## CODEOWNERS

Primary: Extension lead.
Secondary: Desktop lead for native bridge integration. Security/privacy for permissions, capture, page context, native messaging, and browser storage.
