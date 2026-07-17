# @agiworkforce/search

Status: Current
Owner role: Search platform
Last updated: 2026-07-15
Kind: ts-package
Criticality: high

## Purpose

Canonical cross-surface queries for registry-derived web-search harness
availability. It tells callers which provider paths are implemented and when a
generic platform tool is required; it does not execute search.

## Boundaries

- Implemented harness facts come from `@agiworkforce/types` generated model
  metadata; this package owns no provider allowlist copy.
- Search backend configuration, tool execution, credentials, citations, and
  request policy stay with the owning host.
- This package must not import applications, provider SDKs, or the transitional
  `@agiworkforce/services` facade.

`@agiworkforce/services` temporarily re-exports this package for downstream
compatibility. New first-party code imports this owner directly.

## Commands

```bash
pnpm --filter @agiworkforce/search lint
pnpm --filter @agiworkforce/search typecheck
pnpm --filter @agiworkforce/search test
pnpm --filter @agiworkforce/search build
```
