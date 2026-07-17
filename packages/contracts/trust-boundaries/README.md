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
- This package has zero production dependencies and must not import apps or the
  transitional `@agiworkforce/services` facade.

`@agiworkforce/services` temporarily re-exports this package for downstream
compatibility. New first-party code imports this owner directly.

## Commands

```bash
pnpm --filter @agiworkforce/trust-boundaries lint
pnpm --filter @agiworkforce/trust-boundaries typecheck
pnpm --filter @agiworkforce/trust-boundaries test
pnpm --filter @agiworkforce/trust-boundaries build
```
