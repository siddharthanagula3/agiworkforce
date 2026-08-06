# @agiworkforce/trust-boundaries

Status: Current
Owner role: Security/privacy platform
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Canonical platform-neutral classification policy for AGI-owned Managed Cloud
hosts. Desktop and Mobile use it as the shared floor for their fail-closed
Local-mode egress guards.

## Boundaries

- This package classifies destinations; it performs no network I/O.
- Surface guards own mode resolution, blocking errors, configuration-derived
  hosts, request execution, and user-facing recovery.
- BYOK provider hosts do not belong in the AGI-owned host set.
- This package has zero production dependencies and must not import apps.

Import this package directly. The transitional `@agiworkforce/services` facade that
once re-exported it was deleted at M8 (2026-07-15); `scripts/check-artifact-sync-ownership.mjs`
guards against it reappearing.

## Commands

```bash
pnpm --filter @agiworkforce/trust-boundaries lint
pnpm --filter @agiworkforce/trust-boundaries typecheck
pnpm --filter @agiworkforce/trust-boundaries test
pnpm --filter @agiworkforce/trust-boundaries build
```
