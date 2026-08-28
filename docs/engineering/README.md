# Engineering

Status: Current
Owner: Platform lead
Last updated: 2026-08-07
Purpose: collect durable engineering workflow, review, and agent-native development guidance that applies across apps, packages, crates, services, and docs.

## Read First

1. [`../agent-context/`](../agent-context/) - machine-readable maps, risk areas, commands, known flaws, and task templates.
2. [`agent-native-development.md`](./agent-native-development.md) - how humans and coding agents split work, use worktrees, and verify changes.
3. [`agent-harness-rollout.md`](./agent-harness-rollout.md) - context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
4. [`service-layer-architecture.md`](./service-layer-architecture.md) - action/route orchestration vs reusable service mechanics.
5. [`naming-conventions.md`](./naming-conventions.md) - locked names for product, CLI, files, folders, packages, branches, commits, docs, and releases.
6. [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) - internal contribution workflow and PR expectations.

## What Belongs Here

- Engineering workflow rules.
- Review routing and risk classification.
- Agent/session/worktree conventions.
- Service-layer extraction rules for repeated operational mechanics.
- Naming conventions for files, packages, docs, branches, commits, and releases.
- Repo-operability guidance that cuts across surfaces.

## What Does Not Belong Here

- Product requirements; use `PLAN.md`, `TODO.md`, and `docs/product/suite.md`.
- Surface-specific runbooks; use `docs/surfaces/` or the owner README near the code.
- Historical research; use `docs/research/` or `docs/agent-context/known-flaws.md`. The former `reports/` and `docs/archive/` directories were removed repo-wide on 2026-06-28; root `audit/` is now the live evidence-ledger and triage root, not historical research or proof of completion.
