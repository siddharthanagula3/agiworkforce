# Agent Context

Status: Current
Owner: Platform lead
Last updated: 2026-05-20

This folder is the tool-neutral map for coding agents. Codex, Claude Code, Cursor, VS Code agents, opencode, and future agents should read this before deep exploration.

## Read Order

1. Root `AGENTS.md` - canonical operating rules for all coding agents.
2. `repo-map.json` - where product and platform code lives.
3. `commands.json` - exact commands by surface.
4. `risk-map.json` - high-risk areas and required checks.
5. `known-flaws.md` - open issues and stale claims agents should not rediscover as new.
6. `doc-status.json` - which docs are current, historical, or working notes.
7. `bug-finding-guide.md` - workflow for finding bugs without getting lost in stale docs.

## Rules

- Treat `AGENTS.md` as canonical. Tool-specific files such as `CLAUDE.md` must point back to it.
- If a bug is already listed in `known-flaws.md`, update its status instead of creating a duplicate finding.
- If a source-of-truth conflict appears, prefer `docs/decisions/CURRENT_DECISIONS.md`, `PLAN.md`, and this folder over older launch plans.
- Keep JSON files parseable without comments.
