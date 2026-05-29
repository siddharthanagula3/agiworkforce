# Claude Code Adapter

Status: Current
Owner role: Platform lead
Last updated: 2026-05-23
Kind: tool adapter

## Purpose

`.claude/` stores project-shared Claude Code adapter files: role prompts, safe project settings, and launch helpers. Durable repo rules live in root `AGENTS.md`, scoped `AGENTS.md`, and `docs/agent-context/`; this folder may mirror critical rules but must not become the detailed source of truth.

## Tracked Policy

- Track reusable team agent prompts and sanitized project settings.
- Do not track local session memory, credentials, transcripts, or personal preferences.
- Do not make this folder the source of truth for repo maps, commands, or product decisions; update `AGENTS.md` and `docs/agent-context/*` first.

## Verification

- `pnpm check:agent-context`
- `pnpm check:repo-organization`
