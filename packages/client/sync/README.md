# @agiworkforce/sync

Status: Current
Owner role: Platform data/sync
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Canonical pure delta-apply and bigint-cursor mechanics for cross-device Managed
Cloud synchronization. Mobile consumes the TypeScript implementation at
runtime. Web consumes the cursor mechanics for its pull-only artifact overlay.
Desktop's Rust implementation replays the same committed JSON fixture corpus to
preserve cross-language behavior.

## Public API

`package.json#exports` exposes `.` through `src/index.ts`. Consumers must use
`@agiworkforce/sync`, not deep source paths.

## Ownership Rules

- Managed-cloud wire schemas stay in `@agiworkforce/cloud-contracts`.
- Transport, authentication, persistence, conflict UX, and retry policy stay in
  each surface.
- Artifact delta behavior is owned by `@agiworkforce/artifacts`; the sync test
  corpus consumes it only to replay a complete pull page.
- This package must not depend on applications.

Import this package directly. The transitional `@agiworkforce/services` and
`@agiworkforce/stores` facades that once re-exported it were deleted at M8
(2026-07-15); `scripts/check-artifact-sync-ownership.mjs` guards against them
reappearing.

## Commands

```bash
pnpm --filter @agiworkforce/sync lint
pnpm --filter @agiworkforce/sync typecheck
pnpm --filter @agiworkforce/sync test
pnpm --filter @agiworkforce/sync build
```
