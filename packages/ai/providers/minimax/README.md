# @agiworkforce/providers-minimax

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-22
Kind: provider-package
Criticality: medium

## Purpose

MiniMax provider adapter using AGI-owned provider contracts. MiniMax ships an
OpenAI-compatible Chat Completions endpoint at `https://api.minimax.io/v1`, so
this is a thin config wrapper around the shared `@agiworkforce/providers-openai`
translate/stream layer (same pattern as deepseek/xai/moonshot).

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createMinimaxAdapter(config)` — build a `ProviderAdapter`.
- `minimaxAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `MINIMAX_MODEL_CATALOG` — curated catalog, sourced from `packages/contracts/types/src/models.json`.
- `MINIMAX_DEFAULT_BASE_URL` — default base URL (`https://api.minimax.io/v1`).

## Key Files

- `src/index.ts`
- `src/base-url.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-minimax typecheck`
- `pnpm --filter @agiworkforce/providers-minimax test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-minimax test:live`

## Environment / Secrets

Never commit MiniMax API keys or captured payloads. `MINIMAX_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`api.minimax.io` / `localhost` / `127.0.0.1`, plus any hosts passed via
`additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl` from
`@agiworkforce/provider-runtime`. A disallowed override falls back to the
default base URL rather than being trusted.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
