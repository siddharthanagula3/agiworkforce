# CLAUDE.md

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

Claude-specific notes for Claude Code.

`AGENTS.md` is the canonical tool-neutral agent entry point. Read it first, then use this file only for Claude-specific behavior.

## Claude-Specific Notes

- Follow `AGENTS.md`, `docs/agent-context/README.md`, `docs/engineering/agent-native-development.md`, and `docs/agent-context/known-flaws.md` before using older launch plans.
- Follow `docs/engineering/agent-harness-rollout.md` for Claude Code-style context, hooks, skills, plugins, LSP/MCP, and subagent rollout order.
- Follow `docs/engineering/naming-conventions.md` for product names, CLI command examples, file/folder names, commits, and hooks.
- Keep Claude memory and `.claude/` project files as tool-specific context, not the repo source of truth.
- Do not duplicate repo maps or command lists here. Update `AGENTS.md` and `docs/agent-context/*` instead.
- If Claude Code finds a repeated bug class, update `docs/agent-context/known-flaws.md`.
- If a Claude-specific workflow needs local config, keep it under `.claude/` and document the contract before moving files.

## Required Checks For Agent-Context Changes

```bash
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
pnpm check:hooks
```

For implementation work, use the surface commands in `docs/agent-context/commands.json`.
