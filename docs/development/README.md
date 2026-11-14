# docs/development

Status: Current
Owner: Platform lead
Last updated: 2026-11-11

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

- [`audit/README.md`](../../audit/README.md), the index of open work: blockers,
  gaps, the plan and the live-validation queue.
- [`audit/prior-audits/product-gaps-register.md`](../../audit/prior-audits/product-gaps-register.md), the product completeness
  register: every route, control and state gap across the six surfaces, with
  what it connects to and whether it is complete.
- [`ci-and-deploys.md`](./ci-and-deploys.md), the CI gates, the production and
  staging deploy contract, which deploy workflows are enabled, and the local
  pre-push gate.
- [`troubleshooting.md`](./troubleshooting.md), symptoms whose cause is not where
  the error points.
- [`dead-code-detection.md`](./dead-code-detection.md), `pnpm check:knip`, the
  discovery tool that is not yet a gate.
- [`agent-operability.md`](./agent-operability.md), the source-of-truth map,
  documentation and naming rules, and hook rules for agent-friendly repo upkeep.
- [`add-a-gateway.md`](./add-a-gateway.md), the five steps to add an OpenAI-
  or Anthropic-compatible gateway to the model registry without a dedicated
  provider package.
- [`connectors-setup.md`](./connectors-setup.md), what each directory
  connector needs from the deployment: vendor consoles, the redirect URI,
  permitted scopes, and the exact environment variable names.
- [`local-test-accounts.md`](./local-test-accounts.md), `pnpm dev:accounts`:
  seed, reset and list one local test account per plan and per lane.
- [`plugins-directory.md`](./plugins-directory.md), how the plugin directory
  is ingested from the official marketplace and the public listing, refreshed,
  queried, and installed from into the composer.

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
  in `audit/registers/known-flaws.md`. Root `audit/` is the live evidence
  ledger and triage root, not historical research or proof of completion.
