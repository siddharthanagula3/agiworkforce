# Chrome Extension Agent Rules

Status: Current
Owner: Extension lead
Last updated: 2026-08-12

Read root `AGENTS.md`, then this file.

## Scope

`apps/extension` owns the Chrome MV3 extension, browser context capture, side panel, content scripts, background worker, packaging, and native messaging bridge.

## Lane Contract

- Primary lane: `chrome-extension`.
- Owned write path: `apps/extension/**`.
- Read-only context: `packages/tools/browser-tool/**` and Desktop native-messaging code.
- Browser tool packages, Desktop native host code, shared contracts, and manifest permission policy outside this app require their owner lane or security review.

## High-Risk Areas

- Extension permissions, content-script injection, page capture, browser storage, native messaging, cross-origin requests, and any flow that sends page data to Local/BYOK/Managed runtime.
- Do not add permissions or page-action capabilities without updating the threat model and review notes.
- Avoid `innerHTML` and dynamic script/style injection unless the threat model explicitly allows the pattern.

## Verification

- Small change: `pnpm --filter @agiworkforce/extension typecheck`
- Behavior change: `pnpm --filter @agiworkforce/extension test`
- Required for extension changes: `pnpm lint:extension`
- Required for extension changes: `pnpm --filter @agiworkforce/extension check:no-cloud-ipc`
- Manifest/permission, storage, capture, or context-handoff change: manually
  verify install and update `THREAT_MODEL.md`. A persistence or egress flow that
  touches no manifest field is NOT exempt — `THREAT_MODEL.md` triggers on
  "storage/sync" and "Managed Cloud endpoints" too.
