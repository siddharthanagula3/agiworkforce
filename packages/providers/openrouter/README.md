# @agiworkforce/providers-openrouter

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-08
Kind: provider-package
Criticality: medium

## Purpose

OpenRouter provider adapter using AGI-owned provider contracts. OpenRouter
routes to hundreds of underlying models via an OpenAI-compatible Chat
Completions endpoint at `https://openrouter.ai/api/v1`.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createOpenRouterAdapter(config)` — build a `ProviderAdapter` (`id: 'open_router'`,
  the canonical `Provider` union value; `models.json` aliases both `open_router`
  and `openrouter`).
- `openrouterAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `OPENROUTER_MODEL_CATALOG` — curated catalog, sourced from `packages/types/src/models.json`.
- `applyOpenRouterAnthropicCacheControl`, `createOpenRouterUsageNormalizer` — quirks below.

## Known Quirks (source of truth: `apps/web/lib/llm-providers/openrouter.ts`)

1. **Attribution headers.** OpenRouter's ToS requires `HTTP-Referer` and
   `X-Title` on every request. The web adapter reads
   `NEXT_PUBLIC_APP_URL`; this package has no Next.js dependency, so
   `config.siteUrl` / `config.appTitle` take the same fallback literals
   (`'https://agiworkforce.app'` / `'AGI Workforce'`) and callers that want
   the env-driven value forward it explicitly.
2. **Anthropic `cache_control` passthrough.** For `anthropic/*` routes,
   OpenRouter forwards an Anthropic-shape `cache_control` block on the
   system message straight through to the upstream Anthropic API.
   `applyOpenRouterAnthropicCacheControl` (`src/cache-control.ts`) ports the
   _observable default_ (5-minute ephemeral, matching the web adapter's
   `resolveCacheRetention` default for this route family) — not the web's
   full session-stability/extraParams policy engine, which depends on
   session state this adapter layer doesn't have. Configurable via
   `anthropicCacheRetention` (`'none' | 'short' | 'long'`, default `'short'`).
3. **Usage normalization.** OpenRouter reshapes usage differently per routed
   model: Anthropic routes report `cache_read_input_tokens` /
   `cache_creation_input_tokens` (Anthropic-style); other routes nest the
   cache-read count under either `prompt_tokens_details.cached_tokens` (what
   `translateOpenAIStream` already reads) or `input_tokens_details.cached_tokens`.
   `createOpenRouterUsageNormalizer` (`src/usage.ts`) normalizes all three
   into `StreamChunkUsage.cacheReadTokens` / `cacheWriteTokens` without
   modifying the shared `@agiworkforce/providers-openai` translator — see the
   module docstring for why cache-write tokens need a second wrapper around
   `translateOpenAIStream`'s output (OpenAI's own usage shape has no
   cache-write concept, so the shared translator has no path for it at all).

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.
- The full cache-retention session-stability policy engine (that's a
  call-site concern — see quirk 2 above).

## Key Files

- `src/index.ts`
- `src/cache-control.ts`
- `src/usage.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-openrouter typecheck`
- `pnpm --filter @agiworkforce/providers-openrouter test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-openrouter test:live`

## Environment / Secrets

Never commit OpenRouter API keys or captured payloads. `OPENROUTER_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`openrouter.ai` / `localhost` / `127.0.0.1`, plus any hosts passed via
`additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl` from
`@agiworkforce/llm-runtime`. A disallowed override falls back to the default
base URL rather than being trusted — mirrors the SSRF fix in
`apps/web/lib/llm-providers/factory.ts`.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior. Any
change to the three quirks above needs a regression test in
`cache-control.test.ts` / `usage.test.ts`.

## Release / Deployment Notes

Coordinate capability changes with routing.

## Known Caveats

Adapter depends on OpenAI-compatible behavior (`@agiworkforce/providers-openai`
translate/stream reuse). The Anthropic cache_control default (quirk 2) is a
simplified, stateless port of a stateful web policy — revisit if OpenRouter

- Anthropic cache economics need session-level tuning.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
