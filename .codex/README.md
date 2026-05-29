# Codex Adapter

Status: Current
Owner role: Platform lead
Last updated: 2026-05-23
Kind: tool adapter

## Purpose

`.codex/` stores project-shared Codex adapter files. The canonical coding-agent context remains root `AGENTS.md`, scoped `AGENTS.md`, and `docs/agent-context/`; this folder may mirror critical rules but must not become the detailed source of truth.

## Tracked Policy

- Track reusable team agent TOML and sanitized project configuration.
- Do not track local conversations, memories, credentials, or model-provider secrets.
- Keep Codex-specific wording aligned with the tool-neutral repo rules and current `packages/types/src/models.json` catalog policy.

## Verification

- `pnpm check:agent-context`
- `pnpm check:repo-organization`
