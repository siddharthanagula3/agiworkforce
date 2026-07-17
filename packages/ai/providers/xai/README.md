# @agiworkforce/providers-xai

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: medium

## Purpose

xAI provider adapter using AGI-owned provider contracts.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- xAI request/response normalization.
- xAI-specific capability and error mapping.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-xai typecheck`
- `pnpm --filter @agiworkforce/providers-xai test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-xai test:live`

## Environment / Secrets

Never commit xAI API keys or captured payloads.

## Security, Privacy, Data Boundaries

Review base URLs, payload logging, retention behavior, tool/file support, and provider-mode labels.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior.

## Release / Deployment Notes

Coordinate capability changes with routing.

## Known Caveats

Adapter may depend on OpenAI-compatible behavior.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
