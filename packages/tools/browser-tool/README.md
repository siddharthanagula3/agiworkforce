# @agiworkforce/browser-tool

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-08-09
Kind: ts-package
Criticality: high

## Purpose

Shared browser automation primitives backed by Playwright Core.

## Consumers

None today. No file in the repository imports this package: `grep -rn
"agiworkforce/browser-tool" --include="*.ts" --include="*.tsx" --include="*.js"`
matches only this package's own header comment.

`apps/extension/package.json` still lists `"@agiworkforce/browser-tool":
"workspace:*"`, but that entry is now stale. The extension's only importer was a
type-only `import type { BrowserAction }` in
`apps/extension/src/features/content/browserTool.ts`, and that file was deleted
with its bridge in `bfce749b3` (2026-08-09) because the bridge had no caller.
The manifest entry should be dropped the next time a `pnpm-lock.yaml` change is
safe to land.

Desktop browser automation is a separate Rust/CDP stack under
`apps/desktop/src-tauri/src/automation/browser`, and Web does not use this
package at all. Neither has ever depended on it.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Browser/session/action abstractions.
- Playwright-backed browser tool helpers.
- Surface-neutral computer-use support code.

## What Does Not Belong Here

- Chrome extension UI or permissions.
- Desktop-specific Tauri commands.
- Provider-native computer-use clients.
- Persistent user browsing data.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/browser-tool typecheck`
- `pnpm --filter @agiworkforce/browser-tool test`
- `pnpm --filter @agiworkforce/browser-tool build`

## Environment / Secrets

Do not commit browser profiles, cookies, session recordings, credentials, screenshots, or local captures.

## Security, Privacy, Data Boundaries

Security/privacy review is required for navigation, page capture, screenshots, downloads, file uploads, cross-origin behavior, credential handling, and action execution.

## Tests Required For Changes

Add tests for action validation, blocked destinations, capture redaction, and browser lifecycle behavior.

## Release / Deployment Notes

Use `computerActionToBrowserAction` or `runComputerAction` when callers have suite-level `ComputerAction` records. Unsupported native-only actions fail closed and should be routed to Desktop/native computer use.

## Known Caveats

Generated captures must live in approved reports or artifact locations, not package source.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: extension/desktop owner when consumed by those surfaces.
