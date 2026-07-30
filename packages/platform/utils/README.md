# @agiworkforce/utils

Status: Current
Owner role: Platform lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: medium

## Purpose

Shared utility helpers that are genuinely cross-surface and too small to justify a domain package.

## Consumers

Apps, packages, and services that need surface-neutral helpers.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Small pure utilities.
- Cross-surface helpers with no app dependency.

## What Does Not Belong Here

- Provider clients.
- UI components.
- Runtime orchestration.
- Security-sensitive logic that deserves a named package.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/utils typecheck`
- `pnpm --filter @agiworkforce/utils build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required if a utility handles paths, URLs, tokens, redaction, serialization, file names, or user-provided input.

## Tests Required For Changes

Add tests for non-trivial utilities and all security-sensitive edge cases.

## Release / Deployment Notes

Keep public exports stable and avoid deep imports.

## Known Caveats

If a helper grows domain behavior, move it to an owned package.

## CODEOWNERS

Primary: Platform lead. Secondary: security/privacy for input/path/token/redaction utilities.
