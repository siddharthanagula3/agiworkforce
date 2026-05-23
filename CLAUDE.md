# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

Claude-specific notes for Claude Code. `AGENTS.md` is the canonical tool-neutral agent entry point — read it first; the repo map, locked product rules, hook policy, and bug-finding workflow live there and in `docs/agent-context/`. This file is a thin adapter for Claude-Code-specific behavior only, and `pnpm check:agent-context` enforces that thinness (it forbids duplicate product/architecture/commands sections here).

The repo is a pnpm + cargo monorepo with seven surfaces under `apps/` (cli, desktop, web, mobile, extension, extension-vscode, sandbox), shared TS under `packages/`, shared Rust under `crates/`, backend stubs in `services/`, and canonical migrations in `supabase/`. Path-scoped `AGENTS.md` files at each high-risk surface (`apps/{cli,desktop,web,mobile,extension,extension-vscode}/AGENTS.md`, `packages/providers/AGENTS.md`, `services/AGENTS.md`) add local rules — read the nearest one before editing.

## Claude-Specific Notes

- Follow `AGENTS.md`, `docs/agent-context/README.md`, `docs/engineering/agent-native-development.md`, and `docs/agent-context/known-flaws.md` before using older launch plans.
- Follow `docs/engineering/agent-harness-rollout.md` for Claude Code-style context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
- Follow `docs/engineering/naming-conventions.md` for product names, CLI command examples, file/folder names, commits, and hooks.
- Follow `docs/engineering/service-layer-architecture.md` when extracting repeated route/action/command mechanics into shared services.
- Read all model IDs from `packages/types/src/models.json` (the canonical catalog). Never invent or hardcode a model ID from training data; the catalog drifts faster than training cutoffs.
- Knowledge cutoff is January 2026; the repo runs months ahead of that. Web-search before stating current facts about competitors, third-party libraries, provider APIs, or platform features.
- **Next.js 16 uses `proxy.ts` (not `middleware.ts`).** The exported function must be named `proxy`. This was renamed upstream by Vercel in Next.js 16 — do NOT rename it back to `middleware.ts`. See: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Keep Claude memory and `.claude/` project files as tool-specific context, not the repo source of truth.
- Do not duplicate repo maps or command lists here. Update `AGENTS.md` and `docs/agent-context/*` instead.
- If Claude Code finds a repeated bug class, update `docs/agent-context/known-flaws.md`.
- If a Claude-specific workflow needs local config, keep it under `.claude/` and document the contract before moving files.

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
