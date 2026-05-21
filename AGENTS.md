# AGENTS.md

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

Canonical tool-neutral agent entry point for AGI Workforce.

This file is for Codex, Claude Code, Cursor, VS Code agents, opencode, Antigravity-style agents, and future coding agents. Tool-specific files must point back here instead of duplicating repo truth.

Path-scoped `AGENTS.md` files under high-risk surfaces add local rules; read the nearest one before editing.

## Read First

1. `docs/agent-context/README.md` - agent read order and rules.
2. `docs/agent-context/repo-map.json` - surfaces, owner roles, and checks.
3. `docs/agent-context/lanes.json` - write lanes for 15+ parallel agents.
4. `docs/agent-context/shared-files.md` - shared-file and collision policy.
5. `docs/agent-context/risk-map.json` - high-risk paths and required review focus.
6. `docs/agent-context/known-flaws.md` - open bugs, stale claims, and cleanup debt.
7. `docs/agent-context/commands.json` - canonical commands by surface.
8. `docs/decisions/CURRENT_DECISIONS.md` - latest locked product decisions.
9. `PLAN.md` and `TODO.md` - active strategy and work queue.
10. `docs/engineering/agent-native-development.md` - parallel agent/worktree and verification workflow.
11. `docs/engineering/naming-conventions.md` - naming, root docs, CLI command, package, branch, commit, version, and hook policy.
12. `docs/engineering/agent-harness-rollout.md` - context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
13. `docs/engineering/parallel-agent-playbook.md` - concrete 15+ agent operating procedure.

When these files conflict with older plans, prefer the list above.

## Product Lock

AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app or CLI.

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

## Commands

Canonical command map: `docs/agent-context/commands.json`.

Common commands:

```bash
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
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
