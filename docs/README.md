# AGI Documentation Index

Status: Current
Owner: Docs/platform
Last updated: 2026-06-05

This directory contains durable AGI Workforce documentation. The active docs graph is intentionally small: start in `docs/current`, then follow links to decisions, agent context, surface guides, enterprise docs, or audit evidence only when needed.

## Start Here

1. [`current/`](./current/) - compact current source-of-truth docs.
2. [`../PLAN.md`](../PLAN.md) - active Anthropic/OpenAI-style application-suite transition plan.
3. [`../TODO.md`](../TODO.md) - active execution checklist.
4. [`../CHANGELOG.md`](../CHANGELOG.md) - completed work log.
5. [`decisions/CURRENT_DECISIONS.md`](./decisions/CURRENT_DECISIONS.md) - locked decisions and conflict rules.
6. [`agent-context/`](./agent-context/) - machine-readable maps for coding agents.

## Current Docs

| Doc                                                                                | Purpose                                                                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`current/product-suite.md`](./current/product-suite.md)                           | Product thesis, surfaces, trust modes, parity target, and current scope.                                       |
| [`current/technical-architecture.md`](./current/technical-architecture.md)         | Monorepo shape, runtime boundaries, provider strategy, generated-file architecture, and enterprise foundation. |
| [`current/commercial-and-launch.md`](./current/commercial-and-launch.md)           | Bootstrap-safe monetization, waitlist/private-beta gates, enterprise posture, and launch rules.                |
| [`current/agent-and-repo-operability.md`](./current/agent-and-repo-operability.md) | Repo organization, docs rules, agent-native workflow, and A+ criteria.                                         |

## Operational Docs

| Folder                               | Purpose                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`agent-context/`](./agent-context/) | Repo map, risk map, lane map, canonical commands, known flaws, and agent task templates.                            |
| [`engineering/`](./engineering/)     | Naming conventions, agent-native development, parallel-agent work, review workflow, and autonomous company roadmap. |
| [`enterprise/`](./enterprise/)       | Enterprise control plane, managed-compute gates, and profit-first readiness.                                        |
| [`surfaces/`](./surfaces/)           | One guide per shipping surface.                                                                                     |
| [`plans/`](./plans/)                 | Active or recent implementation plans.                                                                              |
| [`decisions/`](./decisions/)         | ADRs and current decision index.                                                                                    |
| [`security/`](./security/)           | Security reviews, findings, and red-team notes.                                                                     |
| [`api/`](./api/)                     | OpenAPI, Postman collection, and API examples. Rebuild-required until verified against current routes.              |
| [`launch/`](./launch/)               | Launch copy, store listings, and channel drafts.                                                                    |
| [`marketing/`](./marketing/)         | Marketing and GTM operator workspace.                                                                               |
| [`support/`](./support/)             | Support operations and customer feedback workspace.                                                                 |
| [`legal/`](./legal/)                 | Legal/compliance workspace.                                                                                         |
| [`research/`](./research/)           | Durable research summaries and delegated research prompt banks.                                                     |

## Archived Docs

Older long-form PRD, roadmap, pricing, hosting, scaling, ownership, handoff, strategy, audit, screenshot, and prototype docs were moved to [`archive/2026-05-21-docs-consolidation/`](./archive/2026-05-21-docs-consolidation/) and [`archive/2026-06-05-doc-reset/`](./archive/2026-06-05-doc-reset/).

Archived docs are source material only. They can explain why older decisions happened, but they do not override `docs/current`, root `PLAN.md`, root `TODO.md`, or `docs/decisions/CURRENT_DECISIONS.md`.

## Rules

- Current docs must include `Status`, `Owner`, and `Last updated`.
- New files, folders, packages, branches, releases, and root control docs must follow [`engineering/naming-conventions.md`](./engineering/naming-conventions.md).
- Do not add new top-level long-form product docs. Put compact current docs in `docs/current`, plans in `docs/plans`, evidence in `audit`, and historical material in `docs/archive`.
- Run `pnpm check:llm-operability` after docs, agent-context, or structure changes.
