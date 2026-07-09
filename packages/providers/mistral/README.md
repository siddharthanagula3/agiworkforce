# @agiworkforce/providers-mistral

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-08
Kind: provider-package
Criticality: medium

## Purpose

Mistral AI provider adapter using AGI-owned provider contracts. Mistral
serves an OpenAI-compatible Chat Completions API; the shared compat layer
classifies it as `knownProviderFamily: 'mistral'`, which drives the
`max_tokens` (not `max_completion_tokens`) field name and disables `store` /
`reasoning_effort` automatically.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createMistralAdapter(config)` — build a `ProviderAdapter`.
- `mistralAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `MISTRAL_MODEL_CATALOG` — curated catalog, sourced from `packages/types/src/models.json`.

## What Belongs Here

- Mistral request/response normalization (thin: reuses
  `@agiworkforce/providers-openai`'s translate/stream layer unchanged).
- Mistral-specific capability and error mapping.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-mistral typecheck`
- `pnpm --filter @agiworkforce/providers-mistral test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-mistral test:live`

## Environment / Secrets

Never commit Mistral API keys or captured payloads. `MISTRAL_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`api.mistral.ai` / `localhost` / `127.0.0.1`, plus any hosts passed via
`additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl` from
`@agiworkforce/llm-runtime`. A disallowed override falls back to the default
base URL rather than being trusted — mirrors the SSRF fix in
`apps/web/lib/llm-providers/factory.ts`.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior.

## Release / Deployment Notes

Coordinate capability changes with routing.

## Known Caveats

Adapter depends on OpenAI-compatible behavior (`@agiworkforce/providers-openai`
translate/stream reuse). No vision/pixtral-specific handling beyond the
shared image-block → `image_url` mapping already in `providers-openai`.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
