# Codex Adapter

Status: Current
Owner role: Platform lead
Last updated: 2026-05-21
Kind: tool adapter

## Purpose

`.codex/` stores project-shared Codex adapter files. The canonical coding-agent context remains root `AGENTS.md`, scoped `AGENTS.md`, and `docs/agent-context/`.

## Tracked Policy

- Track reusable team agent TOML and sanitized project configuration.
- Do not track local conversations, memories, credentials, or model-provider secrets.
- Keep Codex-specific wording aligned with the tool-neutral repo rules.

## Verification

- `pnpm check:agent-context`
- `pnpm check:repo-organization`
