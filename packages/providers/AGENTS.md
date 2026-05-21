# Provider Adapter Agent Rules

Status: Current
Owner: Provider/platform owner
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `packages/providers/README.md` and the leaf provider README when present.

## Scope

`packages/providers` owns provider-specific adapters that translate vendor/local APIs into AGI-owned schemas and event contracts.

## High-Risk Areas

- API keys, base URLs, storage/retention flags, request payload construction, streaming, files, tool calls, provider SDK upgrades, error logging, and Managed gateway paths.
- Do not hardcode model IDs or route decisions here when capability metadata should own them.
- Local and BYOK should default to minimum provider retention. Managed paths must be explicitly labeled and gated.

## Verification

- Leaf adapter test, for example: `pnpm --filter @agiworkforce/providers-openai test`
- Provider package typecheck: `pnpm --filter './packages/providers/*' --if-present typecheck`
- Model/routing changes: `scripts/check-no-hardcoded-models.sh`
