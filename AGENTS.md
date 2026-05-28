# AGENTS.md

Status: Current
Owner: Platform lead
Last updated: 2026-05-28

Canonical tool-neutral agent entry point for AGI Workforce.

This file is for Codex, Claude Code, Cursor, VS Code agents, opencode, Antigravity-style agents, and future coding agents. Tool-specific files must point back here instead of duplicating repo truth. They may mirror the critical rules below so agents do not miss safety/product invariants.

Path-scoped `AGENTS.md` files under high-risk surfaces add local rules; read the nearest one before editing.

## After This File

Core read order:

1. `docs/current/source-of-truth.md` - product definition, v1 target, current repo position, parity baseline, P0 gaps, docs rule, and verification rule.
2. `docs/current/agi-product-requirements.md` - long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete feature requirements.
3. `docs/current/parity-implementation-matrix.md` - feature, option, component, contract, surface, source, and current-status matrix for implementation agents.
4. `docs/current/byok-open-model-provider-strategy.md` when touching model/provider/BYOK work.
5. `docs/agent-context/repo-map.json` - surfaces, owner roles, and checks.
6. `docs/agent-context/known-flaws.md` - open bugs, stale claims, and cleanup debt.
7. `docs/agent-context/commands.json` - canonical commands by surface.
8. Nearest path-scoped `AGENTS.md` before editing a high-risk surface.
9. `docs/decisions/CURRENT_DECISIONS.md` when a decision conflict appears.
10. `PLAN.md` and `TODO.md` when planning or queueing work.

On-demand context:

- `docs/agent-context/README.md` - full agent context map and rules.
- `docs/agent-context/lanes.json` - write lanes for 15+ parallel agents.
- `docs/agent-context/shared-files.md` - shared-file and collision policy.
- `docs/agent-context/risk-map.json` - high-risk paths and required review focus.
- `docs/engineering/agent-native-development.md` - parallel agent/worktree and verification workflow.
- `docs/engineering/naming-conventions.md` - naming, root docs, CLI command, package, branch, commit, version, and hook policy.
- `docs/engineering/agent-harness-rollout.md` - context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
- `docs/engineering/service-layer-architecture.md` - action/route orchestration vs reusable service mechanics.
- `docs/engineering/parallel-agent-playbook.md` - concrete 15+ agent operating procedure.

When these files conflict with older plans, prefer the list above.

## Critical Rules

These rules must stay mirrored in `CLAUDE.md` and guarded by `pnpm check:agent-context`.

- Verify current facts from repo files, official docs, web search, or configured plugins/MCP before changing fast-moving APIs, model IDs, pricing, App Store rules, provider terms, framework behavior, or release claims.
- Read model IDs from `packages/types/src/models.json` and provider capability metadata. Never invent, guess, or hardcode a model ID from training data.
- Next.js 16 uses `proxy.ts` and an exported `proxy` function. Do not rename it back to `middleware.ts`.
- Local, BYOK, and Managed Cloud are separate trust boundaries.
- Never silently route Local chats, files, or developer sessions to BYOK or managed cloud.
- Local to BYOK must be an explicit fork/continuation with context selection, secret scan, payload preview, user consent, and visible provider label.
- Managed cloud, compute credits, top-ups, subscriptions, and provider-funded compute stay waitlist/private beta until ledgering, abuse, fraud, refunds, chargebacks, provider terms, retention, and deletion controls are proven.
- Do not invent APIs, routes, env vars, schemas, prompts, docs, or release status. If the repo does not prove it, mark it unknown or add a tracked gap.
- Do not mark work complete from build success alone. Inspect relevant files, run surface checks, inspect `git status`/diff, and record unresolved risks.
- Use the nearest path-scoped `AGENTS.md` before editing high-risk areas.

## Product Lock

AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app or CLI.

The compact product source of truth is `docs/current/source-of-truth.md`.

Locked differentiation:

- Local-first privacy.
- Explicit BYOK.
- Multi-provider routing.
- Privacy-controlled managed compute.

Managed cloud/credits remain waitlist or private beta until metering, fraud, refunds, chargebacks, abuse controls, provider terms, retention, and deletion are proven.

## Repo Map

