# Provider Packages

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: provider-package
Criticality: high

## Purpose

`packages/ai/providers` contains provider-specific adapters for model APIs and local runtimes. These packages translate vendor/local provider behavior into AGI-owned schemas and event contracts.

## Consumers

- Web and services for BYOK/Managed provider calls.
- Desktop and CLI-adjacent runtime code where direct local/BYOK provider access is supported through shared contracts.
- Routing and runtime packages.

## Public API / Exports

Each provider leaf package owns its own `package.json#exports`, usually
`./src/index.ts`. Cross-provider deployables construct adapters through
`@agiworkforce/providers-factory`; provider-specific implementation packages
may depend on another leaf's public API for protocol compatibility.

Current leaf packages:

- `anthropic`
- `deepseek`
- `google`
- `lmstudio`
- `minimax`
- `moonshot`
- `ollama`
- `openai`
- `openrouter`
- `perplexity`
- `qwen`
- `xai`
- `zhipu`

Composition package:

- `factory` — maps canonical provider IDs to leaf constructors while leaving
  credentials, endpoint policy, routing, and product modes in each deployable.

Do not import provider leaf internals from apps. Apps and multi-provider services
use the aggregate factory; provider-specific code uses leaf package public exports.

## What Belongs Here

- Provider transport/client adapters.
- Provider-specific request/response normalization.
- Capability metadata and model-provider behavior.
- BYOK-safe defaults and provider error mapping.

## What Does Not Belong Here

- AGI-owned provider interface definitions; those belong in `packages/contracts/types`.
- Cross-provider routing decisions; those belong in `packages/ai/routing`.
- UI code.
- Billing/credit ledger logic.
- Managed gateway defaults for Local or strict BYOK.

## Key Files

- `<provider>/src/index.ts` - public adapter export.
- `<provider>/package.json` - package boundary and commands.
- `factory/src/index.ts` - cross-deployable adapter-construction registry.
- Shared provider strategy: `docs/current/byok-open-model-provider-strategy.md`. (The former `audit/` evidence directory was removed repo-wide on 2026-06-28.)

## Commands

- `pnpm --filter @agiworkforce/providers-openai test`
- `pnpm --filter @agiworkforce/providers-anthropic test`
- `pnpm --filter @agiworkforce/providers-google test`
- `pnpm --filter './packages/ai/providers/*' --if-present typecheck`

## Environment / Secrets

Provider API keys must come from user BYOK config, local env, or managed-secret stores depending on provider mode. Never commit API keys, live provider test keys, OAuth tokens, or captured provider payloads.

## Security, Privacy, Data Boundaries

Security/privacy review is required for request payload construction, file upload, storage/retention flags, provider base URLs, model routing, tool calls, streaming, error logging, and Managed gateway paths.

Local and BYOK should default to minimum provider retention. Managed paths must be explicitly labeled and gated.

## Tests Required For Changes

- Adapter change: add/update normalization tests and negative error tests.
- Provider SDK upgrade: verify streaming, tool calls, files, and storage flags.
- Live tests must stay opt-in behind `AGIWORKFORCE_LIVE_TEST=1`.

## Release / Deployment Notes

Provider behavior affects trust. Release notes should call out provider-mode, retention, tool, file, and model-routing changes.

## Known Caveats

- OpenAI Responses support should become the preferred native OpenAI path only after adapter tests prove privacy defaults.

## CODEOWNERS

Primary: Provider/platform owner.
Secondary: security/privacy for keys, payloads, retention, base URLs, files, tools, and Managed gateway paths.
