# @agiworkforce/providers-qwen

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-08
Kind: provider-package
Criticality: medium

## Purpose

Qwen (Alibaba) provider adapter using AGI-owned provider contracts. Defaults
to Alibaba DashScope's **OpenAI-compatible mode**
(`https://dashscope.aliyuncs.com/compatible-mode/v1`), not DashScope's native
generation API — see "Judgment call" below.

## Consumers

Services, Web, Desktop, routing/runtime code, and BYOK/Managed provider flows.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

- `createQwenAdapter(config)` — build a `ProviderAdapter`.
- `qwenAdapterFactory` — `ProviderAdapterFactory`-shaped export for registries.
- `QWEN_MODEL_CATALOG` — curated catalog, sourced from `packages/contracts/types/src/models.json`.
- `QWEN_DEFAULT_BASE_URL`, `applyQwenBaseUrlQuirks` — base-URL resolution (see `src/base-url.ts`).

## Judgment call: DashScope compatible-mode default, not native

`apps/web/lib/llm-providers/qwen.ts` (the source of truth for this port)
defaults to DashScope's **native** generation API
(`https://dashscope.aliyuncs.com/api/v1`, request shape `{ input: { messages },
parameters }`, not OpenAI Chat Completions shape). That native endpoint does
not support streaming or tool calling — the web adapter's own
`streamRequest()` throws unconditionally when the base URL is still the
native default, and `sendDashScopeRequest()` throws if the request includes
tools.

`ProviderAdapter.stream()` is this package's only entry point
(streaming-first, OpenAI Chat Completions shape via
`@agiworkforce/providers-openai`), so the native endpoint cannot be
implemented here without a second, fundamentally different translator. This
adapter defaults to DashScope's OpenAI-compatible mode instead — already a
bundled `modelstudio-native` endpoint in `@agiworkforce/provider-protocol`, and
the same mode the web adapter itself requires for streaming via
`QWEN_BASE_URL`. A caller can still point `baseUrl` at the native `/api/v1`
path; requests will simply fail against it since this adapter only speaks
the OpenAI-compatible shape. A real DashScope-native, non-streaming,
tool-free integration belongs in a separate adapter/path, not bolted onto
this one.

## Other quirk: MuleRouter path

MuleRouter (`https://api.mulerouter.ai`) is an alternate OpenAI-compatible
gateway supported by the web adapter; its compatible routes live under
`/vendors/openai/v1`, not the host root. `applyQwenBaseUrlQuirks` appends
that path automatically when the configured host is `api.mulerouter.ai`.

## What Does Not Belong Here

- Cross-provider routing policy.
- UI code.
- Billing ledger logic.
- DashScope-native (non-compatible-mode) request/response handling.

## Key Files

- `src/index.ts`
- `src/base-url.ts`
- `package.json`

## Commands

- `pnpm --filter @agiworkforce/providers-qwen typecheck`
- `pnpm --filter @agiworkforce/providers-qwen test`
- `AGIWORKFORCE_LIVE_TEST=1 pnpm --filter @agiworkforce/providers-qwen test:live`

## Environment / Secrets

Never commit Qwen API keys or captured payloads. `QWEN_API_KEY`.

## Security, Privacy, Data Boundaries

A caller-supplied `baseUrl` override is validated against an allowlist
(`dashscope.aliyuncs.com` / `dashscope-intl.aliyuncs.com` /
`api.mulerouter.ai` / `localhost` / `127.0.0.1`, plus any hosts passed via
`additionalAllowedBaseUrlHosts`) via `resolveValidatedBaseUrl` from
`@agiworkforce/provider-runtime`. A disallowed override falls back to the default
base URL rather than being trusted. The shared validation mechanics live in
`@agiworkforce/provider-runtime`.

## Tests Required For Changes

Add adapter tests for request shape, errors, and compatibility behavior. Any
change to base-URL resolution needs a regression test in `base-url.test.ts`.

## Release / Deployment Notes

Coordinate capability changes with routing. Flag the compatible-mode-default
judgment call above if a future change needs true DashScope-native behavior.

## Known Caveats

Adapter depends on OpenAI-compatible behavior (`@agiworkforce/providers-openai`
translate/stream reuse). Does not implement DashScope's native generation API.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy.
