# @agiworkforce/apply-patch

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

Shared TypeScript patch-application helpers for agent/code-edit workflows.

## Consumers

Web, services, and tool runtimes that need safe patch parsing or application.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Patch parsing and validation.
- Patch application helpers that are independent of UI and apps.

## What Does Not Belong Here

- App-specific file editors.
- Shell command execution.
- Git operations with side effects outside explicit patch application.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/apply-patch typecheck`
- `pnpm --filter @agiworkforce/apply-patch test`
- `pnpm --filter @agiworkforce/apply-patch build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for path traversal, symlink handling, binary file behavior, patch grammar changes, and any filesystem write behavior.

## Tests Required For Changes

Add tests for malformed patches, traversal attempts, conflict cases, and successful application.

## Release / Deployment Notes

Patch behavior affects agent code editing. Keep failures explicit and auditable.

## Known Caveats

Rust patch behavior may also exist in `crates/agiworkforce-apply-patch`; keep semantics aligned.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: platform lead for shared agent-edit behavior.
