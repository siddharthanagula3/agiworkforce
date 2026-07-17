# AGENTS.md — Model Registry

This package owns model knowledge. Read the repository root `AGENTS.md` first.

## Editing Rules

- Edit `catalog/models.curation.json`; never edit `packages/contracts/types/src/models.json` directly.
- Treat `catalog/models.synced.json` as upstream-derived. Change it only through the refresh workflow or an evidence-backed correction.
- Verify model IDs, pricing, limits, lifecycle, endpoint support, and provider-native features from current official documentation.
- Keep documentation availability separate from account, region, and route availability. Selectability requires the relevant availability probe or explicit policy.
- Do not describe web search, memory, MCP, sandboxing, code execution, computer use, image generation, or tool discovery as intrinsic model capabilities when they depend on a provider route or AGI harness.
- Do not put subscription tiers, Auto-routing decisions, or surface-specific picker policy in the model identity record.
- Local, BYOK, and Managed Cloud eligibility are separate trust boundaries. Registry membership never authorizes cross-boundary routing.

## Required Verification

Run the smallest relevant checks, then:

```bash
pnpm sync:models:check
pnpm check:model-catalog
pnpm check:availability-invariant
pnpm --filter @agiworkforce/types test
```

When generated request behavior changes, also run the affected provider contract tests and Rust Desktop/CLI consumer tests.

## Compatibility

`packages/contracts/types/src/models.json` remains a generated compatibility artifact while consumers migrate. Preserve it until TypeScript and Rust consumers have moved to explicit generated registry exports.
