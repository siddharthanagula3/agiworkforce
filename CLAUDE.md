# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Status: Current
Owner: Platform lead
Last updated: 2026-06-03

Claude-specific notes for Claude Code. `AGENTS.md` is the canonical tool-neutral agent entry point - read it first; `docs/current/source-of-truth.md` is the compact product source of truth, `docs/current/agi-product-requirements.md` is the long-form PRD and Mobile-first release spec, `docs/current/parity-implementation-matrix.md` is the feature-by-feature implementation map, and `docs/current/byok-open-model-provider-strategy.md` is the BYOK/open-model provider map. The repo map, locked product rules, hook policy, and bug-finding workflow live in `AGENTS.md`, `docs/current/`, and `docs/agent-context/`. This file mirrors critical safety/product rules so Claude Code sees them directly, while detailed maps and command inventories stay in `AGENTS.md` and `docs/agent-context/`.

The repo is a pnpm + cargo monorepo with seven surfaces under `apps/` (cli, desktop, web, mobile, extension, extension-vscode, sandbox), shared TS under `packages/`, shared Rust under `crates/`, backend stubs in `services/`, and canonical migrations in `apps/web/db/neon`. Path-scoped `AGENTS.md` files at each high-risk surface (`apps/{cli,desktop,web,mobile,extension,extension-vscode}/AGENTS.md`, `packages/providers/AGENTS.md`, `services/AGENTS.md`) add local rules — read the nearest one before editing.

## Claude-Specific Notes

- Follow `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/current/agi-product-requirements.md`, `docs/current/parity-implementation-matrix.md`, `docs/current/byok-open-model-provider-strategy.md` for model/provider/BYOK work, `docs/agent-context/README.md`, `docs/agent-context/local-reference-lessons.md`, `docs/engineering/agent-native-development.md`, and `docs/agent-context/known-flaws.md` before using older launch plans.
- Follow `docs/engineering/agent-harness-rollout.md` for Claude Code-style context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
- Follow `docs/engineering/naming-conventions.md` for product names, CLI command examples, file/folder names, commits, and hooks.
- Follow `docs/engineering/service-layer-architecture.md` when extracting repeated route/action/command mechanics into shared services.
- PR bodies: do not include footers like `🤖 Generated with [Claude Code]`. Keep PR descriptions clean and focused on the work.
- Keep Claude memory and `.claude/` project files as tool-specific context, not the repo source of truth.
- Do not duplicate repo maps or command lists here. Update `AGENTS.md` and `docs/agent-context/*` instead.
- If Claude Code finds a repeated bug class, update `docs/agent-context/known-flaws.md`.
- If a Claude-specific workflow needs local config, keep it under `.claude/` and document the contract before moving files.

## Critical Rules

These rules must stay mirrored in `AGENTS.md` and guarded by `pnpm check:agent-context`.

- Verify current facts from repo files, official docs, web search, or configured plugins/MCP before changing fast-moving APIs, model IDs, pricing, App Store rules, provider terms, framework behavior, or release claims.
- Read model IDs from `packages/types/src/models.json` and provider capability metadata. Never invent, guess, or hardcode a model ID from training data.
- Next.js 16 uses `proxy.ts` and an exported `proxy` function. Do not rename it back to `middleware.ts`.
- Local, BYOK, and Managed Cloud are separate trust boundaries.
- Never silently route Local chats, files, or developer sessions to BYOK or managed cloud.
- Local to BYOK must be an explicit fork/continuation with context selection, secret scan, payload preview, user consent, and visible provider label.
- Managed cloud is in public alpha and open by default — the private-beta/waitlist launch gate has been removed (founder decision, 2026-06-27). The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains ONLY as an incident-response kill-switch (set to `0`/`false`/`off` to re-gate). Billing, metering, abuse, fraud, refunds, chargebacks, provider terms, retention, and deletion controls must keep pace with public usage, but they no longer gate access.
- Do not invent APIs, routes, env vars, schemas, prompts, docs, or release status. If the repo does not prove it, mark it unknown or add a tracked gap.
- Do not mark work complete from build success alone. Inspect relevant files, run surface checks, inspect `git status`/diff, and record unresolved risks.
- Treat unusual product behavior as a bug, not as background noise: unreadable UI, dead or duplicate controls, unexpected redirects, visible console/network errors, stale provider/model labels, fake availability badges, and confusing auth or upgrade gates must be fixed immediately when reproducible, or recorded as a concrete blocker with evidence.
- Do not treat generated audit/report markdown as remediation. Audit files are triage queues: open the cited source files, confirm the issue in implementation, patch production paths when safe, and only summarize after code changes or explicit blocked risks are recorded.
- Use the nearest path-scoped `AGENTS.md` before editing high-risk areas.
- Follow `AGENTS.md` LLM Failure Prevention Rules and `docs/agent-context/llm-failure-taxonomy.json`. In particular, do not leave fake tests, swallowed mock assertions, production stubs, vulnerable dependency ranges, or unvalidated tool/LLM/API/IPC inputs; `pnpm check:llm-failures` is the fast guardrail, `pnpm check:llm-failures:staged` protects new staged work, and `pnpm check:llm-failures:strict` applies the broader taxonomy scan.

## Surface Subagents

The seven per-surface subagent definitions previously in `.claude/agents/` were retired on 2026-07-08 during the monorepo restructure (see `docs/plans/monorepo-restructure-2026-07-08.md`). Dispatch general-purpose subagents briefed with surface context from `docs/agent-context/repo-map.json` and the nearest path-scoped `AGENTS.md`. When the user has narrowed scope to a specific surface ("just apps/desktop", "your specific X"), edit directly instead of delegating.

## Required Checks For Agent-Context Changes

```bash
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
pnpm check:service-layer
pnpm check:hooks
```

For implementation work, use the surface commands in `docs/agent-context/commands.json`.
