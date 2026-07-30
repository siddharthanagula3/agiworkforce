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
- This package must not depend on applications, `@agiworkforce/services`,
  `@agiworkforce/stores`, or `@agiworkforce/sync`.

`@agiworkforce/services` and `@agiworkforce/stores` temporarily re-export this
package for compatibility. New first-party code imports this owner directly.

## Commands

```bash
pnpm --filter @agiworkforce/artifacts lint
pnpm --filter @agiworkforce/artifacts typecheck
pnpm --filter @agiworkforce/artifacts test
pnpm --filter @agiworkforce/artifacts build
```
