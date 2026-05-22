# @agiworkforce/stores

Status: Current
Owner role: Platform lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: medium

## Purpose

Shared state stores for cross-surface app state that is not owned by a single app.

## Consumers

Web, Desktop, unified chat, and other frontend surfaces.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Surface-neutral Zustand/Immer stores.
- Shared state selectors and actions.

## What Does Not Belong Here

- App-local component state.
- Server-only state.
- Provider SDK clients.
- Persistent secrets.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/stores typecheck`
- `pnpm --filter @agiworkforce/stores build`

## Environment / Secrets

No secrets belong in this package. Do not store provider keys or user files here unless explicitly encrypted and owned by a surface.

## Security, Privacy, Data Boundaries

Security/privacy review is required for persistence, sync, auth/user state, Local/BYOK/Managed labels, or anything that affects what data is displayed as local/cloud.

## Tests Required For Changes

Add tests for behavior changes where stores affect user-visible state, sync, or privacy labels.

## Release / Deployment Notes

Store changes can affect multiple surfaces; verify at least one consumer.

## Known Caveats

Avoid turning this into a global dumping ground. Domain stores should live near their owning feature when only one surface uses them.

## CODEOWNERS

Primary: Platform lead. Secondary: affected surface owner and security/privacy for persistence/sync/privacy behavior.
