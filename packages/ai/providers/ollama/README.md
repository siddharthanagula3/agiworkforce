# @agiworkforce/providers-ollama

Status: Current
Owner role: Local runtime owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: high

## Purpose

Ollama local-provider adapter for AGI-owned model/provider contracts.

## Consumers

Desktop, CLI-adjacent local runtime flows, Web only when explicitly configured, and routing/runtime code.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Ollama request/response normalization.
- Local endpoint capability and error mapping.

## What Does Not Belong Here

- Cloud provider behavior.
- Managed gateway logic.
- UI code.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-ollama typecheck`
- `pnpm --filter @agiworkforce/providers-ollama test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-ollama test:live`

## Environment / Secrets

No provider secrets are expected for local Ollama. Do not log user prompts or local endpoint data unnecessarily.

## Security, Privacy, Data Boundaries

Review local endpoint discovery, localhost assumptions, prompt logging, and fallback behavior from Local to BYOK/Managed.

## Tests Required For Changes

Add adapter tests for request shape, unavailable endpoint behavior, and local privacy labels.

## Release / Deployment Notes

Local provider behavior must never silently escalate to cloud.

## Known Caveats

Live tests require a local Ollama server.

## CODEOWNERS

Primary: Local runtime owner. Secondary: security/privacy.
