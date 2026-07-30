# Claude Code Adapter

Status: Current
Owner role: Platform lead
Last updated: 2026-07-14
Kind: tool adapter

## Purpose

`.claude/` stores project-shared Claude Code loader settings and safe launch
helpers. Durable repository rules live in root `AGENTS.md`, path-scoped
`AGENTS.md` files, and `docs/agent-context/`; this folder must not become a
second architecture source of truth.

## Tracked Policy

- Track only reusable, sanitized project settings and hooks.
- Do not track local memory, credentials, transcripts, or personal preferences.
- Update `AGENTS.md` and `docs/agent-context/*` before mirroring any critical
  Claude-specific loader guidance here.
- Do not restore retired per-surface prompt agents; use the canonical repo map,
  lane map, and nearest path-scoped rules.

## Verification

- `pnpm check:agent-context`
- `pnpm check:repo-organization`