| Area          | Path                           | Role                                                              |
| ------------- | ------------------------------ | ----------------------------------------------------------------- |
| CLI           | `apps/cli`                     | Developer engine and terminal surface.                            |
| Desktop       | `apps/desktop`                 | Local-private compute host and rich app shell.                    |
| Web           | `apps/web`                     | Account, projects, synced app chats, artifacts, billing/waitlist. |
| Mobile        | `apps/mobile` plus root `ios/` | Local/BYOK onboarding, continuity, approvals, preview/share.      |
| Chrome        | `apps/extension`               | Browser context, capture, native messaging.                       |
| VS Code       | `apps/extension-vscode`        | IDE-native developer surface.                                     |
| Sandbox       | `apps/sandbox`                 | Cross-origin artifact renderer.                                   |
| Shared TS     | `packages`                     | Contracts, providers, runtime, UI, tools.                         |
| Shared Rust   | `crates`                       | Protocol, command registry, sandbox, runtime utilities.           |
| Services      | `services`                     | API gateway, signaling, future managed compute.                   |
| Database      | `supabase`                     | Canonical migrations.                                             |
| Evidence      | `audit`                        | Source-backed parity and audit ledgers.                           |
| Durable docs  | `docs`                         | Current product, architecture, decisions, launch, security.       |
| Working notes | `tasks`                        | Execution notes and temporary research.                           |

Machine-readable version: `docs/agent-context/repo-map.json`.

## Non-Negotiables

- Public brand is `AGI`; formal platform name is `AGI Workforce`.
- User-facing CLI examples use `agi`; `agiworkforce` remains only as a compatibility alias or internal repo/package/crate identifier.
- Never silently route Local chats or developer sessions to BYOK or managed cloud.
- Local to BYOK is an explicit fork/continuation with context selection, secret scan, payload preview, and visible provider label.
- Normal chat sync is only for Web, Mobile, and Desktop.
- CLI, VS Code, and Chrome stay local/workspace/task scoped unless the user explicitly hands off a redacted preview.
- Do not hardcode model IDs; use model catalogs and provider capability metadata.
- Do not copy proprietary code. Open-source reuse needs compatible license handling and `THIRD_PARTY_LICENSES.md`.
- Do not combine file moves with behavior changes.
- Do not move `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, or `.mcp.json` until their tool contracts are classified.
- Check `docs/agent-context/known-flaws.md` before reporting a bug as new.
- Do not add new root control docs. Use `PLAN.md`, `TODO.md`, `CHANGELOG.md`, `docs/current`, `docs/plans`, `audit`, `reports`, and `docs/archive` as defined in `docs/engineering/naming-conventions.md`.
- Keep root context lean. Put durable local rules in path-scoped `AGENTS.md` files, surface READMEs, and `docs/agent-context` maps instead of expanding this file.
- Keep orchestration and mechanics separate: actions, routes, and command handlers own product policy and state transitions; reusable provider, sandbox, database, generated-file, browser/computer-use, and transport mechanics belong in explicit service functions.

## Commands

Canonical command map: `docs/agent-context/commands.json`.

Common commands:

```bash
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
pnpm check:structure-conventions
pnpm check:mobile-hygiene
pnpm check:service-layer
pnpm check:hooks
pnpm check:llm-operability
pnpm lint
pnpm lint:extension
pnpm typecheck:all
pnpm test
cargo check --workspace
```

Surface-specific commands should come from `docs/agent-context/commands.json` or the surface `package.json`/`Cargo.toml`.

## Hooks And Local Gates

Hook policy is part of repo organization and is enforced by `pnpm check:hooks`.

- `commit-msg` runs commitlint with Conventional Commits.
- `pre-commit` runs lint-staged, then fast structure and agent-context checks.
- `pre-push` runs `pnpm check:llm-operability`, `git diff --check`, and `git diff --cached --check`.
- Use `SKIP_PRE_PUSH=1` only for emergency pushes; record skipped checks in the PR or handoff.

## Agent Harness

Harness order is locked in `docs/engineering/agent-harness-rollout.md`: lean context files, deterministic hooks, on-demand skills, distributable plugins, LSP/MCP integrations, then subagents for separated exploration and editing.

## Bug-Finding Workflow

1. Identify the surface or boundary in `docs/agent-context/repo-map.json`.
2. Check `docs/agent-context/known-flaws.md`.
3. Check `docs/agent-context/risk-map.json`.
4. Search with `rg`, starting from the owner paths.
5. Reproduce with the smallest command from `docs/agent-context/commands.json`.
6. Fix narrowly, add tests near the owner area, and update known flaws if the issue was already tracked.

High-signal search examples live in `docs/agent-context/bug-finding-guide.md`.

## Current Organization Work

The active cleanup plan is `docs/plans/pre-release-repo-organization-2026-05-20.md`.

Order is locked:

1. Inventory/classification.
2. Agent context and bug-finding maps.
3. Guardrail scripts.
4. Root/docs/package cleanup.
5. Web, Mobile, then Desktop domain-first moves.

Do not start broad domain-folder moves until the guardrails pass.
