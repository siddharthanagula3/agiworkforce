# Jev Auto routing implementation sequence

Status: Planned; implementation tasks have not started
Owner: Provider/platform owner, with Managed inference and billing owners
Last updated: 2026-09-19

Design: [spec.md](spec.md) and [plan.md](plan.md). Each slice should be independently
reviewable. The feature remains off until the rollout evidence is complete.

## 1. Contracts and registry

- [ ] Add provider-neutral evaluation contracts in shared types and an explicit
      evaluation route capability in registry schemas. Keep chat interfaces intact.
- [ ] Verify the Gateway route, model identity, account availability, retention,
      residency, pricing and limits; record facts in their existing curation owners.
- [ ] Add compiled semantic-assessment policy and optional assessed-floor input.
      Default all runtime activation off; preserve existing resolver decisions
      when the new input is absent.
- [ ] Regenerate through `pnpm sync:models`; verify no evaluator enters chat
      pickers, Auto generator pools or implicit fallback chains.

## 2. Gateway evaluator

- [ ] Add the SDK through the package manager in the existing Gateway provider
      package, export evaluation separately, and construct it with resolved
      credentials and the correct admitted endpoint.
- [ ] Normalize Choice, Score, Boolean, confidence metadata, usage, model identity
      and sanitized errors. Validate responses against the submitted questions.
- [ ] Test real HTTP boundary behavior with a controlled transport: no hidden
      retries, cancellation propagation, deadline enforcement and malformed output.
- [ ] Run a bounded authenticated smoke call on synthetic state. Record its
      actual response contract and cost; a mocked response is not this evidence.

## 3. Pure assessment policy and offline evaluation

- [ ] Add versioned question definitions to the prompt manifest; bind the entire
      structured definition, including criteria and state-builder revision, to
      its immutable stamp. Never rewrite a shipped definition.
- [ ] Implement the state builder and assessment interpretation outside SDK code.
      Keep semantic task type, structural family and fixed requirements distinct.
- [ ] Implement accepted-assessment composition, family compatibility, floor
      enforcement, explicit Auto-profile preservation and complete baseline fallback.
- [ ] Verify confident keyword mistakes, short hard tasks, incompatible labels,
      multimodal bypass, unavailable quality floors and unsupported languages.
- [ ] Extend the existing eval harness with a versioned held-out routing corpus,
      task-type-only ablation and paired downstream generator measurements.

## 4. Managed coordinator, accounting and traces

- [ ] Add evaluator egress admission, bounded concurrency, shared quotas, platform
      spend reservation, cancellation and same-turn deduplication. Exclude active
      free-lane and media-dependent workloads initially.
- [ ] Integrate after evaluator data policy is known and before final model
      resolution; freeze baseline inputs and keep tool assembly side-effect-free
      across comparison branches.
- [ ] Record separate assessment COGS with sub-cent precision, unknown-cost
      reconciliation and no extra customer debit in shadow/canary. Extend the
      existing writer that currently rounds provider cents before microUSD
      conversion; test costs below one cent and insert/reconciliation races.
- [ ] Extend the served trace with semantic provenance and an idempotent merge
      for post-response results. Test insert/merge/completion races and existing
      generator-shadow coexistence.
- [ ] Register semantic off/shadow/canary/active modes and conversation-stable
      targeting in existing server feature flags; test emergency rollback.

## 5. Evidence and activation

- [ ] Declare numerical gates and sample sizes from measured baselines before
      inspecting the held-out test results. Keep tuning examples disjoint.
- [ ] Run approved shadow sampling across local confidence levels; publish
      coverage, disagreement, latency and spend, with unknown outcomes explicit.
- [ ] Resolve the release questions in the architecture. Run a measured canary
      only for evaluated workloads and permitted workspaces.
- [ ] Compare quality, cost per successful task and end-to-end latency against a
      concurrent control; verify the off switch and expand only passing cohorts.

## Validation by changed owner

Use [the command inventory](../../agent-context/commands.json) and package
manifests at implementation time. Existing targeted commands include:

- `pnpm --filter @agiworkforce/providers-vercel-gateway typecheck`
- `pnpm --filter @agiworkforce/providers-vercel-gateway test`
- `pnpm --filter @agiworkforce/routing typecheck`
- `pnpm --filter @agiworkforce/routing test`
- `pnpm --filter @agiworkforce/web test` with the changed test files
- `pnpm exec vitest run tools/evals`
- `pnpm exec tsc --noEmit -p tools/evals/tsconfig.json`
- `pnpm sync:models:check`, `pnpm check:boundaries`, and affected trust-boundary,
  provider-contract, model-catalog and documentation guards

Passing unit tests or replaying reference fixtures validates implementation and
the harness. Live outcome measurements are separate rollout evidence.
