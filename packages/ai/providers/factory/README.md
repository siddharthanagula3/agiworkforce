# Provider Factory

Status: Current
Owner role: Provider/platform owner
Last updated: 2026-07-15
Kind: provider-package
Criticality: high

## Purpose

`@agiworkforce/providers-factory` is the cross-deployable TypeScript composition
boundary for constructing a provider adapter from a canonical provider ID and
an explicit provider configuration.

It owns only leaf-adapter dispatch. It does not read environment variables,
select models, route requests, apply plan policy, choose OpenAI endpoints, or
decide whether Local, BYOK, or Managed Cloud is allowed. Those decisions remain
with the calling runtime or deployable service.

## Consumers

- `apps/web` server routes through the Web managed-provider service.
- `services/api-gateway` through its deployment-local provider configuration.

## Verification

```bash
pnpm --filter @agiworkforce/providers-factory test
pnpm --filter @agiworkforce/providers-factory typecheck
pnpm --filter @agiworkforce/providers-factory lint
```
