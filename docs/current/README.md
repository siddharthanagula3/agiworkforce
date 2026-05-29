# Current Documentation Map

Status: Current
Owner: Docs/platform
Last updated: 2026-05-28

This folder is the compact source-of-truth layer for AGI Workforce. It replaces the older pattern where product, architecture, launch, pricing, scaling, and handoff decisions were scattered across long top-level docs.

## Read Order

1. [`source-of-truth.md`](./source-of-truth.md) - single product definition, v1 target, current repo position, parity baseline, P0 gaps, docs rule, and verification rule.
2. [`agi-product-requirements.md`](./agi-product-requirements.md) - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
3. [`parity-implementation-matrix.md`](./parity-implementation-matrix.md) - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
4. [`byok-open-model-provider-strategy.md`](./byok-open-model-provider-strategy.md) - BYOK provider classes, hosted open-model APIs, open model priorities, and Desktop model-selector rules.
5. [`product-suite.md`](./product-suite.md) - product thesis, surfaces, trust modes, parity target, and current scope.
6. [`technical-architecture.md`](./technical-architecture.md) - monorepo shape, runtime boundaries, data ownership, provider strategy, and generated-file architecture.
7. [`provider-capability-matrix.md`](./provider-capability-matrix.md) - provider route capabilities, privacy claims, and routing constraints.
8. [`commercial-and-launch.md`](./commercial-and-launch.md) - bootstrap-safe monetization, waitlist/private-beta gates, enterprise posture, and launch rules.
9. [`agent-and-repo-operability.md`](./agent-and-repo-operability.md) - repo organization, docs rules, agent-native workflow, and A+ criteria.
10. [`../engineering/naming-conventions.md`](../engineering/naming-conventions.md) - locked naming rules for product, CLI, repo files, packages, branches, commits, docs, and releases.

## Canonical Root Docs

- Root [`PLAN.md`](../../PLAN.md) is the active transition plan.
- Root [`TODO.md`](../../TODO.md) is the active execution queue.
- Root [`CHANGELOG.md`](../../CHANGELOG.md) records completed work.
- [`docs/decisions/CURRENT_DECISIONS.md`](../decisions/CURRENT_DECISIONS.md) records locked decisions and conflict rules.
- [`docs/agent-context/`](../agent-context/) is the machine-readable agent context layer.
- [`docs/engineering/naming-conventions.md`](../engineering/naming-conventions.md) is the naming convention lock.

## Archived Source Material

Older long-form docs moved to `docs/archive/2026-05-21-docs-consolidation/` are historical source material. They can be mined for detail, but they are not current unless a current doc explicitly cites them.

## Rule

If a current doc and an archived doc conflict, the current doc wins. If two current docs conflict, update `docs/decisions/CURRENT_DECISIONS.md` and the conflicting docs in the same change.
