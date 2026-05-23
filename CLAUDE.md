# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Status: Current
Owner: Platform lead
Last updated: 2026-05-23

Claude-specific notes for Claude Code. `AGENTS.md` is the canonical tool-neutral agent entry point — read it first; the repo map, locked product rules, hook policy, and bug-finding workflow live there and in `docs/agent-context/`. This file mirrors critical safety/product rules so Claude Code sees them directly, while detailed maps and command inventories stay in `AGENTS.md` and `docs/agent-context/`.

The repo is a pnpm + cargo monorepo with seven surfaces under `apps/` (cli, desktop, web, mobile, extension, extension-vscode, sandbox), shared TS under `packages/`, shared Rust under `crates/`, backend stubs in `services/`, and canonical migrations in `supabase/`. Path-scoped `AGENTS.md` files at each high-risk surface (`apps/{cli,desktop,web,mobile,extension,extension-vscode}/AGENTS.md`, `packages/providers/AGENTS.md`, `services/AGENTS.md`) add local rules — read the nearest one before editing.

## Claude-Specific Notes

- Follow `AGENTS.md`, `docs/agent-context/README.md`, `docs/engineering/agent-native-development.md`, and `docs/agent-context/known-flaws.md` before using older launch plans.
- Follow `docs/engineering/agent-harness-rollout.md` for Claude Code-style context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
- Follow `docs/engineering/naming-conventions.md` for product names, CLI command examples, file/folder names, commits, and hooks.
- Follow `docs/engineering/service-layer-architecture.md` when extracting repeated route/action/command mechanics into shared services.
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
- Managed cloud, compute credits, top-ups, subscriptions, and provider-funded compute stay waitlist/private beta until ledgering, abuse, fraud, refunds, chargebacks, provider terms, retention, and deletion controls are proven.
- Do not invent APIs, routes, env vars, schemas, prompts, docs, or release status. If the repo does not prove it, mark it unknown or add a tracked gap.
- Do not mark work complete from build success alone. Inspect relevant files, run surface checks, inspect `git status`/diff, and record unresolved risks.
- Use the nearest path-scoped `AGENTS.md` before editing high-risk areas.

## Surface Subagents

Seven Claude-Code subagent definitions live in `.claude/agents/` and own their surface end-to-end: `desktop-engineer`, `web-engineer`, `mobile-engineer`, `cli-engineer`, `chrome-ext-engineer`, `vscode-ext-engineer`, and `supervisor`. Read the agent file before dispatching so you brief it with the right context.

- Dispatch a single surface engineer for substantial work scoped to one surface.
- Dispatch `supervisor` (delegate-only — does not edit code) when a task touches 2+ surfaces, needs cross-surface synthesis, or is a multi-surface release.
- When the user has narrowed scope to a specific surface ("just apps/desktop", "your specific X"), edit directly instead of spawning the engineer for that surface.

## Required Checks For Agent-Context Changes

```bash
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
pnpm check:service-layer
pnpm check:hooks
```

For implementation work, use the surface commands in `docs/agent-context/commands.json`.
