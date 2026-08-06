# `@agiworkforce/cloud-contracts`

Status: Current
Owner role: Platform lead
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Canonical managed-cloud wire contracts for AGI Workforce. This package owns the
Zod schemas, endpoint paths, custom stream deltas, and typed clients shared by
Web, Desktop, and Mobile.

It contains contracts only. Persistence, sync-apply mechanics, artifact
derivation, provider execution, authentication, billing, and product policy
remain with their domain owners.

## Boundaries

- Depends only on `@agiworkforce/types` and `zod` in production.
- Must not depend on applications or licensing.
- All consumers import `@agiworkforce/cloud-contracts` directly. The transitional
  `@agiworkforce/services` facade was deleted at M8 (2026-07-15).

## Commands

```bash
pnpm --filter @agiworkforce/cloud-contracts typecheck
pnpm --filter @agiworkforce/cloud-contracts test
pnpm --filter @agiworkforce/cloud-contracts lint
pnpm check:cloud-contract-ownership
```
