# @agiworkforce/api

Status: Current
Owner role: Platform lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: medium

## Purpose

Shared API client/contracts package for app-facing API helpers that are reusable across surfaces without importing an app.

## Consumers

Web, Desktop, stores, and service-adjacent code that needs shared API helper behavior.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Surface-neutral API helper functions.
- API client types built on `@agiworkforce/runtime` and `@agiworkforce/types`.

## What Does Not Belong Here

- Next.js route handlers.
- Express service handlers.
- UI components.
- Provider SDK clients.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/api typecheck`
- `pnpm --filter @agiworkforce/api test`
- `pnpm --filter @agiworkforce/api build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for auth headers, request signing, token handling, file payloads, logging, and any Local/BYOK/Managed data routing behavior.

## Tests Required For Changes

Run package typecheck and tests. Add tests for request/response behavior changes.

## Release / Deployment Notes

This package is workspace-consumed from source. Keep exports stable.

## Known Caveats

Prefer `packages/types` for schemas and `packages/runtime` for transport/runtime primitives.

## CODEOWNERS

Primary: Platform lead. Secondary: security/privacy for auth, tokens, files, and data routing.
