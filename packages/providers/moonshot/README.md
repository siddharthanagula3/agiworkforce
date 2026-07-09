# @agiworkforce/providers-moonshot

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-08
Kind: provider-package
Criticality: medium

## Purpose

Moonshot AI (Kimi) provider adapter using AGI-owned provider contracts.
Moonshot serves an OpenAI-compatible Chat Completions API.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createMoonshotAdapter(config)` — build a `ProviderAdapter`.
- `moonshotAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `MOONSHOT_MODEL_CATALOG` — curated catalog, sourced from `packages/types/src/models.json`.
- `withMoonshotCacheUsageNormalization` — stream decorator for the cache-usage quirk below.

## What Belongs Here

- Moonshot request/response normalization (thin: reuses
  `@agiworkforce/providers-openai`'s translate/stream layer).
- Moonshot-specific capability and error mapping.

## Known Quirk: flat `usage.cached_tokens`

Moonshot reports cache-read tokens on a flat `usage.cached_tokens` field
instead of OpenAI's nested `usage.prompt_tokens_details.cached_tokens`
(confirmed in `apps/web/lib/llm-providers/moonshot.ts`, the source of truth
for this port). `src/cache-usage.ts` rewrites the flat field into the nested
shape before the raw SDK stream reaches `@agiworkforce/providers-openai`'s
`translateOpenAIStream`, so `StreamChunkUsage.cacheReadTokens` is populated
correctly instead of silently staying `undefined`.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `src/cache-usage.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-moonshot typecheck`
- `pnpm --filter @agiworkforce/providers-moonshot test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-moonshot test:live`

## Environment / Secrets

Never commit Moonshot API keys or captured payloads. `MOONSHOT_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`api.moonshot.cn` / `api.moonshot.ai` / `localhost` / `127.0.0.1`, plus any
hosts passed via `additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl`
from `@agiworkforce/llm-runtime`. A disallowed override falls back to the
default base URL rather than being trusted — mirrors the SSRF fix in
`apps/web/lib/llm-providers/factory.ts`.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior.

## Release / Deployment Notes

Coordinate capability changes with routing.

## Known Caveats

Adapter depends on OpenAI-compatible behavior (`@agiworkforce/providers-openai`
translate/stream reuse).

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
