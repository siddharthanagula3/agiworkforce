# @agiworkforce/providers-lmstudio

Status: Current
Owner role: Local runtime owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: medium

## Purpose

LM Studio local/OpenAI-compatible provider adapter for AGI-owned model/provider contracts.

## Consumers

Desktop, CLI-adjacent local runtime flows, routing/runtime code, and local BYOK-style setups.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- LM Studio endpoint normalization.
- OpenAI-compatible local transport mapping through shared contracts.

## What Does Not Belong Here

- Cloud OpenAI account behavior.
- UI onboarding.
- Managed gateway logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-lmstudio typecheck`
- `pnpm --filter @agiworkforce/providers-lmstudio test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-lmstudio test:live`

## Environment / Secrets

No cloud secrets are expected. Do not commit local endpoint configs with private data.

## Security, Privacy, Data Boundaries

Review localhost endpoint handling, fallback behavior, payload logging, and Local-mode labels.

## Tests Required For Changes

Add adapter tests for request shape, unavailable endpoint behavior, and compatibility quirks.

## Release / Deployment Notes

Local provider behavior must remain explicit and user-controlled.

## Known Caveats

Live tests require a running LM Studio server.

## CODEOWNERS

Primary: Local runtime owner. Secondary: provider/platform and security/privacy.
