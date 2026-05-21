# Chrome Extension Agent Rules

Status: Current
Owner: Extension lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/extension/README.md`.

## Scope

`apps/extension` owns the Chrome MV3 extension, browser context capture, side panel, content scripts, background worker, packaging, and native messaging bridge.

## High-Risk Areas

- Extension permissions, content-script injection, page capture, browser storage, native messaging, cross-origin requests, and any flow that sends page data to Local/BYOK/Managed runtime.
- Do not add permissions or page-action capabilities without updating the threat model and review notes.
- Avoid `innerHTML` and dynamic script/style injection unless the threat model explicitly allows the pattern.

## Verification

- Small change: `pnpm --filter @agiworkforce/extension typecheck`
- Behavior change: `pnpm --filter @agiworkforce/extension test`
- Required for extension changes: `pnpm lint:extension`
- Manifest/permission change: manually verify install and update `THREAT_MODEL.md`.
