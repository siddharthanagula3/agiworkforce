# @agiworkforce/artifacts

Status: Current
Owner role: Artifact domain / frontend platform
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Canonical platform-neutral artifact mechanics for Web, Desktop, and Mobile:
deterministic derivation, publish-boundary enforcement, cloud merge/apply rules,
and the vanilla Zustand artifact store. Hosts wrap the store with their own
persistence, transport, and platform I/O adapters.

## Public API

`package.json#exports` exposes `.` through `src/index.ts`. Consumers must use
`@agiworkforce/artifacts`, not deep source paths.

## Ownership Rules

- Artifact derivation, publish, merge/apply, and state mechanics live here.
- Managed-cloud wire schemas stay in `@agiworkforce/cloud-contracts`.
- Surface persistence, transport, rendering, and privileged file I/O stay in
  the owning application.
- This package must not depend on applications or `@agiworkforce/sync`.

Import this package directly. The transitional `@agiworkforce/services` and
`@agiworkforce/stores` facades that once re-exported it were deleted at M8
(2026-07-15); `scripts/check-artifact-sync-ownership.mjs` guards against them
reappearing.

## Commands

```bash
pnpm --filter @agiworkforce/artifacts lint
pnpm --filter @agiworkforce/artifacts typecheck
pnpm --filter @agiworkforce/artifacts test
pnpm --filter @agiworkforce/artifacts build
```
