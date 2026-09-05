# docs/development

Status: Current
Owner: Platform lead
Last updated: 2026-09-05

How to work in this repository: setup, commands, testing, debugging, migrations,
CI, and the agent and parallel-agent workflows.

Conventions the code must follow belong in `docs/standards/`; this tier is about
the process, not the rules.

## Read first

1. [`../agent-context/`](../agent-context/), machine-readable maps, risk areas,
   commands, known flaws, and task templates.
2. [`agent-workflow.md`](./agent-workflow.md), how humans and coding agents
   split work, use worktrees, and verify changes, including parallel lanes.
3. [`harness-rollout.md`](./harness-rollout.md), context, hooks, skills,
   plugins, LSP/MCP, and subagent rollout order.
4. [`../standards/service-layer.md`](../standards/service-layer.md), action and
   route orchestration versus reusable service mechanics.
5. [`../standards/naming-conventions.md`](../standards/naming-conventions.md).
   locked names for product, CLI, files, folders, packages, branches, commits,
   docs, and releases.
6. [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md), contribution workflow and
   PR expectations.

## How-to guides

- [`add-a-gateway.md`](./add-a-gateway.md), the five steps to add an OpenAI-
  or Anthropic-compatible gateway to the model registry without a dedicated
  provider package.

## What belongs here

- Engineering workflow rules.
- Review routing and risk classification.
- Agent, session, and worktree conventions.
- Repo-operability guidance that cuts across surfaces.

## What does not belong here

- Rules the code follows: those are `docs/standards/`, including service-layer
  extraction and naming.
- Product requirements: those are `docs/product/`.
- Surface-specific runbooks: those live with the surface, or in
  `docs/runbooks/` when they cross surfaces.
- Historical research: dated findings go in `docs/research/`, durable defects
  in `docs/agent-context/known-flaws.md`. Root `audit/` is the live evidence
  ledger and triage root, not historical research or proof of completion.
