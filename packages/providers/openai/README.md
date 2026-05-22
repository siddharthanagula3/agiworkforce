# @agiworkforce/providers-openai

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: high

## Purpose

OpenAI provider adapter for AGI-owned model/provider contracts.

## Consumers

Services, Web, Desktop, OpenAI-compatible provider adapters, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- OpenAI request/response normalization.
- OpenAI SDK transport behind AGI-owned contracts.
- OpenAI-compatible fallback behavior shared by compatible provider adapters.

## What Does Not Belong Here

- Cross-provider routing policy.
- Vercel AI Gateway defaults.
- UI code.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-openai typecheck`
- `pnpm --filter @agiworkforce/providers-openai test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-openai test:live`

## Environment / Secrets

Never commit OpenAI API keys, compatible-provider keys, or captured payloads.

## Security, Privacy, Data Boundaries

Review `store` defaults, Responses vs Chat Completions behavior, file uploads, tool calls, base URLs, logging, and Managed gateway boundaries.

## Tests Required For Changes

Add adapter tests for request shape, streaming, errors, storage defaults, and OpenAI-compatible endpoints.

## Release / Deployment Notes

OpenAI native behavior should prefer Responses only after tests prove privacy defaults.

## Known Caveats

Several compatible providers depend on this adapter.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
