# @agiworkforce/llm-runtime

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

Shared LLM runtime abstractions for streaming, events, tool loops, and provider-independent model execution behavior.

## Consumers

Provider packages, services, Web, Desktop, and future managed/private compute runtime code.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Provider-independent LLM runtime interfaces.
- Stream/event normalization helpers.
- Tool-loop scaffolding that remains AGI-owned.

## What Does Not Belong Here

- Vendor SDK clients.
- UI code.
- Billing ledger logic.
- App-specific request handlers.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/llm-runtime typecheck`
- `pnpm --filter @agiworkforce/llm-runtime test`
- `pnpm --filter @agiworkforce/llm-runtime build`

## Environment / Secrets

No secrets belong in this package. Provider keys are passed by callers according to provider mode.

## Security, Privacy, Data Boundaries

Security/privacy review is required for tool calls, file handling, provider storage flags, logging, retries, streaming payloads, and Local/BYOK/Managed routing.

## Tests Required For Changes

Add tests for stream normalization, error mapping, tool-loop behavior, and privacy-mode defaults.

## Release / Deployment Notes

Runtime changes can affect every model provider. Coordinate with provider/platform owner.

## Known Caveats

Vendor SDKs are allowed behind provider adapters, not as the core AGI runtime architecture.

## CODEOWNERS

Primary: Provider/platform owner. Secondary: security/privacy for payload, files, tools, and retention behavior.
