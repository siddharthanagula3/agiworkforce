# @agiworkforce/routing

Status: Current
Owner role: Platform lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

Shared model/provider routing logic for selecting providers, models, fallbacks, and routing metadata.

## Consumers

Web, Desktop, services, provider packages, and shared chat/runtime surfaces.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Routing policy logic.
- Model/provider capability matching.
- Fallback and routing explanation metadata.

## What Does Not Belong Here

- Provider SDK clients.
- Billing ledger settlement.
- UI components.
- Hidden Managed gateway defaults.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/routing typecheck`
- `pnpm --filter @agiworkforce/routing test`
- `pnpm --filter @agiworkforce/routing build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for Local/BYOK/Managed routing, fallback behavior, provider labels, cost-sensitive routing, and any logic that could send data to a provider unexpectedly.

## Tests Required For Changes

Add tests for routing decisions, fallbacks, privacy-mode blocks, and cost/capability changes.

## Release / Deployment Notes

Routing changes are user-trust sensitive. Surface routing explanations should stay aligned.

## Known Caveats

Managed gateway paths must remain explicitly labeled and consented.

## CODEOWNERS

Primary: Platform lead. Secondary: provider/platform and security/privacy for provider-mode behavior.
