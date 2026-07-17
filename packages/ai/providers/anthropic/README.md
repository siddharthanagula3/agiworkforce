# @agiworkforce/providers-anthropic

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: high

## Purpose

Anthropic provider adapter for AGI-owned model/provider contracts.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Anthropic request/response normalization.
- Anthropic SDK transport behind AGI-owned contracts.
- Anthropic-specific error/capability mapping.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI provider picker code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-anthropic typecheck`
- `pnpm --filter @agiworkforce/providers-anthropic test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-anthropic test:live`

## Environment / Secrets

Never commit Anthropic API keys or captured payloads.

## Security, Privacy, Data Boundaries

Review retention flags, tool calls, file uploads, streaming payloads, base URLs, logging, and Local/BYOK/Managed labels.

## Tests Required For Changes

Add adapter tests for request shape, streaming, errors, and privacy defaults.

## Release / Deployment Notes

Provider changes affect BYOK trust and managed gateway behavior.

## Known Caveats

Keep Anthropic SDK usage behind this adapter.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
