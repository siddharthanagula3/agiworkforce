# @agiworkforce/providers-google

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: high

## Purpose

Google/Gemini provider adapter for AGI-owned model/provider contracts.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Google/Gemini request/response normalization.
- Google-specific capability and error mapping.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-google typecheck`
- `pnpm --filter @agiworkforce/providers-google test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-google test:live`

## Environment / Secrets

Never commit Google API keys, service account credentials, or captured payloads.

## Security, Privacy, Data Boundaries

Review payload construction, files, tool calls, retention behavior, logging, and provider-mode labels.

## Tests Required For Changes

Add adapter tests for request shape, streaming/errors if supported, and privacy defaults.

## Release / Deployment Notes

Coordinate model capability changes with routing.

## Known Caveats

Local Gemini Nano behavior belongs in local runtime/mobile contracts, not this cloud adapter.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
