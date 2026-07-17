# @agiworkforce/providers-zhipu

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-08
Kind: provider-package
Criticality: medium

## Purpose

ZhipuAI (GLM / BigModel) provider adapter using AGI-owned provider contracts.
Zhipu serves an OpenAI-compatible Chat Completions API at
`https://open.bigmodel.cn/api/paas/v4`.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createZhipuAdapter(config)` — build a `ProviderAdapter`.
- `zhipuAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `ZHIPU_MODEL_CATALOG` — curated catalog, sourced from `packages/contracts/types/src/models.json`.
- `applyZhipuThinkingMode` — request-param mutator for the thinking-mode quirk below.

## Known Quirks

`open.bigmodel.cn` is not in `@agiworkforce/provider-protocol`'s bundled hostname
table (only the newer global `api.z.ai` alias resolves to
`endpointClass: 'zai-native'`), so `detectOpenAICompletionsCompat` treats it
as an unrecognized proxy. Two local overrides correct for that, both sourced
from `apps/web/lib/llm-providers/zhipu.ts`:

1. **`max_tokens` field.** The unrecognized-proxy default is
   `max_completion_tokens`; BigModel's documented API expects the legacy
   `max_tokens` name (the web adapter always sends `max_tokens`). `stream()`
   forces `maxTokensField: 'max_tokens'` after compat detection.
2. **GLM thinking mode.** A `{ thinking: { type: 'enabled' | 'disabled' } }`
   request field, distinct from OpenAI's `reasoning_effort` enum (which stays
   correctly disabled for this host). `applyZhipuThinkingMode` maps
   `ChatRequest.thinking` onto it after the shared translate step.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.

## Key Files

- `src/index.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-zhipu typecheck`
- `pnpm --filter @agiworkforce/providers-zhipu test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-zhipu test:live`

## Environment / Secrets

Never commit Zhipu API keys or captured payloads. `ZHIPU_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`open.bigmodel.cn` / `api.z.ai` / `localhost` / `127.0.0.1`, plus any hosts
passed via `additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl`
from `@agiworkforce/provider-runtime`. A disallowed override falls back to the
default base URL rather than being trusted. The shared validation mechanics
live in `@agiworkforce/provider-runtime`.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior. Any
change to the two quirks above needs a regression test in `quirks.test.ts`.

## Release / Deployment Notes

Coordinate capability changes with routing.

## Known Caveats

Adapter depends on OpenAI-compatible behavior (`@agiworkforce/providers-openai`
translate/stream reuse). `usage.prompt_tokens_details.cached_tokens` uses the
standard nested shape already handled by `translateOpenAIStream` — no
normalization needed there (unlike Moonshot's flat `cached_tokens` field).

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
