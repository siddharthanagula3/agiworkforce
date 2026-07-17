# @agiworkforce/providers-groq

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-08
Kind: provider-package
Criticality: medium

## Purpose

Groq provider adapter using AGI-owned provider contracts. Groq serves an
OpenAI-compatible Chat Completions API on custom LPU hardware for very high
token throughput (~280-560 tokens/sec).

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createGroqAdapter(config)` — build a `ProviderAdapter`.
- `groqAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `GROQ_MODEL_CATALOG` — curated catalog, sourced from `packages/contracts/types/src/models.json`.

## What Belongs Here

- Groq request/response normalization (thin: reuses `@agiworkforce/providers-openai`'s
  translate/stream layer unchanged — Groq has no response-shape quirks beyond
  the shared OpenAI Chat Completions compat detection).
- Groq-specific capability and error mapping.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-groq typecheck`
- `pnpm --filter @agiworkforce/providers-groq test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-groq test:live`

## Environment / Secrets

Never commit Groq API keys or captured payloads. `GROQ_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`api.groq.com` / `localhost` / `127.0.0.1`, plus any hosts passed via
`additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl` from
`@agiworkforce/provider-runtime`. A disallowed override falls back to the default
base URL rather than being trusted. The shared validation mechanics live in
`@agiworkforce/provider-runtime`.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior.

## Release / Deployment Notes

Coordinate capability changes with routing.

## Known Caveats

Adapter depends on OpenAI-compatible behavior (`@agiworkforce/providers-openai`
translate/stream reuse).

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
