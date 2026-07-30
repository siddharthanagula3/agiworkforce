# Current Documentation Map

Status: Current
Owner: Docs/platform
Last updated: 2026-07-16

This folder is the compact source-of-truth layer for AGI Workforce. It replaces the older pattern where product, architecture, launch, pricing, scaling, and handoff decisions were scattered across long top-level docs.

## Read Order

1. [`source-of-truth.md`](./source-of-truth.md) - single product definition, v1 target, current repo position, parity baseline, P0 gaps, docs rule, and verification rule.
2. [`agi-product-requirements.md`](./agi-product-requirements.md) - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
3. [`parity-implementation-matrix.md`](./parity-implementation-matrix.md) - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
4. [`frontend-experience-contract.md`](./frontend-experience-contract.md) - canonical six-surface UI architecture, layouts, screens, components, event rendering, settings, ownership, and completion rules.
5. [`trust-mode-surface-matrix.md`](./trust-mode-surface-matrix.md) - exact Local, BYOK, Managed Cloud, persistence, and sync behavior per surface.
6. [`byok-open-model-provider-strategy.md`](./byok-open-model-provider-strategy.md) - BYOK provider classes, hosted open-model APIs, open model priorities, and Desktop model-selector rules.
7. [`product-suite.md`](./product-suite.md) - product thesis, surfaces, trust modes, parity target, and current scope.
8. [`technical-architecture.md`](./technical-architecture.md) - monorepo shape, runtime boundaries, data ownership, provider strategy, and generated-file architecture.
9. [`provider-capability-matrix.md`](./provider-capability-matrix.md) - provider route capabilities, privacy claims, and routing constraints.
10. [`commercial-and-launch.md`](./commercial-and-launch.md) - bootstrap-safe monetization, enterprise posture, and launch rules.
11. [`agent-and-repo-operability.md`](./agent-and-repo-operability.md) - repo organization, docs rules, agent-native workflow, and A+ criteria.
12. [`ci-deployment-policy.md`](./ci-deployment-policy.md) - green-CI production promotion, exact-SHA/path gates, protected configuration, and runner-minute budget.
13. [`../engineering/naming-conventions.md`](../engineering/naming-conventions.md) - locked naming rules for product, CLI, repo files, packages, branches, commits, docs, and releases.

## Canonical Root Docs

- Root [`PLAN.md`](../../PLAN.md) is the active transition plan.
- Root [`TODO.md`](../../TODO.md) is the active execution queue.
- Root [`CHANGELOG.md`](../../CHANGELOG.md) records completed work.
- [`docs/decisions/CURRENT_DECISIONS.md`](../decisions/CURRENT_DECISIONS.md) records locked decisions and conflict rules.
- [`docs/agent-context/`](../agent-context/) is the machine-readable agent context layer.
- [`docs/engineering/naming-conventions.md`](../engineering/naming-conventions.md) is the naming convention lock.

## Point-In-Time Research

Current docs may cite dated evidence under [`../research`](../research/). Research files record what was observed at a specific time; they do not override this folder, source code, current official documentation, or locked decisions.

## Archived Source Material

The former `docs/archive/` directory was removed. Do not recreate it. Historical or point-in-time material that remains useful belongs in the correctly classified existing docs area and never overrides current source-of-truth documents.

## Rule

If a current doc and an archived doc conflict, the current doc wins. If two current docs conflict, update `docs/decisions/CURRENT_DECISIONS.md` and the conflicting docs in the same change.
