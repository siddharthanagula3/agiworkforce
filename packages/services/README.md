# @agiworkforce/services

Status: Current
Owner role: Platform lead
Last updated: 2026-06-06
Kind: ts-package
Criticality: high

## Purpose

`@agiworkforce/services` owns reusable cross-surface service modules that
orchestrate domain operations behind a typed contract — the surfaces wire UI
to these services, and the services own the security invariants (sync-rule
gating, trust-boundary checks, privacy-mode handling, waitlist gating).

## Consumers

- Web, Desktop, Mobile (sync-app surfaces) — call services directly.
- CLI, VS Code extension, Chrome extension (developer-session surfaces) — may
  call services that explicitly support developer-session callers; services
  that require a sync-app surface throw via `assertSurfaceCanSyncChats`.

## Public API / Exports

`package.json#exports`:

- `.` -> `./src/index.ts`

The root re-exports each service's public surface. Do not deep-import
implementation files. Add a `package.json#exports` entry before introducing
a new public subpath.

## What Belongs Here

- Cross-surface service modules whose mechanics should not be re-implemented
  per surface (e.g. artifact publish, share-link issuance, connector
  registry, future computer-use orchestration).
- Sync-rule and trust-boundary gating logic that wraps the canonical
  contracts in `@agiworkforce/types`.
- Local/Cloud trust-boundary enforcement: services that would touch managed
  cloud must return waitlist-gated results when the cloud endpoint is not yet
  enabled.

## What Does Not Belong Here

- Surface-specific UI components (those live in the surface or in
  `@agiworkforce/unified-chat`).
- Pure type definitions (those live in `@agiworkforce/types`).
- Pure stateless runtime primitives (those live in `@agiworkforce/runtime`).

## Current Modules

- `artifacts.ts` — `publishArtifact({ artifact, privacyMode, surface, localFileWriter })`.
  Enforces `assertSurfaceCanSyncChats` + `assertGeneratedFileTrustBoundary`.
  Returns a local `file://` URL for `privacyMode: 'local'`; returns a
  waitlist-gated result for managed cloud until the publish endpoint is proven.
  Hosts (web/desktop/mobile) inject a `localFileWriter` adapter for the local
  path.

## Testing

```
pnpm --filter @agiworkforce/services typecheck
pnpm --filter @agiworkforce/services test
```
