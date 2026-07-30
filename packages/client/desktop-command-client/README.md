# @agiworkforce/desktop-command-client

Status: Current
Owner role: Platform lead
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Typed Desktop renderer client for privileged commands exposed by the Tauri host. It provides command-specific wrappers and wire types on top of `@agiworkforce/client-runtime`; it is not the platform HTTP API or API Gateway.

## Consumers

Desktop only. Other surfaces must use their own explicit transport boundary.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Typed wrappers for registered Desktop/Tauri commands.
- Renderer-side request and response wire types.
- Capability-specific command namespaces built on `@agiworkforce/client-runtime` and `@agiworkforce/types`.

## What Does Not Belong Here

- Next.js route handlers.
- Express service handlers.
- Web, Mobile, Chrome, or VS Code transport clients.
- UI components.
- Provider SDK clients.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/desktop-command-client typecheck`
- `pnpm --filter @agiworkforce/desktop-command-client test`
- `pnpm --filter @agiworkforce/desktop-command-client build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for privileged command arguments, token handling, file payloads, logging, and any Local/BYOK/Managed data routing behavior. Authorization and validation remain mandatory in the Tauri command owner; renderer types are not a security boundary.

## Tests Required For Changes

Run package typecheck and tests plus Desktop typecheck. Add tests for command/wire behavior changes.

## Release / Deployment Notes

This package is source-consumed by Desktop. Keep the root export, command names, and wire types stable.

## Known Caveats

Prefer `packages/contracts/types` for cross-surface schemas and `packages/client/client-runtime` for surface-neutral client primitives. Do not turn this package back into a generic API namespace.

## CODEOWNERS

Primary: Platform lead. Secondary: security/privacy for auth, tokens, files, and data routing.
