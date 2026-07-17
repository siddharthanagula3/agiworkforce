# @agiworkforce/providers-perplexity

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: medium

## Purpose

Perplexity provider adapter using AGI-owned provider contracts.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Perplexity request/response normalization.
- Search/research capability mapping where supported by provider behavior.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Browser automation.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-perplexity typecheck`
- `pnpm --filter @agiworkforce/providers-perplexity test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-perplexity test:live`

## Environment / Secrets

Never commit Perplexity API keys or captured payloads.

## Security, Privacy, Data Boundaries

Review base URLs, payload logging, search/research payloads, retention behavior, and provider-mode labels.

## Tests Required For Changes

Add adapter tests for request shape, errors, and capability behavior.

## Release / Deployment Notes

Coordinate research/search capability changes with routing and UI labels.

## Known Caveats

Adapter may depend on OpenAI-compatible behavior.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
