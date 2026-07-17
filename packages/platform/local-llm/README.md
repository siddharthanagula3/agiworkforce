# @agiworkforce/local-llm

Status: Current
Owner role: Local runtime owner
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

Shared local LLM contracts and helpers for on-device or local-host model execution, especially mobile/local-first flows.

## Consumers

Mobile, Desktop, and shared runtime code that needs Local-mode model metadata or execution helpers.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Local model capability metadata.
- Local runtime adapters that do not belong to a specific app.
- React Native compatible local model contracts.

## What Does Not Belong Here

- Provider cloud SDK clients.
- App-specific onboarding screens.
- Managed cloud routing.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/local-llm typecheck`
- `pnpm --filter @agiworkforce/local-llm test`

## Environment / Secrets

No secrets belong in this package. Local model paths and downloads should be user/device-local.

## Security, Privacy, Data Boundaries

Security/privacy review is required for model downloads, local file paths, native bridge calls, telemetry, and any fallback from Local to BYOK or Managed.

## Tests Required For Changes

Add tests for capability detection, privacy labels, fallback behavior, and platform compatibility where possible.

## Release / Deployment Notes

Local runtime behavior must stay explicit and should not silently route to cloud providers.

## Known Caveats

React Native/native module availability may vary by platform and device tier.

## CODEOWNERS

Primary: Local runtime owner. Secondary: Mobile lead and security/privacy for storage, downloads, and fallback behavior.
